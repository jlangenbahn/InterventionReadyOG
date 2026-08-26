/**
 * Client wrapper for the generate-lesson-text Lambda (Ask Andrea sentences/passages).
 */
import { client } from './amplifyClient'
import { sanitizeGeneratedLessonText } from './sanitizeLessonText'
import { buildStudentWordContext, loadStudentPracticeHistory } from './studentPracticeContext'

function uniqueWords(words) {
  const seen = new Set()
  const result = []
  for (const raw of words ?? []) {
    const word = typeof raw === 'string' ? raw.trim() : String(raw?.word ?? '').trim()
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

function compactGenerationContext(context) {
  if (!context) return ''
  return JSON.stringify({
    student: context.student,
    focusConcept: context.focusConcept,
    scope: {
      inScopeCount: context.scope?.inScopeCount,
      masteryCounts: context.scope?.masteryCounts,
      familiarConcepts: context.scope?.familiarConcepts,
      newConcepts: context.scope?.newConcepts,
    },
    wordHistory: {
      listCount: context.wordHistory?.listCount,
      lessonCount: context.wordHistory?.lessonCount,
      familiarWords: context.wordHistory?.familiarWords,
      recentLists: context.wordHistory?.recentLists,
      recentTexts: context.wordHistory?.recentTexts,
    },
    targetWords: context.candidates,
  })
}

/**
 * Ask Bedrock for a simple sentence or passage built from a concept word list,
 * tailored with this student's practice history when available.
 */
export async function generateLessonText({
  kind,
  conceptName,
  words,
  student,
  concept,
  concepts = [],
  studentLists,
  wordsByConceptId,
}) {
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

  let studentContext = ''
  if (student?.id) {
    try {
      const { lists, lessons } = await loadStudentPracticeHistory({
        studentId: student.id,
        studentLists,
      })
      studentContext = compactGenerationContext(
        buildStudentWordContext({
          student,
          concept,
          concepts,
          words: unique,
          lists,
          lessons,
          wordsByConceptId,
        }),
      )
    } catch (err) {
      console.warn('Andrea could not load student history for generation', err)
    }
  }

  const kindLabel = kind === 'passage' ? 'passage' : 'sentence'
  let data
  let errors
  try {
    const result = await generate({
      kind: kindLabel,
      conceptName: String(conceptName || 'this concept').trim() || 'this concept',
      words: unique.join(', '),
      studentContext: studentContext || undefined,
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
