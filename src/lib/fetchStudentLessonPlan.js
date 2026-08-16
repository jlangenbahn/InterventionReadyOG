import { generateClient } from 'aws-amplify/data'

/** Module-scope Amplify Data client — never instantiate inside a component. */
const client = generateClient()

export { client }

const STUDENT_CORE_SELECTION = [
  'id',
  'firstName',
  'lastName',
  'customID',
  'scopeAndSequence',
  'Lessons.id',
  'Lessons.date',
  'Lessons.lessonNumber',
]

const LIST_SELECTION = ['id', 'name', 'conceptID', 'studentID', 'listData', 'createdAt']

const LESSON_SELECTION = [
  'id',
  'date',
  'createdAt',
  'lessonNumber',
  'lessonData',
  'studentID',
  'concepts',
  'comments',
]

async function paginate(request) {
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await request(nextToken)
    items.push(...(data ?? []))
    if (errors?.length && !data?.length) {
      throw new Error(errors.map((e) => e.message).join(', '))
    }
    nextToken = token
  } while (nextToken)
  return items
}

async function listAll(model, options = {}) {
  return paginate((nextToken) => model.list({ limit: 1000, nextToken, ...options }))
}

function asListRecords(items, studentId) {
  return (items ?? []).filter((item) => {
    const id = item?.id
    if (!id) return false
    if (!studentId) return true
    return !item.studentID || item.studentID === studentId
  })
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  return []
}

function errorsMessage(errors) {
  return (errors ?? []).map((e) => e.message).join(', ')
}

/**
 * Load lists for a student. Tries the studentID GSI first, then the same
 * List.list + filter used by Concepts & Lists, then an owner-scoped list
 * filtered on the client. DynamoDB List records use `id` as the primary key
 * and `studentID` / `conceptID` as attributes.
 */
export async function fetchStudentLists(studentId) {
  if (!studentId) return []

  const byIndex = client.models.List.listListByStudentID
  if (typeof byIndex === 'function') {
    try {
      const indexed = asListRecords(
        await paginate((nextToken) =>
          byIndex.call(client.models.List, { studentID: studentId }, {
            limit: 1000,
            nextToken,
            selectionSet: LIST_SELECTION,
          }),
        ),
        studentId,
      )
      if (indexed.length) return indexed
    } catch {
      // Fall through to the filter query used by Concepts & Lists.
    }
  }

  try {
    const filtered = asListRecords(
      await listAll(client.models.List, {
        filter: { studentID: { eq: studentId } },
        selectionSet: LIST_SELECTION,
      }),
      studentId,
    )
    if (filtered.length) return filtered
  } catch {
    // Fall through to an owner-scoped unfiltered list.
  }

  const owned = await listAll(client.models.List, { selectionSet: LIST_SELECTION }).catch(() => [])
  return asListRecords(owned, studentId)
}

export function parseLessonData(value) {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    if (current && typeof current === 'object' && !Array.isArray(current)) return current
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed) return {}
    try {
      current = JSON.parse(trimmed)
    } catch {
      return {}
    }
  }
  return current && typeof current === 'object' && !Array.isArray(current) ? current : {}
}

export async function fetchStudentLessons(studentId) {
  if (!studentId) return []

  const byIndex = client.models.Lesson.listLessonByStudentID
  if (typeof byIndex === 'function') {
    try {
      const indexed = await paginate((nextToken) =>
        byIndex.call(client.models.Lesson, { studentID: studentId }, {
          limit: 1000,
          nextToken,
          selectionSet: LESSON_SELECTION,
        }),
      )
      return indexed.filter((item) => item?.id)
    } catch {
      // Fall through to a filtered list.
    }
  }

  try {
    const filtered = await listAll(client.models.Lesson, {
      filter: { studentID: { eq: studentId } },
      selectionSet: LESSON_SELECTION,
    })
    return filtered.filter((item) => item?.id)
  } catch {
    // Fall through to an owner-scoped unfiltered list.
  }

  const owned = await listAll(client.models.Lesson, { selectionSet: LESSON_SELECTION }).catch(() => [])
  return (owned ?? []).filter((item) => item?.id && item.studentID === studentId)
}

export async function saveStudentLesson({
  id,
  studentID,
  date,
  lessonNumber,
  conceptId,
  lessonData,
  comments,
  name,
}) {
  if (!studentID) throw new Error('Student is required to save a lesson plan')
  if (!date) throw new Error('Lesson date is required')
  if (!conceptId) throw new Error('Assign at least one list before saving so the lesson has a concept')

  const payload = {
    studentID,
    date,
    lessonNumber: Number.isFinite(Number(lessonNumber)) ? Number(lessonNumber) : 1,
    concepts: conceptId,
    lessonData: JSON.stringify(lessonData ?? {}),
  }
  if (comments !== undefined) payload.comments = comments
  if (name !== undefined) payload.name = name

  const result = id
    ? await client.models.Lesson.update({ id, ...payload }, { selectionSet: LESSON_SELECTION })
    : await client.models.Lesson.create(payload, { selectionSet: LESSON_SELECTION })

  if (result.errors?.length && name !== undefined) {
    const { name: _unusedName, ...withoutName } = payload
    const retry = id
      ? await client.models.Lesson.update({ id, ...withoutName }, { selectionSet: LESSON_SELECTION })
      : await client.models.Lesson.create(withoutName, { selectionSet: LESSON_SELECTION })
    if (!retry.errors?.length && retry.data?.id) {
      return retry.data
    }
  }

  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join(', '))
  }
  if (!result.data?.id) throw new Error('Failed to save lesson plan')
  return result.data
}

export async function copyLessonToStudents(sourceLesson, targetStudentIds = []) {
  if (!sourceLesson?.id) throw new Error('Select a lesson plan to share.')
  const uniqueIds = [...new Set((targetStudentIds ?? []).filter(Boolean))]
    .filter((id) => id !== sourceLesson.studentID)
  if (!uniqueIds.length) throw new Error('Select at least one other student.')

  const parsed = parseLessonData(sourceLesson.lessonData)
  const copiedData = {
    ...parsed,
    scores: {},
    scoreSummary: null,
    sharedFrom: {
      lessonId: sourceLesson.id,
      studentID: sourceLesson.studentID,
    },
  }
  const conceptId =
    sourceLesson.concepts
    || parsed.snapshots?.lists?.newConcept?.conceptID
    || parsed.conceptSlots?.newConceptId
    || null
  if (!conceptId) throw new Error('This lesson plan is missing a concept and cannot be shared.')

  const copied = []
  for (const studentID of uniqueIds) {
    const existing = await fetchStudentLessons(studentID)
    const saved = await saveStudentLesson({
      studentID,
      date: sourceLesson.date,
      lessonNumber: nextLessonNumber(existing),
      conceptId,
      lessonData: copiedData,
      comments: sourceLesson.comments ?? parsed.notes ?? null,
      name: sourceLesson.name || parsed.name || null,
    })
    copied.push(saved)
  }
  return copied
}

async function listStudentPassages(studentId) {
  const filter = { studentID: { eq: studentId } }
  const core = ['id', 'title', 'text', 'wordCount', 'conceptID', 'createdAt', 'studentID']
  try {
    return await listAll(client.models.Passage, {
      filter,
      selectionSet: [...core, 'passageData'],
    })
  } catch {
    return listAll(client.models.Passage, { filter, selectionSet: core }).catch(() => [])
  }
}

async function listStudentSentences(studentId) {
  const filter = { studentID: { eq: studentId } }
  const core = ['id', 'text', 'wordCount', 'createdAt', 'studentID', 'sentenceData']
  try {
    return await listAll(client.models.Sentence, {
      filter,
      selectionSet: [...core, 'conceptID'],
    })
  } catch {
    return listAll(client.models.Sentence, { filter, selectionSet: core }).catch(() => [])
  }
}

export async function fetchStudentSentencesAndPassages(studentId) {
  if (!studentId) return { sentences: [], passages: [] }
  const [sentences, passages] = await Promise.all([
    listStudentSentences(studentId),
    listStudentPassages(studentId),
  ])
  sentences.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  passages.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  return { sentences, passages }
}

/**
 * Load a student plus their sentences, passages, and lessons.
 * Lists are loaded separately via fetchStudentLists so a Student.get failure
 * cannot blank out the List Selection grid.
 */
export async function fetchStudentLessonPlan(studentId) {
  if (!studentId) return null

  let student = null
  try {
    const { data, errors } = await client.models.Student.get(
      { id: studentId },
      { selectionSet: STUDENT_CORE_SELECTION },
    )
    student = data
    if (!student && errors?.length) {
      throw new Error(errorsMessage(errors) || 'Student not found')
    }
  } catch {
    student = { id: studentId }
  }

  const { sentences, passages } = await fetchStudentSentencesAndPassages(studentId)
  const lists = []
  const lessons = asArray(student?.Lessons)

  return {
    student,
    lists,
    sentences,
    passages,
    lessons,
  }
}

export function parseScopeAndSequence(value) {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    if (Array.isArray(current)) return current
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed) return []
    try {
      current = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  return Array.isArray(current) ? current : []
}

export function parseListData(value) {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    if (current && typeof current === 'object' && !Array.isArray(current)) return current
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed) return {}
    try {
      current = JSON.parse(trimmed)
    } catch {
      return {}
    }
  }
  return current && typeof current === 'object' && !Array.isArray(current) ? current : {}
}

export function formatLessonDisplayName(customName, conceptName, lessonNumber) {
  const name = String(customName ?? '').trim()
  const concept = String(conceptName ?? '').trim()
  if (name && concept) return `${name} — ${concept}`
  if (name) return name
  if (concept && lessonNumber) return `Lesson ${lessonNumber} — ${concept}`
  if (concept) return concept
  if (lessonNumber) return `Lesson ${lessonNumber}`
  return ''
}

export function resolveSentenceFocusId(sentence) {
  return resolveFocusConceptId(sentence, 'sentenceData')
}

export function resolvePassageFocusId(passage) {
  return resolveFocusConceptId(passage, 'passageData')
}

function resolveFocusConceptId(record, dataField) {
  if (record?.conceptID) return record.conceptID
  const data = parseListData(record?.[dataField])
  return data.focusConceptId || data.tags?.conceptCounts?.[0]?.id || null
}

export function resolveListWords(list, wordLookup) {
  const nested = asArray(list?.words)
    .map((link) => {
      if (typeof link === 'string') return link
      if (typeof link?.word === 'string') return link.word
      return link?.word?.word
    })
    .filter(Boolean)
  if (nested.length) return nested

  const data = parseListData(list?.listData)
  const wordIds = Array.isArray(data.wordIds) ? data.wordIds : []
  if (!wordIds.length || !wordLookup) return []
  return wordIds.map((id) => wordLookup.get(id)).filter(Boolean)
}

export function studentDisplayName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unnamed student'
}

export function nextLessonNumber(lessons) {
  const numbers = asArray(lessons)
    .map((lesson) => Number(lesson?.lessonNumber))
    .filter((n) => Number.isFinite(n))
  if (!numbers.length) return asArray(lessons).length + 1
  return Math.max(...numbers) + 1
}

export const SCORE_UNSCORED = 'unscored'
export const SCORE_CORRECT = 'correct'
export const SCORE_INCORRECT = 'incorrect'
export const SCORE_CYCLE = [SCORE_UNSCORED, SCORE_CORRECT, SCORE_INCORRECT]

const LIST_SCORE_SLOTS = [
  { key: 'newConcept', section: 'new', label: 'New concept' },
  { key: 'review1', section: 'review', label: 'Review concept #1' },
  { key: 'review2', section: 'review', label: 'Review concept #2' },
  { key: 'review3', section: 'review', label: 'Review concept #3' },
]

const SENTENCE_SCORE_SLOTS = [
  { key: 'sentence1', label: 'Sentence #1' },
  { key: 'sentence2', label: 'Sentence #2' },
  { key: 'sentence3', label: 'Sentence #3' },
  { key: 'sentence4', label: 'Sentence #4' },
  { key: 'sentence5', label: 'Sentence #5' },
  { key: 'sentence6', label: 'Sentence #6' },
]

const PASSAGE_SCORE_SLOTS = [
  { key: 'passage1', label: 'Passage #1' },
  { key: 'passage2', label: 'Passage #2' },
]

export function nextScoreState(current) {
  const index = SCORE_CYCLE.indexOf(current)
  const from = index >= 0 ? index : 0
  return SCORE_CYCLE[(from + 1) % SCORE_CYCLE.length]
}

export function tokenizeWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean)
}

export function tallyScores(keys, scores) {
  let correct = 0
  let incorrect = 0
  let unscored = 0
  for (const key of keys ?? []) {
    const state = scores?.[key] || SCORE_UNSCORED
    if (state === SCORE_CORRECT) correct += 1
    else if (state === SCORE_INCORRECT) incorrect += 1
    else unscored += 1
  }
  const total = (keys ?? []).length
  const scored = correct + incorrect
  return {
    correct,
    incorrect,
    unscored,
    total,
    scored,
    accuracy: scored ? correct / scored : null,
  }
}

function formatPercent(accuracy) {
  if (accuracy == null) return ''
  return `${Math.round(accuracy * 100)}%`
}

export function formatScoreTally(tally) {
  if (!tally?.total) return '—'
  if (!tally.scored) return `0/${tally.total} scored`
  const percent = formatPercent(tally.accuracy)
  return percent
    ? `${tally.correct}/${tally.scored} (${percent})`
    : `${tally.correct}/${tally.scored}`
}

function conceptIdentityKeys(conceptID, conceptName) {
  const keys = []
  if (conceptID) keys.push(`id:${conceptID}`)
  const name = String(conceptName ?? '').trim().toLowerCase()
  if (name) keys.push(`name:${name}`)
  return keys
}

export function lessonConceptKeys(lesson) {
  const data = parseLessonData(lesson?.lessonData)
  const keys = new Set()
  const lists = data.snapshots?.lists ?? {}
  for (const list of Object.values(lists)) {
    for (const key of conceptIdentityKeys(list?.conceptID, list?.concept)) keys.add(key)
  }
  if (lesson?.concepts) keys.add(`id:${lesson.concepts}`)
  const passage = data.snapshots?.passage
  for (const key of conceptIdentityKeys(passage?.conceptID, passage?.concept)) keys.add(key)
  const passageList = Array.isArray(data.snapshots?.passages) ? data.snapshots.passages : []
  for (const item of passageList) {
    for (const key of conceptIdentityKeys(item?.conceptID, item?.concept)) keys.add(key)
  }
  return keys
}

function isPreviousLesson(lesson, current) {
  if (!lesson?.id || lesson.id === current?.id) return false
  const lessonDate = String(lesson.date ?? '')
  const currentDate = String(current?.date ?? '')
  if (lessonDate && currentDate && lessonDate !== currentDate) return lessonDate < currentDate
  return String(lesson.createdAt ?? '') < String(current?.createdAt ?? '')
}

export function countConceptExposures(lessons, currentLesson, conceptID, conceptName) {
  const matchKeys = new Set(conceptIdentityKeys(conceptID, conceptName))
  if (!matchKeys.size) return 0
  let count = 0
  for (const lesson of lessons ?? []) {
    if (!isPreviousLesson(lesson, currentLesson)) continue
    const keys = lessonConceptKeys(lesson)
    let hit = false
    for (const key of matchKeys) {
      if (keys.has(key)) {
        hit = true
        break
      }
    }
    if (hit) count += 1
  }
  return count
}

function wordItems(prefix, slotKey, words) {
  return (words ?? []).map((word, index) => ({
    key: `${prefix}:${slotKey}:${index}`,
    word: String(word),
  }))
}

export function buildLessonScoreMaterials(lesson) {
  const data = parseLessonData(lesson?.lessonData)
  const snaps = data.snapshots ?? {}
  const lists = LIST_SCORE_SLOTS.map((slot) => {
    const list = snaps.lists?.[slot.key] ?? null
    const words = Array.isArray(list?.words) ? list.words.filter(Boolean) : []
    return {
      ...slot,
      list,
      name: list?.name || '',
      concept: list?.concept || '',
      conceptID: list?.conceptID || null,
      words: wordItems('list', slot.key, words),
    }
  })

  const sentenceSnaps = Array.isArray(snaps.sentences) ? snaps.sentences : []
  const sentences = SENTENCE_SCORE_SLOTS.map((slot, index) => {
    const sentence = snaps.sentences?.[slot.key] ?? sentenceSnaps[index] ?? null
    return {
      ...slot,
      sentence,
      text: sentence?.text || '',
      words: wordItems('sentence', slot.key, tokenizeWords(sentence?.text || '')),
    }
  }).filter((sentence) => sentence.words.length)

  const passageSnaps = Array.isArray(snaps.passages)
    ? snaps.passages
    : snaps.passage
      ? [snaps.passage]
      : []
  const passages = PASSAGE_SCORE_SLOTS.map((slot, index) => {
    const passage = snaps.passages?.[slot.key] ?? passageSnaps[index] ?? (index === 0 ? snaps.passage : null) ?? null
    return {
      ...slot,
      passage,
      title: passage?.title || '',
      concept: passage?.concept || '',
      conceptID: passage?.conceptID || null,
      text: passage?.text || '',
      words: wordItems('passage', slot.key, tokenizeWords(passage?.text || '')),
    }
  }).filter((item) => item.words.length)

  const allKeys = [
    ...lists.flatMap((list) => list.words.map((item) => item.key)),
    ...sentences.flatMap((sentence) => sentence.words.map((item) => item.key)),
    ...passages.flatMap((item) => item.words.map((itemWord) => itemWord.key)),
  ]

  return {
    lists,
    sentences,
    passages,
    passage: passages[0] ?? {
      key: 'passage1',
      label: 'Passage',
      passage: null,
      title: '',
      concept: '',
      conceptID: null,
      text: '',
      words: [],
    },
    allKeys,
    scores: data.scores && typeof data.scores === 'object' ? data.scores : {},
    scoreSummary: data.scoreSummary && typeof data.scoreSummary === 'object' ? data.scoreSummary : null,
  }
}

/**
 * Map student lists onto the template slots:
 *   lists[0..2] → review (prefer masteryStatus === 'review')
 *   one 'new' list → Guided Discovery
 */
export function classifyListsForLesson(lists, inventory) {
  const byConcept = new Map((inventory ?? []).map((entry) => [entry.conceptId, entry]))
  const review = []
  const neu = []
  const other = []

  for (const list of lists ?? []) {
    const status = byConcept.get(list.conceptID)?.masteryStatus
    if (status === 'review') review.push(list)
    else if (status === 'new') neu.push(list)
    else other.push(list)
  }

  const reviewLists = [...review]
  const leftover = []
  for (const list of other) {
    if (reviewLists.length < 3) reviewLists.push(list)
    else leftover.push(list)
  }

  return {
    reviewLists: reviewLists.slice(0, 3),
    newConceptList: neu[0] ?? leftover[0] ?? null,
  }
}
