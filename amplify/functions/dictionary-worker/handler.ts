/**
 * SQS-triggered dictionary worker. Processes one message (up to 10 word ids),
 * writes Word.dictionaryData, and atomically increments BatchJob.processedCount.
 */
import {
  DynamoDBClient,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  envVar,
  runDictionaryGeneration,
  uniqueIds,
} from '../_shared/dictionaryDefinitions';

const dynamo = new DynamoDBClient({});

type SqsRecord = {
  messageId?: string;
  body?: string;
};

type SqsEvent = {
  Records?: SqsRecord[];
};

type WorkerMessage = {
  jobId?: unknown;
  wordId?: unknown;
  wordIds?: unknown;
};

function parseMessage(body: string): { jobId: string; wordIds: string[] } {
  let parsed: WorkerMessage;
  try {
    parsed = JSON.parse(body) as WorkerMessage;
  } catch (err) {
    console.error('dictionary-worker failed to parse SQS body', { body, error: err });
    throw new Error('Dictionary worker received a malformed SQS message.');
  }
  const jobId = String(parsed.jobId ?? '').trim();
  const fromArray = Array.isArray(parsed.wordIds) ? parsed.wordIds : [];
  const wordIds = uniqueIds([
    ...fromArray.map((value) => (value == null ? '' : String(value))),
    String(parsed.wordId ?? ''),
  ]);
  if (!wordIds.length) {
    console.error('dictionary-worker message had no word ids', { jobId, body });
    throw new Error('Dictionary worker received a message with no word ids.');
  }
  return { jobId, wordIds };
}

async function incrementProcessedCount(jobId: string, amount: number) {
  const tableName = envVar('BATCH_JOB_TABLE_NAME');
  if (!jobId || !tableName || amount <= 0) return;
  const now = new Date().toISOString();
  try {
    const result = await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { id: { S: jobId } },
        UpdateExpression: 'ADD processedCount :n SET #updatedAt = :now',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: {
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':n': { N: String(amount) },
          ':now': { S: now },
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const processed = Number(result.Attributes?.processedCount?.N ?? 0);
    const total = Number(result.Attributes?.totalCount?.N ?? 0);
    const status = String(result.Attributes?.status?.S ?? '');
    if (total > 0 && processed >= total && status !== 'COMPLETED') {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: { id: { S: jobId } },
          UpdateExpression: 'SET #status = :completed, #updatedAt = :now',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':completed': { S: 'COMPLETED' },
            ':now': { S: now },
          },
        }),
      );
    }
  } catch (err) {
    console.error('dictionary-worker failed to increment BatchJob', {
      jobId,
      amount,
      error: err instanceof Error ? err.message : err,
    });
    throw err;
  }
}

export const handler = async (event: SqsEvent): Promise<void> => {
  const records = event.Records ?? [];
  for (const record of records) {
    const { jobId, wordIds } = parseMessage(String(record.body ?? ''));
    try {
      const result = await runDictionaryGeneration(wordIds, { requireEntries: false });
      console.log('dictionary-worker processed batch', {
        messageId: record.messageId,
        jobId,
        requested: wordIds.length,
        createdCount: result.createdCount,
      });
      await incrementProcessedCount(jobId, result.processedCount || wordIds.length);
    } catch (err) {
      console.error('dictionary-worker failed to process word batch', {
        messageId: record.messageId,
        jobId,
        wordIds,
        error: err instanceof Error ? err.message : err,
      });
      throw err;
    }
  }
};
