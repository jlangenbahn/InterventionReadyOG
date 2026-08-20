import { client } from './amplifyClient'
import { FOCUS_WORD_COUNT } from './wordSelection'
import { studentDisplayName } from './fetchStudentLessonPlan'
import { buildStudentWordContext, loadStudentPracticeHistory } from './studentPracticeContext'

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

function unwrapGeneratedText(data) {
  if (typeof data === 'string') return data.trim()
  if (data && typeof data.text === 'string') return data.text.trim()
  return ''
}

function parseSelection(text) {
  const trimmed = String(text ?? '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return { ids: [], summary: '' }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.map((id) => String(id)).filter(Boolean) : []
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : ''
    return { ids, summary }
  } catch {
    return { ids: [], summary: '' }
  }
}

/**
 * Ask Bedrock to pick the best practice words for this student from a concept set.
 */
export async function selectFocusWords({
  student,
  concept,
  concepts = [],
  words = [],
  studentLists,
  lessons,
  wordsByConceptId,
  count = FOCUS_WORD_COUNT,
}) {
  const select = client.queries?.selectFocusWords
  if (typeof select !== 'function') {
    throw new Error(
      'Andrea is not available in this app session. Refresh the page after the latest deploy finishes.',
    )
  }

  const { lists, lessons: studentLessons } = await loadStudentPracticeHistory({
    studentId: student?.id,
    studentLists,
    lessons,
  })

  const payload = buildStudentWordContext({
    student,
    concept,
    concepts,
    words,
    lists,
    lessons: studentLessons,
    wordsByConceptId,
  })

  if (!payload.candidates.length) {
    throw new Error('This concept has no words for Andrea to choose from.')
  }

  let data
  let errors
  try {
    const result = await select({
      payload: JSON.stringify(payload),
      count,
    })
    data = result?.data
    errors = result?.errors
  } catch (err) {
    console.error('Andrea word selection failed', err)
    throw new Error(
      messageFromUnknown(err) ||
        'Andrea could not pick words. In the AWS Console, open Amazon Bedrock in Ohio (us-east-2) and enable Claude Haiku 4.5.',
    )
  }

  const errorText = messageFromErrors(errors)
  if (errorText) {
    console.error('Andrea word selection returned errors', errors)
    throw new Error(errorText)
  }

  const parsed = parseSelection(unwrapGeneratedText(data))
  const allowed = new Set(payload.candidates.map((item) => item.id))
  const ids = parsed.ids.filter((id) => allowed.has(id)).slice(0, count)
  if (!ids.length) {
    throw new Error('Andrea did not return a usable word set. Try again.')
  }

  return {
    ids,
    summary: parsed.summary || `Andrea selected ${ids.length} words for ${studentDisplayName(student)}.`,
  }
}

