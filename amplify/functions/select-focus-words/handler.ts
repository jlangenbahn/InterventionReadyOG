import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const SYSTEM_PROMPT = `You are Andrea, an Orton-Gillingham reading intervention assistant. You pick a small practice word set for one student.

Return ONLY JSON with this shape:
{"ids":["id1","id2"],"summary":"One short sentence about why these words fit this student."}

Rules:
- Choose only from the candidate list. Use each candidate's id exactly.
- Choose exactly the requested count, or every candidate if there are fewer.
- Heavily prefer simpler words relative to the rest of the set: shorter, more common, fewer syllables, more regular spelling.
- Heavily prefer words that share a topic or setting so they can later be woven into one simple story (home, school, animals, food, weather, play, and similar).
- Prefer real words over nonsense words unless the concept clearly needs nonsense practice.
- Use the student profile. If the focus concept is new, strongly prefer words the student has already seen so the new pattern is practiced in familiar vocabulary.
- Words the student has read correctly are useful anchors. Words they missed may be included for review only if they still keep the set simple and thematically related.
- Do not pick a mixed bag of unrelated hard words.`;

const client = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});

type Candidate = {
  id?: string | null;
  word?: string | null;
  nonsense?: boolean | null;
};

type SelectEvent = {
  arguments?: {
    payload?: string | null;
    count?: number | null;
  };
};

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
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

  const userText = [
    `Pick the ${Math.min(count, candidates.length)} best practice words for this student.`,
    'Student and concept context:',
    JSON.stringify({ ...payload, candidates: undefined }),
    'Candidate words:',
    JSON.stringify(candidates),
  ].join('\n');

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: 600,
          temperature: 0.2,
        },
      }),
    );
    const parsed = parseJsonObject(converseText(response));
    const ids = resolveModelIds(parsed, candidates, Math.min(count, candidates.length));
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
