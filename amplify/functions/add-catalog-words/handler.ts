/**
 * Bedrock Converse catalog expander: load existing words, ask Claude Haiku 4.5
 * for net-new real English words, then write Word rows (untagged, undefined).
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  ScanCommand,
  type AttributeValue,
  type WriteRequest,
} from '@aws-sdk/client-dynamodb';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const ADD_SIZES = new Set([10, 25, 100]);
const DEFAULT_COUNT = 25;
const TOTAL_SEGMENTS = 26;
const WORD_PATTERN = /^[a-z]+(?:['-][a-z]+)?$/;
const SYSTEM_PROMPT = `You are an expert Orton-Gillingham curriculum writer expanding a shared word catalog.

Return only real English words that are useful for OG decoding and encoding practice.

Rules:
- Never repeat a word from the existing catalog list. Matching is case-insensitive.
- Return one-token base words only. No phrases, no proper names, no slang, no nonsense tokens.
- Letters only, except an apostrophe or hyphen when it is part of a real English word.
- Prefer common classroom words that practice the provided catalog concepts (short vowels, blends, digraphs, syllable types, morphology, and so on).
- Spread new words across different concepts rather than clustering on one pattern.
- Do not tag words and do not invent concept ids. Return spellings only.
- Return more candidates than requested when you can, so duplicates can be dropped. Aim for the requested count of unique new words.`;

const RETURN_RESULT_TOOL = {
  toolSpec: {
    name: 'return_result',
    description: 'Return new catalog word spellings that are not already in the database.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          words: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['words'],
      },
    },
  },
};

const bedrock = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});
const dynamo = new DynamoDBClient({});

type AddResult = {
  createdCount: number;
  message: string;
};

type AddEvent = {
  arguments?: {
    count?: number | null;
  };
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

function resolveCount(raw: unknown) {
  const number = Number(raw);
  return ADD_SIZES.has(number) ? number : DEFAULT_COUNT;
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function isUsableWord(value: string) {
  const label = normalizeLabel(value);
  if (label.length < 2 || label.length > 18) return false;
  return WORD_PATTERN.test(label);
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

function toolUseInput(response: {
  output?: { message?: { content?: Array<{ toolUse?: { input?: unknown } }> } };
}): Record<string, unknown> | null {
  const input = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse?.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

async function scanSegment(
  tableName: string,
  segment: number,
  fields: string[],
): Promise<Record<string, AttributeValue>[]> {
  const projection = projectionFor(fields);
  const items: Record<string, AttributeValue>[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: projection.ProjectionExpression,
        ExpressionAttributeNames: projection.ExpressionAttributeNames,
        ExclusiveStartKey: exclusiveStartKey,
        TotalSegments: TOTAL_SEGMENTS,
        Segment: segment,
      }),
    );
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

async function scanAll(tableName: string, fields: string[]) {
  const segments = await Promise.all(
    Array.from({ length: TOTAL_SEGMENTS }, (_, segment) => scanSegment(tableName, segment, fields)),
  );
  return segments.flat();
}

function parseProposedWords(raw: Record<string, unknown> | null, existing: Set<string>, limit: number) {
  const list = Array.isArray(raw?.words) ? raw.words : [];
  const accepted: string[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const label = normalizeLabel(String(row ?? ''));
    if (!isUsableWord(label)) continue;
    if (existing.has(label) || seen.has(label)) continue;
    seen.add(label);
    accepted.push(label);
    if (accepted.length >= limit) break;
  }
  return accepted;
}

async function putWords(tableName: string, labels: string[]) {
  const now = new Date().toISOString();
  const requests: WriteRequest[] = labels.map((word) => ({
    PutRequest: {
      Item: {
        id: { S: newId() },
        word: { S: word },
        isNonsenseWord: { BOOL: false },
        createdAt: { S: now },
        updatedAt: { S: now },
        __typename: { S: 'Word' },
      },
    },
  }));

  for (let index = 0; index < requests.length; index += 25) {
    let pending: Record<string, WriteRequest[]> = {
      [tableName]: requests.slice(index, index + 25),
    };
    for (let attempt = 0; attempt < 5 && pending[tableName]?.length; attempt += 1) {
      const result = await dynamo.send(new BatchWriteItemCommand({ RequestItems: pending }));
      const leftover = result.UnprocessedItems?.[tableName] ?? [];
      pending = leftover.length ? { [tableName]: leftover } : {};
      if (pending[tableName]?.length) {
        await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
      }
    }
  }
}

export const handler = async (event: AddEvent): Promise<AddResult> => {
  const wordTable = envVar('WORD_TABLE_NAME');
  const conceptTable = envVar('CONCEPT_TABLE_NAME');
  if (!wordTable || !conceptTable) {
    throw new Error('Add catalog words is not configured in this environment.');
  }

  const count = resolveCount(event.arguments?.count);
  const [wordItems, conceptItems] = await Promise.all([
    scanAll(wordTable, ['id', 'word']),
    scanAll(conceptTable, ['id', 'concept', 'category', 'subcategory', 'level']),
  ]);

  const existingLabels = wordItems
    .map((item) => normalizeLabel(attrString(item, 'word')))
    .filter(Boolean);
  const existing = new Set(existingLabels);
  const concepts = conceptItems
    .map((item) => ({
      id: attrString(item, 'id'),
      concept: attrString(item, 'concept'),
      category: attrString(item, 'category'),
      subcategory: attrString(item, 'subcategory'),
      level: attrString(item, 'level'),
    }))
    .filter((concept) => concept.id && concept.concept)
    .sort((a, b) => a.concept.localeCompare(b.concept));

  const userText = `Add ${count} net-new real English catalog words.

The existing catalog already has ${existing.size} word${existing.size === 1 ? '' : 's'}. Do not repeat any of them:
${existingLabels.sort().join('\n')}

Prefer words that practice these catalog concepts. Do not tag the words; spellings only:
${JSON.stringify(concepts)}

Return at least ${count} unique new words, and a few extras if you can.`;

  let parsed: Record<string, unknown> | null = null;
  try {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: count >= 100 ? 4096 : 2048,
          temperature: 0.6,
        },
        toolConfig: {
          tools: [RETURN_RESULT_TOOL],
          toolChoice: { tool: { name: 'return_result' } },
        },
      }),
    );
    parsed = toolUseInput(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock add-words generation failed';
    console.error('addCatalogWords converse failed', err);
    throw new Error(message);
  }

  if (!parsed) {
    throw new Error('The add-words model did not return a structured result. Try again.');
  }

  const labels = parseProposedWords(parsed, existing, count);
  if (!labels.length) {
    return {
      createdCount: 0,
      message: 'No new words were added. Every suggestion was already in the catalog or was not a usable English word. Try again.',
    };
  }

  await putWords(wordTable, labels);
  const preview = labels.slice(0, 8).join(', ');
  const extra = labels.length > 8 ? '…' : '';
  return {
    createdCount: labels.length,
    message:
      labels.length === count
        ? `Added ${labels.length} new catalog word${labels.length === 1 ? '' : 's'} (${preview}${extra}). Next, write dictionary definitions, then run an audit to tag them.`
        : `Added ${labels.length} of ${count} requested catalog words (${preview}${extra}). Next, write dictionary definitions, then run an audit to tag them.`,
  };
};
