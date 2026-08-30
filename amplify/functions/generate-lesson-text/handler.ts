/**
 * Bedrock Converse handler: write one sentence or passage for a student.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const SYSTEM_PROMPT =
  'You write tutoring materials for one specific student. The student is a middle-school reader at about a 4th-grade level. Use the student history when it is provided: prefer familiar words and review/mastered concepts as the surrounding language, and weave in target practice words plus a little new practice. If the focus concept is new, keep almost all non-target words familiar. Keep non-target words very simple. Write coherent, easy-to-follow text. Use provided target words with their exact spelling, including nonsense or decodable practice words. Prefer putting 2 or 3 target words in the same sentence when it still sounds natural. Do not copy previous sentences or passages. Return only the requested sentence or passage. Do not include a title, heading, markdown, hashtag, the concept name, labels, quotes, bullet points, or commentary. Start with the first sentence of the text.';

const client = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});

type GenerateEvent = {
  arguments?: {
    kind?: string | null;
    conceptName?: string | null;
    words?: string | null;
    studentContext?: string | null;
  };
};

type WordBank = {
  role?: string;
  conceptName?: string;
  words: string[];
};

function converseText(response: { output?: { message?: { content?: Array<{ text?: string }> } } }) {
  return (response.output?.message?.content ?? [])
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueWords(words: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of words) {
    const word = String(raw ?? '').trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

function parseWordBanks(raw: string): WordBank[] {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { banks?: WordBank[] };
      if (Array.isArray(parsed?.banks) && parsed.banks.length) {
        return parsed.banks
          .map((bank) => ({
            role: bank?.role === 'new' ? 'new' : 'review',
            conceptName: String(bank?.conceptName || 'this concept').trim() || 'this concept',
            words: uniqueWords(Array.isArray(bank?.words) ? bank.words : []),
          }))
          .filter((bank) => bank.words.length);
      }
    } catch {
      // Fall through to comma-separated words.
    }
  }
  return [{ role: 'review', conceptName: 'this concept', words: uniqueWords(trimmed.split(/,\s*/)) }];
}

function formatBanksForPrompt(banks: WordBank[]) {
  return banks
    .map((bank) => {
      const tag = bank.role === 'new' ? 'NEW' : 'REVIEW';
      return `[${tag}] ${bank.conceptName}: ${bank.words.join(', ')}`;
    })
    .join('\n');
}

function stripGeneratedHeading(text: string, conceptName: string) {
  let out = text.replace(/\r\n/g, '\n').trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }

  const known = conceptName.trim();
  const hashes = out.match(/^(#{1,6})\s+/);
  if (hashes) {
    out = out.slice(hashes[0].length);
    const newlineAt = out.indexOf('\n');
    if (newlineAt === -1) {
      if (known && out.toLowerCase().startsWith(known.toLowerCase())) {
        out = out.slice(known.length).replace(/^\s*[:.\\-–—]?\s*/, '');
      } else {
        const headingWords = out.match(/^((?:[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,7}))\s+/);
        if (headingWords) out = out.slice(headingWords[0].length);
      }
    } else {
      out = out.slice(newlineAt + 1).trim();
    }
  }

  const lines = out.split('\n');
  while (lines.length > 1) {
    const first = lines[0].replace(/^#{1,6}\s+/, '').trim();
    const isKnown = Boolean(known) && first.toLowerCase() === known.toLowerCase();
    if (first && !isKnown) break;
    lines.shift();
  }
  out = lines.join('\n').trim();

  if (hashes && known) {
    const prefix = new RegExp(
      `^${escapeRegExp(known)}(?=\\s|$|[:.\\-–—])\\s*[:.\\-–—]?\\s*`,
      'i',
    );
    out = out.replace(prefix, '').replace(prefix, '');
  }

  return out.trim();
}

function passagePrompt(conceptName: string, banks: WordBank[], historyBlock: string) {
  const bankCount = Math.max(banks.length, 1);
  const share = Math.round(100 / bankCount);
  const banksBlock = formatBanksForPrompt(banks);
  return `Write a connected decodable passage that practices the focus concept ${conceptName} for this student.

Strict constraints:
- The passage MUST be at least 100 words. Count and meet this minimum.
- Do not title the passage, do not use markdown, and do not repeat the concept name. Start with the first sentence.
- Do NOT use every word provided in the banks. Sample a subset from each bank so the passage stays natural.
- Evenly distribute practice across the concept banks. There are ${bankCount} concept bank(s); aim for roughly a ${share}% split of target words drawn from each bank.
- Pull from the NEW concept bank and every REVIEW concept bank in the same passage. Weave them together rather than writing one paragraph per concept.
- Prefer putting 2 or 3 target words in the same sentence when it still sounds natural.
- Error on the side of being too simple.

Concept word banks:
${banksBlock}${historyBlock}`;
}

function sentencePrompt(conceptName: string, banks: WordBank[], historyBlock: string) {
  const banksBlock = formatBanksForPrompt(banks);
  return `Write one short simple sentence that practices the concept ${conceptName} for this student. Do not include a title, markdown, or the concept name as a label. Use 2 or 3 target words from this concept's full word bank in that sentence when possible. Do not try to use every word. Target word bank:
${banksBlock}${historyBlock}`;
}

export const handler = async (event: GenerateEvent): Promise<string> => {
  const kind = event.arguments?.kind === 'passage' ? 'passage' : 'sentence';
  const conceptName = String(event.arguments?.conceptName || 'this concept').trim() || 'this concept';
  const banks = parseWordBanks(String(event.arguments?.words || ''));
  const hasWords = banks.some((bank) => bank.words.length);
  if (!hasWords) {
    throw new Error('Choose a concept that has words in the catalog.');
  }

  const studentContext = String(event.arguments?.studentContext || '').trim();
  const historyBlock = studentContext
    ? `\nStudent history JSON. Use familiar words and review/mastered concepts as the surrounding language. If the focus concept is new, keep almost all non-target words familiar. Include a little new practice, but do not copy recentTexts. ${studentContext}`
    : '';

  const userText =
    kind === 'passage'
      ? passagePrompt(conceptName, banks, historyBlock)
      : sentencePrompt(conceptName, banks, historyBlock);

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: kind === 'passage' ? 1200 : 200,
          temperature: 0.4,
        },
      }),
    );
    const text = stripGeneratedHeading(converseText(response), conceptName);
    if (!text) {
      throw new Error('The AI did not return any text. Try another concept or try again.');
    }
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock generation failed';
    console.error('generateLessonText failed', err);
    throw new Error(message);
  }
};
