import { generateClient } from 'aws-amplify/data'

/** Module-scope Amplify Data client — never instantiate inside a component. */
const client = generateClient({ authMode: 'userPool' })

function uniqueWords(words) {
  const seen = new Set()
  const result = []
  for (const raw of words ?? []) {
    const word = String(raw ?? '').trim()
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(word)
  }
  return result
}

function unwrapGeneratedText(data) {
  if (typeof data === 'string') return data.trim()
  if (data && typeof data.text === 'string') return data.text.trim()
  return ''
}

/**
 * Ask Bedrock (via the Amplify generation route) for a simple sentence or passage
 * built from a concept word list.
 */
export async function generateLessonText({ kind, conceptName, words }) {
  const generate = client.generations?.generateLessonText
  if (typeof generate !== 'function') {
    throw new Error(
      'AI generation is not available yet. After this update deploys, refresh the app. Also confirm Claude 3.5 Haiku access is enabled in Amazon Bedrock.',
    )
  }

  const unique = uniqueWords(words)
  if (!unique.length) {
    throw new Error('Select a word list with at least one word.')
  }

  const { data, errors } = await generate({
    kind: kind === 'passage' ? 'passage' : 'sentence',
    conceptName: String(conceptName || 'this concept').trim() || 'this concept',
    words: unique.join(', '),
  })
  if (errors?.length) {
    throw new Error(errors.map((item) => item.message).join(', '))
  }

  const text = unwrapGeneratedText(data)
  if (!text) {
    throw new Error('The AI did not return any text. Try another list or try again.')
  }
  return text
}
