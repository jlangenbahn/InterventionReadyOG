/**
 * Bedrock Converse OG descriptions: sample concepts, generate a strict
 * phonetic rule, then overwrite Concept.ogDescription in place.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const CONCEPT_BATCH_SIZE = 10;
const SYSTEM_PROMPT = `You are an expert Orton-Gillingham trainer writing instructor-facing concept rules.

For each concept, write a strict OG phonetic or orthographic rule definition:
- Base the rule on the concept name, category, subcategory, and level.
- Describe the grapheme, phonogram, morpheme, or syllable pattern, how it is taught, and typical constraints (position, voiced/unvoiced, syllable type, common exceptions).
- Do not write a dictionary definition of an example word. Write the teaching rule.
- Keep each description to 1-3 sentences.
- Do not invent concept ids. Use only ids from the provided catalog.

Return ONLY JSON with this exact shape and no markdown:
{"descriptions":[{"conceptId":"","ogDescription":""}]}`;

const bedrock = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});
const dynamo = new DynamoDBClient({});

type AuditResult = {
  createdCount: number;
  message: string;
};

type CatalogConcept = {
  id: string;
  concept: string;
  category: string;
  subcategory: string;
  level: string;
  definition: string;
};

type ModelDescription = {
  conceptId: string;
  ogDescription: string;
};

function envVar(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return String(env?.[name] ?? '').trim();
}

function attrString(item: Record<string, AttributeValue> | undefined, key: string) {
  return String(item?.[key]?.S ?? '').trim();
}

function converseText(response: { output?: { message?: { content?: Array<{ text?: string }> } } }) {
  return (response.output?.message?.content ?? [])
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
    .trim();
}

function parseJsonObject(text: string) {
  const trimmed = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function projectionFor(fields: string[]) {
  const expressionAttributeNames: Record<string, string> = {};
  const tokens = fields.map((field) => {
    const alias = `#${field}`;
    expressionAttributeNames[alias] = field;
    return alias;
  });
  return {
    ProjectionExpression: tokens.join(', '),
    ExpressionAttributeNames: expressionAttributeNames,
  };
}

async function scanConcepts(tableName: string, limit: number): Promise<CatalogConcept[]> {
  const projection = projectionFor(['id', 'concept', 'category', 'subcategory', 'level', 'definition']);
  const concepts: CatalogConcept[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: projection.ProjectionExpression,
        ExpressionAttributeNames: projection.ExpressionAttributeNames,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: Math.max(limit - concepts.length, 1) * 2,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = attrString(item, 'id');
      const concept = attrString(item, 'concept');
      if (!id || !concept) continue;
      concepts.push({
        id,
        concept,
        category: attrString(item, 'category'),
        subcategory: attrString(item, 'subcategory'),
        level: attrString(item, 'level'),
        definition: attrString(item, 'definition'),
      });
      if (concepts.length >= limit) return concepts;
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return concepts;
}

function parseDescriptions(raw: Record<string, unknown> | null, concepts: CatalogConcept[]) {
  const ids = new Set(concepts.map((concept) => concept.id));
  const list = Array.isArray(raw?.descriptions) ? raw.descriptions : [];
  const descriptions: ModelDescription[] = [];

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const conceptId = String(item.conceptId ?? '').trim();
    const ogDescription = String(item.ogDescription ?? '').trim();
    if (!ids.has(conceptId) || !ogDescription) continue;
    descriptions.push({ conceptId, ogDescription });
  }
  return descriptions;
}

export const handler = async (): Promise<AuditResult> => {
  const conceptTable = envVar('CONCEPT_TABLE_NAME');
  if (!conceptTable) {
    throw new Error('Concept description generation is not configured in this environment.');
  }

  const concepts = await scanConcepts(conceptTable, CONCEPT_BATCH_SIZE);
  if (!concepts.length) {
    return { createdCount: 0, message: 'No catalog concepts were available to describe.' };
  }

  const userText = `Write OG rule descriptions for this concept batch:
${JSON.stringify(concepts.map((concept) => ({
  conceptId: concept.id,
  concept: concept.concept,
  category: concept.category,
  subcategory: concept.subcategory,
  level: concept.level,
  definition: concept.definition,
})))}

Return JSON only.`;

  let responseText = '';
  try {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.2,
        },
      }),
    );
    responseText = converseText(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock description generation failed';
    console.error('generateConceptDescriptions converse failed', err);
    throw new Error(message);
  }

  const parsed = parseJsonObject(responseText);
  if (!parsed) {
    throw new Error('The description model did not return valid JSON. Try again.');
  }

  const descriptions = parseDescriptions(parsed, concepts);
  const now = new Date().toISOString();
  let updated = 0;

  for (const row of descriptions) {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: conceptTable,
        Key: { id: { S: row.conceptId } },
        UpdateExpression: 'SET #ogDescription = :desc, #updatedAt = :now',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: {
          '#ogDescription': 'ogDescription',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':desc': { S: row.ogDescription },
          ':now': { S: now },
        },
      }),
    );
    updated += 1;
  }

  return {
    createdCount: updated,
    message:
      updated === 0
        ? `Reviewed ${concepts.length} concepts. No OG descriptions were written.`
        : `Wrote OG descriptions for ${updated} concept${updated === 1 ? '' : 's'}.`,
  };
};
