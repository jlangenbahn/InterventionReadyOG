import { generateClient } from 'aws-amplify/data'
import { sanitizeGeneratedLessonText } from './sanitizeLessonText'

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

function messageFromErrors(errors) {
  return (errors ?? [])
    .map((item) => item?.message || item?.errorType || '')
    .filter(Boolean)
    .join(', ')
}

function messageFromUnknown(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  const nested = messageFromErrors(err.errors)
  if (nested) return nested
  if (err instanceof Error && err.message) return err.message
  if (typeof err.message === 'string' && err.message) return err.message
  return ''
}

/**
 * Ask Bedrock (via the Amplify generation route) for a simple sentence or passage
 * built from a concept word list.
 */
export async function generateLessonText({ kind, conceptName, words }) {
  const generate = client.queries?.generateLessonDraft
  if (typeof generate !== 'function') {
    throw new Error(
      'AI generation is not available in this app session. Refresh the page after the latest deploy finishes.',
    )
  }

  const unique = uniqueWords(words)
  if (!unique.length) {
    throw new Error('Select a word list with at least one word.')
  }

  const kindLabel = kind === 'passage' ? 'passage' : 'sentence'
  let data
  let errors
  try {
    const result = await generate({
      kind: kindLabel,
      conceptName: String(conceptName || 'this concept').trim() || 'this concept',
      words: unique.join(', '),
    })
    data = result?.data
    errors = result?.errors
  } catch (err) {
    console.error('AI generation failed', err)
    throw new Error(
      messageFromUnknown(err) ||
        'Bedrock could not generate text. In the AWS Console, open Amazon Bedrock in Ohio (us-east-2) and enable Claude Haiku 4.5.',
    )
  }

  const errorText = messageFromErrors(errors)
  if (errorText) {
    console.error('AI generation returned errors', errors)
    throw new Error(errorText)
  }

  const text = unwrapGeneratedText(data)
  if (!text) {
    throw new Error('The AI did not return any text. Try another list or try again.')
  }
  return sanitizeGeneratedLessonText(text, { conceptName }).text
}
