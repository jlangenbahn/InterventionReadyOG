/**
 * Bedrock Converse handler: pick a small themed practice word set.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const SYSTEM_PROMPT = `You are Andrea, an Orton-Gillingham reading intervention assistant. You pick a small practice word set for one student.

Rules:
- Choose only from the candidate list. Use each candidate's id exactly.
- 1. MAX COUNT: Never exceed the requested target count.
- 2. MUST INCLUDE: Prioritize candidates marked 'missed'. If 'missed' words exceed the target count, select a subset up to the target count.
- 3. FILLER: Fill any remaining slots with 'unseen' candidates.
- Heavily prefer simpler words relative to the rest of the set: shorter, more common, fewer syllables, more regular spelling.
- Heavily prefer words that share a topic or setting so they can later be woven into one simple story (home, school, animals, food, weather, play, and similar).
- Prefer real words over nonsense words unless the concept clearly needs nonsense practice.
- Do not pick a mixed bag of unrelated hard words.`;

const RETURN_RESULT_TOOL = {
  toolSpec: {
    name: 'return_result',
    description: 'Return the selected practice word ids and a short summary.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Candidate ids chosen for this student.',
          },
          summary: {
            type: 'string',
            description: 'One short sentence about why these words fit this student.',
          },
        },
        required: ['ids', 'summary'],
      },
    },
  },
};

const client = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});

type Candidate = {
  id?: string | null;
  word?: string | null;
  nonsense?: boolean | null;
  priority?: string | null;
  prior?: {
    lists?: number;
    lessons?: number;
    correct?: number;
    incorrect?: number;
    firstSeen?: string;
    lastSeen?: string;
  } | null;
};

type SelectEvent = {
  arguments?: {
    payload?: string | null;
    count?: number | null;
  };
};

function toolUseInput(response: {
  output?: { message?: { content?: Array<{ toolUse?: { input?: unknown } }> } };
}): Record<string, unknown> | null {
  const input = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse?.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function normalizeWord(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function parsePayload(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function candidateList(payload: Record<string, unknown>): Candidate[] {
  const list = Array.isArray(payload.candidates) ? payload.candidates : [];
  return list.filter((item) => item && typeof item === 'object') as Candidate[];
}

function sortSimple(a: Candidate, b: Candidate) {
  const leftNonsense = a.nonsense ? 1 : 0;
  const rightNonsense = b.nonsense ? 1 : 0;
  if (leftNonsense !== rightNonsense) return leftNonsense - rightNonsense;
  const leftWord = String(a.word ?? '').trim();
  const rightWord = String(b.word ?? '').trim();
  const leftLen = leftWord.replace(/[^a-zA-Z]/g, '').length || 99;
  const rightLen = rightWord.replace(/[^a-zA-Z]/g, '').length || 99;
  if (leftLen !== rightLen) return leftLen - rightLen;
  return leftWord.toLowerCase().localeCompare(rightWord.toLowerCase());
}

function uniqueIds(ids: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function rankCandidates(candidates: Candidate[]) {
  const missed: Candidate[] = [];
  const unseen: Candidate[] = [];
  const recycle: Candidate[] = [];
  for (const item of candidates) {
    const prior = item.prior;
    const seen = Number(prior?.lessons || 0) > 0 || Number(prior?.lists || 0) > 0;
    if (Number(prior?.incorrect || 0) > 0 || item.priority === 'missed') missed.push(item);
    else if (!seen || item.priority === 'unseen') unseen.push(item);
    else recycle.push(item);
  }
  missed.sort((a, b) => Number(b.prior?.incorrect || 0) - Number(a.prior?.incorrect || 0));
  recycle.sort((a, b) => {
    const left = String(a.prior?.firstSeen || a.prior?.lastSeen || '9999');
    const right = String(b.prior?.firstSeen || b.prior?.lastSeen || '9999');
    return left.localeCompare(right);
  });
  return {
    missedIds: missed.map((item) => String(item.id)),
    unseenIds: unseen.map((item) => String(item.id)),
    recycleIds: recycle.map((item) => String(item.id)),
    ordered: [...missed, ...unseen, ...recycle],
  };
}

function applySelectionPolicy(modelIds: string[], ranked: ReturnType<typeof rankCandidates>, count: number) {
  const unseenSet = new Set(ranked.unseenIds);
  const recycleSet = new Set(ranked.recycleIds);
  const picked: string[] = [];
  const used = new Set<string>();
  const push = (ids: string[]) => {
    for (const id of ids) {
      if (!id || used.has(id)) continue;
      picked.push(id);
      used.add(id);
      if (picked.length >= count) return true;
    }
    return false;
  };
  if (push(ranked.missedIds)) return picked;
  if (push(modelIds.filter((id) => unseenSet.has(id)))) return picked;
  if (push(ranked.unseenIds)) return picked;
  if (push(modelIds.filter((id) => recycleSet.has(id)))) return picked;
  push(ranked.recycleIds);
  return picked.slice(0, count);
}

function resolveModelIds(parsed: Record<string, unknown> | null, candidates: Candidate[], count: number) {
  const byId = new Map(candidates.map((item) => [String(item.id ?? ''), item]));
  const byWord = new Map<string, Candidate>();
  for (const item of candidates) {
    const key = normalizeWord(item.word);
    if (key && item.id && !byWord.has(key)) byWord.set(key, item);
  }

  const rawIds = Array.isArray(parsed?.ids) ? parsed.ids : [];
  const rawWords = Array.isArray(parsed?.words) ? parsed.words : [];
  const picked: string[] = [];

  for (const value of [...rawIds, ...rawWords]) {
    const asId = String(value ?? '').trim();
    if (byId.has(asId)) {
      picked.push(asId);
      continue;
    }
    const match = byWord.get(normalizeWord(value));
    if (match?.id) picked.push(String(match.id));
  }

  const valid = uniqueIds(picked).filter((id) => byId.has(id));
  if (valid.length >= Math.min(count, candidates.length)) {
    return valid.slice(0, count);
  }

  const used = new Set(valid);
  const filler = [...candidates].sort(sortSimple);
  for (const item of filler) {
    const id = String(item.id ?? '');
    if (!id || used.has(id)) continue;
    valid.push(id);
    used.add(id);
    if (valid.length >= count) break;
  }
  return valid.slice(0, Math.min(count, candidates.length));
}

export const handler = async (event: SelectEvent): Promise<string> => {
  const payload = parsePayload(String(event.arguments?.payload || ''));
  const candidates = candidateList(payload).filter((item) => item.id && item.word);
  const requested = Number(event.arguments?.count);
  const count = Number.isFinite(requested) && requested > 0 ? Math.min(20, Math.floor(requested)) : 10;

  if (!candidates.length) {
    throw new Error('Select a concept that has words before asking Andrea.');
  }

  const ranked = rankCandidates(candidates);
  const variationToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userText = [
    `Pick the ${Math.min(count, candidates.length)} best practice words for this student.`,
    'Never exceed that target count. Prioritize missed words; if missed words exceed the count, choose a subset. Fill remaining slots with unseen candidates.',
    `Variation token: ${variationToken}`,
    'Student and concept context:',
    JSON.stringify({ ...payload, candidates: undefined }),
    'Candidate words (already ordered missed → unseen → oldest recycle):',
    JSON.stringify(ranked.ordered),
  ].join('\n');

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: 600,
          temperature: 0.5,
        },
        toolConfig: {
          tools: [RETURN_RESULT_TOOL],
          toolChoice: { tool: { name: 'return_result' } },
        },
      }),
    );
    const parsed = toolUseInput(response);
    const modelIds = resolveModelIds(parsed, ranked.ordered, Math.min(count, candidates.length));
    const ids = applySelectionPolicy(modelIds, ranked, Math.min(count, candidates.length));
    if (!ids.length) {
      throw new Error('Andrea could not pick words from this set. Try again.');
    }
    const summary =
      typeof parsed?.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : `Andrea selected ${ids.length} words for this student.`;
    return JSON.stringify({ ids, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock word selection failed';
    console.error('selectFocusWords failed', err);
    throw new Error(message);
  }
};
