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
import { wordRowId } from './wordSelection'

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

export async function loadStudentPracticeHistory({ studentId, studentLists, lessons }) {
  const [lists, studentLessons] = await Promise.all([
    studentLists ? Promise.resolve(studentLists) : fetchStudentLists(studentId),
    lessons ? Promise.resolve(lessons) : fetchStudentLessons(studentId),
  ])
  return { lists: lists ?? [], lessons: studentLessons ?? [] }
}

/**
 * Compact instructional history for Andrea: scope/mastery, familiar words,
 * prior lists, scores, and recent practice text.
 */
export function buildStudentWordContext({
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

  const recentTexts = []
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
    for (const sentence of materials.sentences ?? []) {
      const text = String(sentence?.text ?? '').trim()
      if (!text) continue
      recentTexts.push({
        kind: 'sentence',
        concept: sentence?.sentence?.focusConcept || undefined,
        text: text.slice(0, 220),
      })
    }
    for (const passage of materials.passages ?? []) {
      const text = String(passage?.text ?? '').trim()
      if (!text) continue
      recentTexts.push({
        kind: 'passage',
        concept: passage?.concept || undefined,
        text: text.slice(0, 280),
      })
    }
  }

  const candidates = (words ?? [])
    .map((row) => {
      const word = typeof row === 'string' ? row.trim() : String(row?.word ?? '').trim()
      const id = typeof row === 'string' ? normalizeWord(row) : wordRowId(row) || normalizeWord(word)
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

  const familiarConcepts = inScopeConcepts
    .filter((row) => row.masteryStatus === 'mastered' || row.masteryStatus === 'review')
    .slice(0, 40)
  const newConcepts = inScopeConcepts.filter((row) => row.masteryStatus === 'new').slice(0, 20)

  return {
    student: {
      name: studentDisplayName(student),
      firstName: student?.firstName || '',
      comments: String(student?.comments ?? '').trim() || undefined,
    },
    focusConcept: {
      name: concept?.concept || concept?.name || 'this concept',
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
      familiarConcepts,
      newConcepts,
    },
    wordHistory: {
      listCount: lists.length,
      lessonCount: lessons.length,
      recentLists: recentLists.slice(0, 12),
      familiarWords,
      recentTexts: recentTexts.slice(-8),
    },
    candidates,
  }
}
