/**
 * Scan Word for missing dictionaryData, create a BatchJob, and enqueue id
 * chunks to DictionaryMegaBatchQueue.
 */
import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import {
  SQSClient,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs';
import {
  DICTIONARY_BATCH_LIMIT,
  envVar,
  parseDictionaryData,
} from '../_shared/dictionaryDefinitions';

export const DICTIONARY_MEGA_BATCH_TYPE = 'DICTIONARY_MEGA_BATCH';
export const BATCH_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

const SCAN_SEGMENTS = 4;
const SQS_BATCH_SIZE = 10;
const SEND_CONCURRENCY = 5;

const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});

type BatchJobRecord = {
  __typename: 'BatchJob';
  id: string;
  type: string;
  status: string;
  totalCount: number;
  processedCount: number;
  startTime: string;
  createdAt: string;
  updatedAt: string;
};

function attrString(item: Record<string, AttributeValue> | undefined, key: string) {
  return String(item?.[key]?.S ?? '').trim();
}

function randomId() {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function scanSegment(tableName: string, segment: number, totalSegments: number) {
  const ids: string[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        Segment: segment,
        TotalSegments: totalSegments,
        ProjectionExpression: '#id, #word, #isNonsenseWord, #dictionaryData',
        ExpressionAttributeNames: {
          '#id': 'id',
          '#word': 'word',
          '#isNonsenseWord': 'isNonsenseWord',
          '#dictionaryData': 'dictionaryData',
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = attrString(item, 'id');
      const word = attrString(item, 'word');
      if (!id || !word) continue;
      if (item.isNonsenseWord?.BOOL === true) continue;
      if (parseDictionaryData(attrString(item, 'dictionaryData') || null)) continue;
      ids.push(id);
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return ids;
}

async function scanWordsNeedingDictionary(tableName: string) {
  const segments = await Promise.all(
    Array.from({ length: SCAN_SEGMENTS }, (_, segment) =>
      scanSegment(tableName, segment, SCAN_SEGMENTS),
    ),
  );
  return [...new Set(segments.flat())];
}

async function findActiveJob(tableName: string): Promise<BatchJobRecord | null> {
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: '#id, #type, #status, totalCount, processedCount, startTime, createdAt, updatedAt',
        FilterExpression: '#type = :type AND #status = :status',
        ExpressionAttributeNames: {
          '#id': 'id',
          '#type': 'type',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':type': { S: DICTIONARY_MEGA_BATCH_TYPE },
          ':status': { S: BATCH_STATUS.IN_PROGRESS },
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const item = result.Items?.[0];
    if (item) {
      return {
        __typename: 'BatchJob',
        id: attrString(item, 'id'),
        type: attrString(item, 'type') || DICTIONARY_MEGA_BATCH_TYPE,
        status: attrString(item, 'status') || BATCH_STATUS.IN_PROGRESS,
        totalCount: Number(item.totalCount?.N ?? 0),
        processedCount: Number(item.processedCount?.N ?? 0),
        startTime: attrString(item, 'startTime'),
        createdAt: attrString(item, 'createdAt'),
        updatedAt: attrString(item, 'updatedAt'),
      };
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return null;
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

async function enqueueWordIds(queueUrl: string, jobId: string, wordIds: string[]) {
  const messages = chunk(wordIds, DICTIONARY_BATCH_LIMIT).map((ids, index) => ({
    Id: String(index),
    MessageBody: JSON.stringify({ jobId, wordIds: ids }),
  }));
  const sqsBatches = chunk(messages, SQS_BATCH_SIZE);
  for (let i = 0; i < sqsBatches.length; i += SEND_CONCURRENCY) {
    const wave = sqsBatches.slice(i, i + SEND_CONCURRENCY);
    await Promise.all(
      wave.map(async (Entries, waveIndex) => {
        const result = await sqs.send(
          new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: Entries.map((entry, entryIndex) => ({
              ...entry,
              Id: `m${i + waveIndex}-${entryIndex}`,
            })),
          }),
        );
        if (result.Failed?.length) {
          console.error('startDictionaryMegaBatch SQS batch had failures', result.Failed);
          throw new Error('Failed to enqueue one or more dictionary batches.');
        }
      }),
    );
  }
}

async function putBatchJob(tableName: string, job: BatchJobRecord) {
  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        id: { S: job.id },
        type: { S: job.type },
        status: { S: job.status },
        totalCount: { N: String(job.totalCount) },
        processedCount: { N: String(job.processedCount) },
        startTime: { S: job.startTime },
        createdAt: { S: job.createdAt },
        updatedAt: { S: job.updatedAt },
        __typename: { S: 'BatchJob' },
      },
    }),
  );
}

export const handler = async (): Promise<BatchJobRecord> => {
  const wordTable = envVar('WORD_TABLE_NAME');
  const jobTable = envVar('BATCH_JOB_TABLE_NAME');
  const queueUrl = envVar('DICTIONARY_QUEUE_URL');
  if (!wordTable || !jobTable || !queueUrl) {
    throw new Error('Dictionary mega batch is not configured in this environment.');
  }

  const active = await findActiveJob(jobTable);
  if (active) return active;

  const wordIds = await scanWordsNeedingDictionary(wordTable);
  const now = new Date().toISOString();
  const job: BatchJobRecord = {
    __typename: 'BatchJob',
    id: randomId(),
    type: DICTIONARY_MEGA_BATCH_TYPE,
    status: wordIds.length ? BATCH_STATUS.IN_PROGRESS : BATCH_STATUS.COMPLETED,
    totalCount: wordIds.length,
    processedCount: 0,
    startTime: now,
    createdAt: now,
    updatedAt: now,
  };

  await putBatchJob(jobTable, job);
  if (wordIds.length) {
    try {
      await enqueueWordIds(queueUrl, job.id, wordIds);
    } catch (err) {
      console.error('startDictionaryMegaBatch failed to enqueue word ids', err);
      const failedAt = new Date().toISOString();
      await putBatchJob(jobTable, {
        ...job,
        status: BATCH_STATUS.FAILED,
        updatedAt: failedAt,
      });
      throw err;
    }
  }

  return job;
};
