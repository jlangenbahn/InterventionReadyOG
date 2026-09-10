/**
 * Bedrock Converse dictionary writer. Processes one word-id batch (max 10),
 * generates a structured DictionaryData entry, then writes Word.dictionaryData.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const MAX_BATCH = 10;
const SYSTEM_PROMPT = `You are a lexicographer writing concise, accurate dictionary entries for an Orton-Gillingham reading program.

For each real English word, return a robust dictionary entry:
- syllabication: split syllables with a middle dot (·), e.g. "dic·tion·ar·y".
- ipa: American English IPA inside slashes, e.g. "/ˈdɪkʃəˌnɛri/".
- partOfSpeech: a short label such as noun, verb, adjective, adverb, preposition, or conjunction. If several apply, use the most common classroom sense.
- definitions: 1 to 4 short, student-friendly definitions. Do not number them.
- etymology: a brief origin/roots note (language + morphemes when known). One sentence.
- exampleSentence: one natural classroom-friendly sentence that uses the word as the given part of speech.

Rules:
- Do not invent word ids. Use only ids from the provided catalog.
- Skip nonsense or invented tokens; do not return an entry for them.
- Keep definitions literal and precise. No encyclopedias, no trivia.
- Match the given spelling exactly.`;

const RETURN_RESULT_TOOL = {
  toolSpec: {
    name: 'return_result',
    description: 'Return dictionary entries for this word batch.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                wordId: { type: 'string' },
                syllabication: { type: 'string' },
                ipa: { type: 'string' },
                partOfSpeech: { type: 'string' },
                definitions: {
                  type: 'array',
                  items: { type: 'string' },
                },
                etymology: { type: 'string' },
                exampleSentence: { type: 'string' },
              },
              required: [
                'wordId',
                'syllabication',
                'ipa',
                'partOfSpeech',
                'definitions',
                'etymology',
                'exampleSentence',
              ],
            },
          },
        },
        required: ['entries'],
      },
    },
  },
};

const bedrock = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});
const dynamo = new DynamoDBClient({});

export type DictionaryData = {
  syllabication: string;
  ipa: string;
  partOfSpeech: string;
  definitions: string[];
  etymology: string;
  exampleSentence: string;
};

type AuditResult = {
  createdCount: number;
  message: string;
};

type CatalogWord = {
  id: string;
  word: string;
  isNonsenseWord: boolean;
  dictionaryData: DictionaryData | null;
};

type ModelEntry = DictionaryData & { wordId: string };

type GenerateEvent = {
  arguments?: {
    wordIds?: Array<string | null> | null;
  };
};

function envVar(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return String(env?.[name] ?? '').trim();
}

function attrString(item: Record<string, AttributeValue> | undefined, key: string) {
  return String(item?.[key]?.S ?? '').trim();
}

function parseJsonValue(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeIpa(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed;
  return `/${trimmed.replace(/^\[|\]$/g, '')}/`;
}

export function parseDictionaryData(raw: unknown): DictionaryData | null {
  const value = parseJsonValue(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const definitions = (Array.isArray(item.definitions) ? item.definitions : [])
    .map((definition) => String(definition ?? '').trim())
    .filter(Boolean);
  const syllabication = String(item.syllabication ?? '').trim();
  const ipa = normalizeIpa(String(item.ipa ?? ''));
  const partOfSpeech = String(item.partOfSpeech ?? '').trim();
  const etymology = String(item.etymology ?? '').trim();
  const exampleSentence = String(item.exampleSentence ?? '').trim();
  if (!syllabication || !ipa || !partOfSpeech || !definitions.length) return null;
  return {
    syllabication,
    ipa,
    partOfSpeech,
    definitions,
    etymology,
    exampleSentence,
  };
}

function toolUseInput(response: {
  output?: { message?: { content?: Array<{ toolUse?: { input?: unknown } }> } };
}): Record<string, unknown> | null {
  const input = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse?.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
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

function uniqueIds(raw: Array<string | null> | null | undefined) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw ?? []) {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function loadWordsByIds(tableName: string, ids: string[]): Promise<CatalogWord[]> {
  const projection = projectionFor(['id', 'word', 'isNonsenseWord', 'dictionaryData']);
  const items = await Promise.all(
    ids.map((id) =>
      dynamo.send(
        new GetItemCommand({
          TableName: tableName,
          Key: { id: { S: id } },
          ProjectionExpression: projection.ProjectionExpression,
          ExpressionAttributeNames: projection.ExpressionAttributeNames,
        }),
      ),
    ),
  );
  const words: CatalogWord[] = [];
  for (const result of items) {
    const item = result.Item;
    const id = attrString(item, 'id');
    const word = attrString(item, 'word');
    if (!id || !word) continue;
    words.push({
      id,
      word,
      isNonsenseWord: item?.isNonsenseWord?.BOOL === true,
      dictionaryData: parseDictionaryData(attrString(item, 'dictionaryData') || null),
    });
  }
  return words;
}

function parseEntries(raw: Record<string, unknown> | null, words: CatalogWord[]) {
  const ids = new Set(words.map((word) => word.id));
  const list = Array.isArray(raw?.entries) ? raw.entries : [];
  const entries: ModelEntry[] = [];

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const wordId = String(item.wordId ?? '').trim();
    if (!ids.has(wordId)) continue;
    const parsed = parseDictionaryData(item);
    if (!parsed) continue;
    entries.push({ wordId, ...parsed });
  }
  return entries;
}

export const handler = async (event: GenerateEvent): Promise<AuditResult> => {
  const wordTable = envVar('WORD_TABLE_NAME');
  if (!wordTable) {
    throw new Error('Dictionary generation is not configured in this environment.');
  }

  const wordIds = uniqueIds(event.arguments?.wordIds);
  if (!wordIds.length) {
    return { createdCount: 0, message: 'No word ids were provided.' };
  }
  if (wordIds.length > MAX_BATCH) {
    throw new Error(`Send at most ${MAX_BATCH} word ids per request.`);
  }

  const loaded = await loadWordsByIds(wordTable, wordIds);
  const words = loaded.filter((word) => !word.isNonsenseWord && !word.dictionaryData);
  if (!words.length) {
    return {
      createdCount: 0,
      message: `Processed 0 of ${wordIds.length} words. None still needed dictionary data.`,
    };
  }

  const userText = `Write dictionary entries for this word batch:
${JSON.stringify(words.map((word) => ({
  wordId: word.id,
  word: word.word,
})))}`;

  let parsed: Record<string, unknown> | null = null;
  try {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.2,
        },
        toolConfig: {
          tools: [RETURN_RESULT_TOOL],
          toolChoice: { tool: { name: 'return_result' } },
        },
      }),
    );
    parsed = toolUseInput(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock dictionary generation failed';
    console.error('generateDictionaryDefinitions converse failed', err);
    throw new Error(message);
  }

  if (!parsed) {
    throw new Error('The dictionary model did not return a structured result. Try again.');
  }

  const entries = parseEntries(parsed, words);
  const now = new Date().toISOString();
  let updated = 0;

  for (const row of entries) {
    const { wordId, ...dictionaryData } = row;
    await dynamo.send(
      new UpdateItemCommand({
        TableName: wordTable,
        Key: { id: { S: wordId } },
        UpdateExpression: 'SET #dictionaryData = :data, #updatedAt = :now',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeNames: {
          '#dictionaryData': 'dictionaryData',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':data': { S: JSON.stringify(dictionaryData) },
          ':now': { S: now },
        },
      }),
    );
    updated += 1;
  }

  return {
    createdCount: updated,
    message: `Processed ${updated} of ${wordIds.length} words`,
  };
};
