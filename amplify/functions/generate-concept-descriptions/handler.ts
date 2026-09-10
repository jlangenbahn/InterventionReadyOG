/**
 * Bedrock Converse OG descriptions: process one concept-id batch, generate a
 * strict phonetic rule from name + category + subcategory, then overwrite
 * ogDescription.
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
const MAX_BATCH = 25;
const SYSTEM_PROMPT = `You are an expert Orton-Gillingham trainer writing instructor-facing concept rules.

For each concept, write a strict OG phonetic or orthographic rule definition:
- Use the concept name together with its category and subcategory as the primary context. Do not write the rule from the name alone.
- category and subcategory locate the pattern in the OG sequence (for example phonograms, syllable types, or morphology).
- Also consider level when it is provided.
- Describe the grapheme, phonogram, morpheme, or syllable pattern, how it is taught, and typical constraints (position, voiced/unvoiced, syllable type, common exceptions).
- Do not write a dictionary definition of an example word. Write the teaching rule.
- Keep each description to 1-3 sentences.
- Do not invent concept ids. Use only ids from the provided catalog.

<examples>
<example>c_soft: c says /s/ when followed immediately by e, i, or y.</example>
<example>ff_ll_ss_zz: Double the f, l, s, or z at the end of a one-syllable base word right after a short vowel (FLOSS rule).</example>
</examples>`;

const RETURN_RESULT_TOOL = {
  toolSpec: {
    name: 'return_result',
    description: 'Return OG rule descriptions for this concept batch.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          descriptions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                conceptId: { type: 'string' },
                ogDescription: { type: 'string' },
              },
              required: ['conceptId', 'ogDescription'],
            },
          },
        },
        required: ['descriptions'],
      },
    },
  },
};

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

type GenerateEvent = {
  arguments?: {
    conceptIds?: Array<string | null> | null;
  };
};

function envVar(name: string) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return String(env?.[name] ?? '').trim();
}

function attrString(item: Record<string, AttributeValue> | undefined, key: string) {
  return String(item?.[key]?.S ?? '').trim();
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

async function loadConceptsByIds(tableName: string, ids: string[]): Promise<CatalogConcept[]> {
  const projection = projectionFor(['id', 'concept', 'category', 'subcategory', 'level', 'definition']);
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
  const concepts: CatalogConcept[] = [];
  for (const result of items) {
    const item = result.Item;
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
  }
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

export const handler = async (event: GenerateEvent): Promise<AuditResult> => {
  const conceptTable = envVar('CONCEPT_TABLE_NAME');
  if (!conceptTable) {
    throw new Error('Concept description generation is not configured in this environment.');
  }

  const conceptIds = uniqueIds(event.arguments?.conceptIds);
  if (!conceptIds.length) {
    return { createdCount: 0, message: 'No concept ids were provided.' };
  }
  if (conceptIds.length > MAX_BATCH) {
    throw new Error(`Send at most ${MAX_BATCH} concept ids per request.`);
  }

  const concepts = await loadConceptsByIds(conceptTable, conceptIds);
  if (!concepts.length) {
    return { createdCount: 0, message: 'None of the requested concepts were found.' };
  }

  const userText = `Write OG rule descriptions for this concept batch. Use each concept's name, category, and subcategory together:
${JSON.stringify(concepts.map((concept) => ({
  conceptId: concept.id,
  concept: concept.concept,
  category: concept.category,
  subcategory: concept.subcategory,
  level: concept.level,
  definition: concept.definition,
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
    const message = err instanceof Error ? err.message : 'Bedrock description generation failed';
    console.error('generateConceptDescriptions converse failed', err);
    throw new Error(message);
  }

  if (!parsed) {
    throw new Error('The description model did not return a structured result. Try again.');
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
