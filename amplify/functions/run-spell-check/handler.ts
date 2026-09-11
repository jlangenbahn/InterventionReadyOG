/**
 * Bedrock Converse spell check: check a real-word id batch (max 100),
 * flag misspellings, then write OPEN DataQualityFinding rows with
 * actionType SPELLING. The client walks the full catalog in batches.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BatchGetItemCommand,
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const SPELL_BATCH_LIMIT = 100;
const SYSTEM_PROMPT = `You are an expert copy editor for an Orton-Gillingham word catalog.
Review this specific batch of words.

Flag only genuine English misspellings in real words:
- Do not flag nonsense or decodable practice tokens (isNonsenseWord true).
- Do not flag correctly spelled words, including uncommon but valid English words.
- Do not flag capitalization, hyphenation, or punctuation unless the letters themselves are wrong.
- Prefer precision. It is better to return fewer findings than false positives.
- confidence is a number from 0 to 1.`;

const RETURN_RESULT_TOOL = {
  toolSpec: {
    name: 'return_result',
    description: 'Return spelling findings for this word batch.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                wordId: { type: 'string' },
                suggestedSpelling: { type: 'string' },
                reason: { type: 'string' },
                confidence: { type: 'number' },
              },
              required: ['wordId', 'suggestedSpelling', 'reason', 'confidence'],
            },
          },
        },
        required: ['findings'],
      },
    },
  },
};

const bedrock = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});
const dynamo = new DynamoDBClient({});

type SpellEvent = {
  arguments?: {
    wordIds?: Array<string | null> | null;
  };
};

type AuditResult = {
  createdCount: number;
  message: string;
};

type CatalogWord = {
  id: string;
  word: string;
};

type ModelFinding = {
  wordId: string;
  suggestedSpelling: string;
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

function uniqueIds(ids: Array<string | null> | null | undefined) {
  return [...new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
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

function normalizeConfidence(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1 && number <= 100) return Math.min(1, Math.max(0, number / 100));
  return Math.min(1, Math.max(0, number));
}

function wordFromItem(item: Record<string, AttributeValue> | undefined): CatalogWord | null {
  if (!item || item.isNonsenseWord?.BOOL === true) return null;
  const id = attrString(item, 'id');
  const word = attrString(item, 'word');
  if (!id || !word) return null;
  return { id, word };
}

async function loadWordsByIds(tableName: string, ids: string[]): Promise<CatalogWord[]> {
  const projection = projectionFor(['id', 'word', 'isNonsenseWord']);
  const words: CatalogWord[] = [];
  let pending = ids.map((id) => ({ id: { S: id } }));
  let attempts = 0;
  while (pending.length && attempts < 4) {
    attempts += 1;
    const result = await dynamo.send(
      new BatchGetItemCommand({
        RequestItems: {
          [tableName]: {
            Keys: pending,
            ProjectionExpression: projection.ProjectionExpression,
            ExpressionAttributeNames: projection.ExpressionAttributeNames,
          },
        },
      }),
    );
    for (const item of result.Responses?.[tableName] ?? []) {
      const word = wordFromItem(item);
      if (word) words.push(word);
    }
    pending = result.UnprocessedKeys?.[tableName]?.Keys ?? [];
  }
  return words;
}

async function scanRealWords(tableName: string, limit: number): Promise<CatalogWord[]> {
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
      }),
    );
    for (const item of result.Items ?? []) {
      const word = wordFromItem(item);
      if (!word) continue;
      words.push(word);
      if (words.length >= limit) return words;
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return words;
}

function parseFindings(raw: Record<string, unknown> | null, words: CatalogWord[]) {
  const byId = new Map(words.map((word) => [word.id, word]));
  const list = Array.isArray(raw?.findings) ? raw.findings : [];
  const findings: ModelFinding[] = [];

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const wordId = String(item.wordId ?? '').trim();
    const catalog = byId.get(wordId);
    const suggestedSpelling = String(item.suggestedSpelling ?? '').trim();
    const reason = String(item.reason ?? '').trim();
    const confidence = normalizeConfidence(item.confidence);
    if (!catalog || !suggestedSpelling || !reason || confidence == null) continue;
    if (suggestedSpelling.toLowerCase() === catalog.word.toLowerCase()) continue;
    findings.push({ wordId, suggestedSpelling, reason, confidence });
  }
  return findings;
}

export const handler = async (event: SpellEvent = {}): Promise<AuditResult> => {
  const wordTable = envVar('WORD_TABLE_NAME');
  const findingTable = envVar('FINDING_TABLE_NAME');
  if (!wordTable || !findingTable) {
    throw new Error('Spell check is not configured in this environment.');
  }

  const requested = uniqueIds(event.arguments?.wordIds).slice(0, SPELL_BATCH_LIMIT);
  const wordRows = requested.length
    ? await loadWordsByIds(wordTable, requested)
    : await scanRealWords(wordTable, SPELL_BATCH_LIMIT);
  if (!wordRows.length) {
    return { createdCount: 0, message: 'No real catalog words were available to spell-check.' };
  }

  const userText = `Check this word batch for genuine English misspellings:
${JSON.stringify(wordRows.map((word) => ({ wordId: word.id, word: word.word })))}`;

  let parsed: Record<string, unknown> | null = null;
  try {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: 8192,
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
    const message = err instanceof Error ? err.message : 'Bedrock spell check failed';
    console.error('runSpellCheck converse failed', err);
    throw new Error(message);
  }

  if (!parsed) {
    throw new Error('The spell-check model did not return a structured result. Try again.');
  }

  const findings = parseFindings(parsed, wordRows);
  const now = new Date().toISOString();

  for (const finding of findings) {
    await dynamo.send(
      new PutItemCommand({
        TableName: findingTable,
        Item: {
          id: { S: newId() },
          wordId: { S: finding.wordId },
          suggestedSpelling: { S: finding.suggestedSpelling },
          actionType: { S: 'SPELLING' },
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
        ? `Checked ${wordRows.length} words. No high-confidence misspellings were found.`
        : `Checked ${wordRows.length} words and created ${findings.length} spelling finding${findings.length === 1 ? '' : 's'}.`,
  };
};
