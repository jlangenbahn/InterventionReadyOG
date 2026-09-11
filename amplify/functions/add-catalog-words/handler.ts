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
const INCLUDE_EXISTING_LIMIT = 180;
const WORD_PATTERN = /^[a-z]+(?:['-][a-z]+)*$/;
const SYSTEM_PROMPT = `You are an expert Orton-Gillingham curriculum writer expanding a shared word catalog.

Return only real English words that are useful for OG decoding and encoding practice.

Rules:
- Every word must be new to this catalog. Do not return a word that already exists.
- Return one-token base words only. No phrases, no proper names, no slang, no nonsense tokens.
- Letters only, except an apostrophe or hyphen when it is part of a real English word.
- Prefer less-common classroom words and later OG patterns (vowel teams, r-controlled vowels, consonant-le, prefixes/suffixes, syllable types, morphology). Avoid the obvious CVC set (cat, sat, hat, pig, dog, run) unless the catalog is still tiny.
- Spread new words across different concepts rather than clustering on one pattern.
- Do not tag words and do not invent concept ids. Return an array of plain spelling strings only.
- Return more candidates than requested so duplicates can be dropped.`;

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
            description: 'Plain spelling strings only, for example ["blight", "freight"].',
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

function parseJsonValue(raw: unknown): unknown {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    if (current == null) return null;
    if (typeof current === 'object') return current;
    if (typeof current !== 'string') return null;
    const text = current.trim();
    if (!text) return null;
    try {
      current = JSON.parse(text);
    } catch {
      return current;
    }
  }
  return current;
}

function toolUseInput(response: {
  output?: { message?: { content?: Array<{ toolUse?: { input?: unknown } }> } };
}): Record<string, unknown> | null {
  const input = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse?.input;
  const parsed = parseJsonValue(input);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function collectLabels(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parsed = parseJsonValue(trimmed);
    if (parsed !== trimmed) return collectLabels(parsed);
    return trimmed.split(/[\n,;]+/).map((part) => part.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) return raw.flatMap((item) => collectLabels(item));
  if (typeof raw === 'object') {
    const item = raw as Record<string, unknown>;
    if (item.words != null) return collectLabels(item.words);
    if (item.word != null) return collectLabels(item.word);
    if (item.spelling != null) return collectLabels(item.spelling);
    return [];
  }
  return [String(raw)];
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

function shuffle<T>(items: T[]) {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i];
    next[i] = next[j];
    next[j] = current;
  }
  return next;
}

function candidateCount(requested: number) {
  if (requested >= 100) return 160;
  if (requested >= 25) return 60;
  return 30;
}

function parseProposedWords(raw: unknown, existing: Set<string>, limit: number) {
  const proposed = collectLabels(raw).map(normalizeLabel).filter(Boolean);
  const accepted: string[] = [];
  const seen = new Set<string>();
  let duplicate = 0;
  let invalid = 0;
  for (const label of proposed) {
    if (!isUsableWord(label)) {
      invalid += 1;
      continue;
    }
    if (existing.has(label) || seen.has(label)) {
      duplicate += 1;
      continue;
    }
    seen.add(label);
    accepted.push(label);
    if (accepted.length >= limit) break;
  }
  return { accepted, proposed, duplicate, invalid };
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

function buildPrompt(options: {
  count: number;
  askFor: number;
  existingSize: number;
  existingLabels: string[];
  rejected: string[];
  concepts: Array<{ concept: string; category: string; subcategory: string; level: string }>;
}) {
  const { count, askFor, existingSize, existingLabels, rejected, concepts } = options;
  const conceptFocus = shuffle(concepts).slice(0, 40);
  const lines = [
    `Add ${count} net-new real English catalog words. Return ${askFor} candidate spellings so extras can be dropped.`,
    `The catalog already has ${existingSize} words. The server rejects any duplicate, case-insensitive.`,
    'Prefer later OG patterns and less-common classroom words. Do not return the obvious CVC set.',
  ];
  if (existingLabels.length) {
    lines.push(`These catalog words already exist — do not repeat them:\n${existingLabels.join('\n')}`);
  }
  if (rejected.length) {
    lines.push(`These suggestions were just rejected as duplicates or invalid — do not repeat them:\n${rejected.join('\n')}`);
  }
  lines.push(
    `Prefer words that practice a mix of these concepts (spellings only, no tags):\n${JSON.stringify(conceptFocus)}`,
  );
  return lines.join('\n\n');
}

async function proposeWords(prompt: string, askFor: number) {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: askFor >= 80 ? 4096 : 2048,
        temperature: 0.8,
      },
      toolConfig: {
        tools: [RETURN_RESULT_TOOL],
        toolChoice: { tool: { name: 'return_result' } },
      },
    }),
  );
  return toolUseInput(response);
}

export const handler = async (event: AddEvent): Promise<AddResult> => {
  const wordTable = envVar('WORD_TABLE_NAME');
  const conceptTable = envVar('CONCEPT_TABLE_NAME');
  if (!wordTable || !conceptTable) {
    throw new Error('Add catalog words is not configured in this environment.');
  }

  const count = resolveCount(event.arguments?.count);
  const askFor = candidateCount(count);
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
      concept: attrString(item, 'concept'),
      category: attrString(item, 'category'),
      subcategory: attrString(item, 'subcategory'),
      level: attrString(item, 'level'),
    }))
    .filter((concept) => concept.concept);

  const includeExisting = existingLabels.length <= INCLUDE_EXISTING_LIMIT ? [...existingLabels].sort() : [];

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = await proposeWords(
      buildPrompt({
        count,
        askFor,
        existingSize: existing.size,
        existingLabels: includeExisting,
        rejected: [],
        concepts,
      }),
      askFor,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock add-words generation failed';
    console.error('addCatalogWords converse failed', err);
    throw new Error(message);
  }

  if (!parsed) {
    throw new Error('The add-words model did not return a structured result. Try again.');
  }

  const result = parseProposedWords(parsed, existing, count);
  console.log(
    JSON.stringify({
      catalogSize: existing.size,
      proposed: result.proposed.length,
      accepted: result.accepted.length,
      duplicate: result.duplicate,
      invalid: result.invalid,
      sample: result.proposed.slice(0, 20),
    }),
  );

  if (!result.accepted.length) {
    return {
      createdCount: 0,
      message:
        'No new words were added. The model’s suggestions were already in the catalog or were not usable English words. Try Add Words again — a new concept mix is chosen each run.',
    };
  }

  await putWords(wordTable, result.accepted);
  const preview = result.accepted.slice(0, 8).join(', ');
  const extra = result.accepted.length > 8 ? '…' : '';
  return {
    createdCount: result.accepted.length,
    message:
      result.accepted.length === count
        ? `Added ${result.accepted.length} new catalog word${result.accepted.length === 1 ? '' : 's'} (${preview}${extra}). Next, write dictionary definitions, then run an audit to tag them.`
        : `Added ${result.accepted.length} of ${count} requested catalog words (${preview}${extra}). Run Add Words again if you want the rest.`,
  };
};
