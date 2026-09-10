/**
 * Bedrock Converse audit: sample catalog words, ask Claude Haiku 4.5 for
 * ADD/REMOVE concept tags, then write OPEN DataQualityFinding rows.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const WORD_BATCH_SIZE = 10;
const SYSTEM_PROMPT = `You are an expert Orton-Gillingham practitioner and catalog editor.
You review word-to-concept tags in a shared intervention word bank.

Recommend only high-confidence corrections:
- ADD a concept when the word clearly practices that grapheme, phonogram, morpheme, or syllable pattern and it is missing.
- REMOVE a concept when the current tag is wrong, misleading, or does not match how the word is actually decoded or spelled.
- Do not invent concept ids. Use only ids from the provided catalog.
- Do not flag a word that is already tagged correctly.
- Prefer precision over volume. It is better to return fewer findings than noisy ones.
- confidence is a number from 0 to 1.

Return ONLY JSON with this exact shape and no markdown:
{"findings":[{"wordId":"","recommendedConceptId":"","actionType":"ADD","reason":"","confidence":0.0}]}`;

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
};

type CatalogWord = {
  id: string;
  word: string;
  isNonsenseWord: boolean;
  taggedConcepts: CatalogConcept[];
};

type ModelFinding = {
  wordId: string;
  recommendedConceptId: string;
  actionType: 'ADD' | 'REMOVE';
  reason: string;
  confidence: number;
};

function envVar(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return String(env?.[name] ?? '').trim();
}

function newId() {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

async function scanAll(
  tableName: string,
  fields: string[],
  options: {
    filterExpression?: string;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, AttributeValue>;
    limit?: number;
  } = {},
) {
  const projection = projectionFor(fields);
  const items: Record<string, AttributeValue>[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: projection.ProjectionExpression,
        ExpressionAttributeNames: {
          ...projection.ExpressionAttributeNames,
          ...options.expressionAttributeNames,
        },
        FilterExpression: options.filterExpression,
        ExpressionAttributeValues: options.expressionAttributeValues,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: options.limit,
      }),
    );
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
    if (options.limit && items.length >= options.limit && !options.filterExpression) break;
  } while (exclusiveStartKey);
  return items;
}

async function scanWords(tableName: string, limit: number): Promise<CatalogWord[]> {
  const projection = projectionFor(['id', 'word', 'isNonsenseWord']);
  const words: CatalogWord[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: projection.ProjectionExpression,
        ExpressionAttributeNames: projection.ExpressionAttributeNames,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: Math.max(limit - words.length, 1) * 2,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = attrString(item, 'id');
      const word = attrString(item, 'word');
      if (!id || !word) continue;
      words.push({
        id,
        word,
        isNonsenseWord: item.isNonsenseWord?.BOOL === true,
        taggedConcepts: [],
      });
      if (words.length >= limit) return words;
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return words;
}

function parseConcepts(items: Record<string, AttributeValue>[]): CatalogConcept[] {
  return items
    .map((item) => ({
      id: attrString(item, 'id'),
      concept: attrString(item, 'concept') || 'Untitled concept',
      category: attrString(item, 'category'),
      subcategory: attrString(item, 'subcategory'),
      level: attrString(item, 'level'),
    }))
    .filter((concept) => concept.id)
    .sort((a, b) => a.concept.localeCompare(b.concept));
}

function inValues(ids: string[], prefix: string) {
  const names: string[] = [];
  const values: Record<string, AttributeValue> = {};
  ids.forEach((id, index) => {
    const key = `:${prefix}${index}`;
    names.push(key);
    values[key] = { S: id };
  });
  return { names, values };
}

function normalizeConfidence(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1 && number <= 100) return Math.min(1, Math.max(0, number / 100));
  return Math.min(1, Math.max(0, number));
}

function parseFindings(raw: Record<string, unknown> | null, words: CatalogWord[], conceptsById: Map<string, CatalogConcept>) {
  const wordIds = new Set(words.map((word) => word.id));
  const tagged = new Map(words.map((word) => [word.id, new Set(word.taggedConcepts.map((concept) => concept.id))]));
  const list = Array.isArray(raw?.findings) ? raw.findings : [];
  const findings: ModelFinding[] = [];

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const wordId = String(item.wordId ?? '').trim();
    const recommendedConceptId = String(item.recommendedConceptId ?? '').trim();
    const actionType = String(item.actionType ?? '').trim().toUpperCase();
    const reason = String(item.reason ?? '').trim();
    const confidence = normalizeConfidence(item.confidence);
    if (!wordIds.has(wordId)) continue;
    if (!conceptsById.has(recommendedConceptId)) continue;
    if (actionType !== 'ADD' && actionType !== 'REMOVE') continue;
    if (!reason || confidence == null) continue;
    const alreadyTagged = tagged.get(wordId)?.has(recommendedConceptId) ?? false;
    if (actionType === 'ADD' && alreadyTagged) continue;
    if (actionType === 'REMOVE' && !alreadyTagged) continue;
    findings.push({
      wordId,
      recommendedConceptId,
      actionType,
      reason,
      confidence,
    });
  }
  return findings;
}

export const handler = async (): Promise<AuditResult> => {
  const wordTable = envVar('WORD_TABLE_NAME');
  const conceptTable = envVar('CONCEPT_TABLE_NAME');
  const conceptWordTable = envVar('CONCEPT_WORD_TABLE_NAME');
  const findingTable = envVar('FINDING_TABLE_NAME');
  if (!wordTable || !conceptTable || !conceptWordTable || !findingTable) {
    throw new Error('Data quality audit is not configured in this environment.');
  }

  const [wordRows, conceptItems] = await Promise.all([
    scanWords(wordTable, WORD_BATCH_SIZE),
    scanAll(conceptTable, ['id', 'concept', 'category', 'subcategory', 'level']),
  ]);
  const concepts = parseConcepts(conceptItems);
  const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));

  if (!wordRows.length) {
    return { createdCount: 0, message: 'No catalog words were available to audit.' };
  }
  if (!concepts.length) {
    return { createdCount: 0, message: 'No catalog concepts were available to audit.' };
  }

  const { names, values } = inValues(wordRows.map((word) => word.id), 'w');
  const linkItems = await scanAll(conceptWordTable, ['id', 'wordId', 'conceptId'], {
    filterExpression: `#wordId IN (${names.join(', ')})`,
    expressionAttributeNames: { '#wordId': 'wordId' },
    expressionAttributeValues: values,
  });
  const wordsById = new Map(wordRows.map((word) => [word.id, word]));
  for (const link of linkItems) {
    const word = wordsById.get(attrString(link, 'wordId'));
    const concept = conceptsById.get(attrString(link, 'conceptId'));
    if (!word || !concept) continue;
    if (word.taggedConcepts.some((item) => item.id === concept.id)) continue;
    word.taggedConcepts.push(concept);
  }

  const userText = `Catalog concepts (use these ids only):
${JSON.stringify(concepts.map((concept) => ({
  id: concept.id,
  concept: concept.concept,
  category: concept.category,
  subcategory: concept.subcategory,
  level: concept.level,
})))}

Word batch with current tags:
${JSON.stringify(wordRows.map((word) => ({
  wordId: word.id,
  word: word.word,
  isNonsenseWord: word.isNonsenseWord,
  taggedConcepts: word.taggedConcepts.map((concept) => ({
    id: concept.id,
    concept: concept.concept,
    category: concept.category,
    level: concept.level,
  })),
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
    const message = err instanceof Error ? err.message : 'Bedrock audit failed';
    console.error('runDataQualityAudit converse failed', err);
    throw new Error(message);
  }

  const parsed = parseJsonObject(responseText);
  if (!parsed) {
    throw new Error('The audit model did not return valid JSON. Try again.');
  }

  const findings = parseFindings(parsed, wordRows, conceptsById);
  const now = new Date().toISOString();

  for (const finding of findings) {
    await dynamo.send(
      new PutItemCommand({
        TableName: findingTable,
        Item: {
          id: { S: newId() },
          wordId: { S: finding.wordId },
          recommendedConceptId: { S: finding.recommendedConceptId },
          actionType: { S: finding.actionType },
          reason: { S: finding.reason },
          status: { S: 'OPEN' },
          confidence: { N: String(finding.confidence) },
          createdAt: { S: now },
          updatedAt: { S: now },
          __typename: { S: 'DataQualityFinding' },
        },
      }),
    );
  }

  return {
    createdCount: findings.length,
    message:
      findings.length === 0
        ? `Audited ${wordRows.length} words. No high-confidence corrections were suggested.`
        : `Audited ${wordRows.length} words and created ${findings.length} finding${findings.length === 1 ? '' : 's'}.`,
  };
};
