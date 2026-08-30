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

export function wordsFromConceptBank(wordsByConceptId, conceptId) {
  if (!conceptId) return []
  return uniqueWords(wordsByConceptId?.get?.(conceptId) ?? [])
}

export function buildWordBanks(banks) {
  return (banks ?? [])
    .map((bank) => ({
      role: bank?.role === 'new' ? 'new' : 'review',
      conceptName: String(bank?.conceptName || bank?.concept || 'this concept').trim() || 'this concept',
      words: uniqueWords(bank?.words),
    }))
    .filter((bank) => bank.words.length)
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
  })
}

/**
 * Ask Bedrock for a simple sentence or passage built from full concept word banks,
 * tailored with this student's practice history when available.
 */
export async function generateLessonText({
  kind,
  conceptName,
  words,
  wordBanks,
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

  const banks = buildWordBanks(wordBanks)
  const unique = banks.length ? uniqueWords(banks.flatMap((bank) => bank.words)) : uniqueWords(words)
  if (!unique.length) {
    throw new Error('Choose a concept that has words in the catalog.')
  }

  const wordsPayload = banks.length ? JSON.stringify({ banks }) : unique.join(', ')
  const contextSample = unique.slice(0, 40)

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
          words: contextSample,
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
      words: wordsPayload,
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
    throw new Error('The AI did not return any text. Try another concept or try again.')
  }
  return sanitizeGeneratedLessonText(text, { conceptName }).text
}
