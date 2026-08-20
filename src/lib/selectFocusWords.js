import { generateClient } from 'aws-amplify/data'
import {
  SCORE_CORRECT,
  SCORE_INCORRECT,
  buildLessonScoreMaterials,
  fetchStudentLessons,
  fetchStudentLists,
  lessonConceptKeys,
  parseScopeAndSequence,
  resolveListWords,
  studentDisplayName,
} from './fetchStudentLessonPlan'
import { FOCUS_WORD_COUNT, wordRowId } from './wordSelection'

const client = generateClient({ authMode: 'userPool' })

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

function normalizeWord(value) {
  return String(value ?? '').trim().toLowerCase()
}

function emptyExposure(word) {
  return {
    word: String(word ?? '').trim(),
    lists: 0,
    lessons: 0,
    correct: 0,
    incorrect: 0,
    lastSeen: null,
  }
}

function addExposure(map, word, patch = {}) {
  const key = normalizeWord(word)
  if (!key) return
  const current = map.get(key) ?? emptyExposure(word)
  if (patch.lists) current.lists += patch.lists
  if (patch.lessons) current.lessons += patch.lessons
  if (patch.correct) current.correct += patch.correct
  if (patch.incorrect) current.incorrect += patch.incorrect
  if (patch.lastSeen && (!current.lastSeen || String(patch.lastSeen) > String(current.lastSeen))) {
    current.lastSeen = patch.lastSeen
  }
  if (!current.word) current.word = String(word ?? '').trim()
  map.set(key, current)
}

function buildWordLookup(wordsByConceptId) {
  const lookup = new Map()
  for (const rows of wordsByConceptId?.values?.() ?? []) {
    for (const row of rows ?? []) {
      if (row?.wordId) lookup.set(row.wordId, row.word)
      if (row?.id) lookup.set(row.id, row.word)
    }
  }
  return lookup
}

function conceptNameById(concepts) {
  return new Map((concepts ?? []).map((item) => [item.id, item.concept || 'Untitled concept']))
}

function countConceptLessons(lessons, conceptId, conceptName) {
  const name = String(conceptName ?? '').trim().toLowerCase()
  let count = 0
  for (const lesson of lessons ?? []) {
    const keys = lessonConceptKeys(lesson)
    if ((conceptId && keys.has(`id:${conceptId}`)) || (name && keys.has(`name:${name}`))) {
      count += 1
    }
  }
  return count
}

function compactExposure(entry) {
  if (!entry) return null
  const seen = entry.lists + entry.lessons + entry.correct + entry.incorrect
  if (!seen) return null
  return {
    lists: entry.lists || undefined,
    lessons: entry.lessons || undefined,
    correct: entry.correct || undefined,
    incorrect: entry.incorrect || undefined,
    lastSeen: entry.lastSeen || undefined,
  }
}

function buildStudentWordContext({
  student,
  concept,
  concepts = [],
  words = [],
  lists = [],
  lessons = [],
  wordsByConceptId,
}) {
  const names = conceptNameById(concepts)
  const wordLookup = buildWordLookup(wordsByConceptId)
  const inventory = parseScopeAndSequence(student?.scopeAndSequence)
  const inventoryById = new Map(inventory.map((entry) => [entry.conceptId, entry]))
  const focusEntry = inventoryById.get(concept?.id)
  const masteryStatus = focusEntry?.masteryStatus || 'unknown'
  const priorLessonCount = countConceptLessons(lessons, concept?.id, concept?.concept)
  const isNewConcept = masteryStatus === 'new' || priorLessonCount === 0

  const exposure = new Map()
  const recentLists = []
  for (const list of lists ?? []) {
    const listWords = resolveListWords(list, wordLookup)
    recentLists.push({
      name: list?.name || 'Untitled list',
      concept: names.get(list?.conceptID) || 'Unknown concept',
      words: listWords.slice(0, 20),
    })
    for (const word of listWords) addExposure(exposure, word, { lists: 1 })
  }

  for (const lesson of lessons ?? []) {
    const materials = buildLessonScoreMaterials(lesson)
    const lastSeen = lesson?.date || lesson?.createdAt || null
    const scores = materials.scores ?? {}
    const seenThisLesson = new Set()
    for (const item of [
      ...(materials.lists ?? []).flatMap((slot) => slot.words ?? []),
      ...(materials.sentences ?? []).flatMap((slot) => slot.words ?? []),
      ...(materials.passages ?? []).flatMap((slot) => slot.words ?? []),
    ]) {
      const key = normalizeWord(item.word)
      if (!key) continue
      const state = scores[item.key]
      addExposure(exposure, item.word, {
        lessons: seenThisLesson.has(key) ? 0 : 1,
        correct: state === SCORE_CORRECT ? 1 : 0,
        incorrect: state === SCORE_INCORRECT ? 1 : 0,
        lastSeen,
      })
      seenThisLesson.add(key)
    }
  }

  const candidates = (words ?? [])
    .map((row) => {
      const word = String(row?.word ?? '').trim()
      const id = wordRowId(row)
      if (!id || !word) return null
      return {
        id,
        word,
        nonsense: Boolean(row?.isNonsenseWord),
        prior: compactExposure(exposure.get(normalizeWord(word))),
      }
    })
    .filter(Boolean)

  const inScopeConcepts = inventory
    .filter((entry) => entry?.inScope === true)
    .map((entry) => {
      const catalog = (concepts ?? []).find((item) => item.id === entry.conceptId)
      return {
        name: catalog?.concept || names.get(entry.conceptId) || 'Untitled concept',
        masteryStatus: entry.masteryStatus || 'unknown',
        level: catalog?.level || undefined,
        sequence: entry.sequence ?? undefined,
      }
    })

  const masteryCounts = { unknown: 0, new: 0, review: 0, mastered: 0 }
  for (const row of inScopeConcepts) {
    const status = masteryCounts[row.masteryStatus] != null ? row.masteryStatus : 'unknown'
    masteryCounts[status] += 1
  }

  const familiarWords = [...exposure.values()]
    .sort((a, b) => b.lists + b.lessons + b.correct - (a.lists + a.lessons + a.correct))
    .slice(0, 80)
    .map((entry) => ({
      word: entry.word,
      ...compactExposure(entry),
    }))

  return {
    student: {
      name: studentDisplayName(student),
      firstName: student?.firstName || '',
      comments: String(student?.comments ?? '').trim() || undefined,
    },
    focusConcept: {
      name: concept?.concept || 'this concept',
      category: concept?.category || undefined,
      subcategory: concept?.subcategory || undefined,
      level: concept?.level || undefined,
      definition: concept?.definition || undefined,
      inScope: focusEntry?.inScope === true,
      masteryStatus,
      sequence: focusEntry?.sequence ?? undefined,
      isNewConcept,
      priorLessonCount,
      note: isNewConcept
        ? 'This is a new or unpracticed concept for this student. Prefer words they already know so the new pattern is practiced in familiar vocabulary.'
        : `The student has practiced this concept in about ${priorLessonCount} prior lesson(s).`,
    },
    scope: {
      inScopeCount: inScopeConcepts.length,
      masteryCounts,
      inScopeConcepts,
    },
    wordHistory: {
      listCount: lists.length,
      lessonCount: lessons.length,
      recentLists: recentLists.slice(0, 12),
      familiarWords,
    },
    candidates,
  }
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

  const [lists, studentLessons] = await Promise.all([
    studentLists ? Promise.resolve(studentLists) : fetchStudentLists(student?.id),
    lessons ? Promise.resolve(lessons) : fetchStudentLessons(student?.id),
  ])

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
