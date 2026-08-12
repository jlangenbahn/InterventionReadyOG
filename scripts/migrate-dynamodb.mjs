/**
 * Copy Gen1 ReadyOG DynamoDB tables into InterventionReadyOG Gen2 tables.
 * Source: *-6cvcpcvgbjdq3evrmqh4zyw4oi-dev
 * Target: *-euenax4zincktkia5wmepvdhii-NONE
 */
import {
  DynamoDBClient,
  ScanCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = 'us-east-2';
const SOURCE_SUFFIX = '6cvcpcvgbjdq3evrmqh4zyw4oi-dev';
const TARGET_SUFFIX = 'euenax4zincktkia5wmepvdhii-NONE';

const MODELS = [
  'Concept',
  'Word',
  'Sentence',
  'Passage',
  'Lesson',
  'List',
  'Student',
  'GenerateDocument',
  'ConceptWord',
  'WordList',
  'SentenceWord',
  'SentenceConcept',
  'SentenceLesson',
  'ConceptLesson',
  'PassageLesson',
  'ListLesson',
  'StudentConcept',
];

const INT_FIELDS = new Set([
  'wordCount',
  'downvotes',
  'upvotes',
  'minutes',
  'rating',
  'lessonNumber',
]);

const client = new DynamoDBClient({ region: REGION });

function transformItem(model, item) {
  const out = { ...item };

  if (!out.__typename) {
    out.__typename = { S: model };
  }

  if (model === 'Concept') {
    if (out.Level && !out.level) {
      out.level = out.Level;
      delete out.Level;
    }
    if (out.TrainingURL && !out.trainingResources) {
      // Gen2 field is json; store URL string as JSON string value
      out.trainingResources = { S: JSON.stringify(out.TrainingURL.S ?? out.TrainingURL) };
      delete out.TrainingURL;
    }
  }

  for (const field of INT_FIELDS) {
    if (out[field]?.S != null && out[field].S !== '' && !Number.isNaN(Number(out[field].S))) {
      out[field] = { N: String(Number(out[field].S)) };
    }
  }

  // Drop null AttributeValues that can break writes
  for (const [key, value] of Object.entries(out)) {
    if (value && typeof value === 'object' && 'NULL' in value && value.NULL === true) {
      delete out[key];
    }
  }

  return out;
}

async function scanAll(tableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
      }),
    );
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function batchWrite(tableName, items) {
  let written = 0;
  for (let i = 0; i < items.length; i += 25) {
    let batch = items.slice(i, i + 25).map((Item) => ({
      PutRequest: { Item },
    }));

    let attempts = 0;
    while (batch.length > 0 && attempts < 8) {
      const res = await client.send(
        new BatchWriteItemCommand({
          RequestItems: { [tableName]: batch },
        }),
      );
      const unprocessed = res.UnprocessedItems?.[tableName] ?? [];
      written += batch.length - unprocessed.length;
      batch = unprocessed;
      if (batch.length > 0) {
        attempts += 1;
        await new Promise((r) => setTimeout(r, 200 * attempts));
      }
    }

    if (batch.length > 0) {
      throw new Error(`Failed to write ${batch.length} items to ${tableName} after retries`);
    }
  }
  return written;
}

async function migrateModel(model) {
  const source = `${model}-${SOURCE_SUFFIX}`;
  const target = `${model}-${TARGET_SUFFIX}`;
  process.stdout.write(`\n${model}: scanning ${source}... `);
  const raw = await scanAll(source);
  process.stdout.write(`found ${raw.length}. writing to ${target}... `);
  if (raw.length === 0) {
    console.log('skip (empty)');
    return { model, sourceCount: 0, written: 0 };
  }
  const transformed = raw.map((item) => transformItem(model, item));
  const written = await batchWrite(target, transformed);
  console.log(`wrote ${written}`);
  return { model, sourceCount: raw.length, written };
}

async function main() {
  console.log('Migrating DynamoDB Gen1 -> Gen2');
  console.log(`Source suffix: ${SOURCE_SUFFIX}`);
  console.log(`Target suffix: ${TARGET_SUFFIX}`);

  const results = [];
  for (const model of MODELS) {
    results.push(await migrateModel(model));
  }

  console.log('\n=== Summary ===');
  let totalIn = 0;
  let totalOut = 0;
  for (const r of results) {
    console.log(`${r.model}: ${r.sourceCount} -> ${r.written}`);
    totalIn += r.sourceCount;
    totalOut += r.written;
  }
  console.log(`TOTAL: ${totalIn} -> ${totalOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
