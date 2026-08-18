import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const SYSTEM_PROMPT =
  'You write tutoring materials for middle-school students who read at about a 4th-grade level. Keep non-target words very simple. Write coherent, easy-to-follow text. Use the provided target words with their exact spelling, including nonsense or decodable practice words. Prefer putting 2 or 3 target words in the same sentence when it still sounds natural. Return only the requested sentence or passage, with no title, labels, quotes, bullet points, or commentary.';

const client = new BedrockRuntimeClient({
  maxAttempts: 5,
  retryMode: 'adaptive',
});

type GenerateEvent = {
  arguments?: {
    kind?: string | null;
    conceptName?: string | null;
    words?: string | null;
  };
};

function converseText(response: { output?: { message?: { content?: Array<{ text?: string }> } } }) {
  return (response.output?.message?.content ?? [])
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
    .trim();
}

export const handler = async (event: GenerateEvent): Promise<string> => {
  const kind = event.arguments?.kind === 'passage' ? 'passage' : 'sentence';
  const conceptName = String(event.arguments?.conceptName || 'this concept').trim() || 'this concept';
  const words = String(event.arguments?.words || '').trim();
  if (!words) {
    throw new Error('Select a word list with at least one word.');
  }

  const userText =
    kind === 'passage'
      ? `Write a short simple passage of 4 to 7 short sentences for the concept ${conceptName}. Use at least 80 percent of these target words, and use 2 or 3 of them in the same sentence when it still sounds natural. Error on the side of being too simple. Target words: ${words}`
      : `Write one short simple sentence for the concept ${conceptName}. Use 2 or 3 of these target words in that sentence when possible. Target words: ${words}`;

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: {
          maxTokens: kind === 'passage' ? 700 : 200,
          temperature: 0.4,
        },
      }),
    );
    const text = converseText(response);
    if (!text) {
      throw new Error('The AI did not return any text. Try another list or try again.');
    }
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bedrock generation failed';
    console.error('generateLessonText failed', err);
    throw new Error(message);
  }
};
