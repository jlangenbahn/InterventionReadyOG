import { generateClient } from 'aws-amplify/data'

/** Module-scope Amplify Data client — never instantiate inside a component. */
const client = generateClient()

export { client }

const STUDENT_LESSON_SELECTION = [
  'id',
  'firstName',
  'lastName',
  'customID',
  'scopeAndSequence',
  'Lists.id',
  'Lists.name',
  'Lists.conceptID',
  'Lists.listData',
  'Lists.createdAt',
  'Lists.words.wordId',
  'Lists.words.word.id',
  'Lists.words.word.word',
  'Sentences.id',
  'Sentences.text',
  'Sentences.wordCount',
  'Sentences.createdAt',
  'Passages.id',
  'Passages.title',
  'Passages.text',
  'Passages.wordCount',
  'Passages.conceptID',
  'Passages.createdAt',
  'Lessons.id',
  'Lessons.date',
  'Lessons.lessonNumber',
]

const STUDENT_LESSON_SELECTION_LISTS_ONLY = [
  'id',
  'firstName',
  'lastName',
  'customID',
  'scopeAndSequence',
  'Lists.id',
  'Lists.name',
  'Lists.conceptID',
  'Lists.listData',
  'Lists.createdAt',
  'Lessons.id',
  'Lessons.date',
  'Lessons.lessonNumber',
]

async function listAll(model, options = {}) {
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await model.list({
      limit: 1000,
      nextToken,
      ...options,
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join(', '))
    }
    items.push(...(data ?? []))
    nextToken = token
  } while (nextToken)
  return items
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
 * Deep-fetch a student with related lists (including words), sentences, and passages.
 *
 * Primary path (Amplify Gen 2 eager load):
 *   client.models.Student.get({ id }, { selectionSet: ['Lists.*', 'Sentences.*', 'Passages.*', ...] })
 *
 * Falls back to Lists/Lessons only if Sentences/Passages relations are not yet deployed,
 * then fills sentences/passages from the concept catalog for in-scope review/new concepts.
 */
export async function fetchStudentLessonPlan(studentId) {
  if (!studentId) return null

  let student
  let errors

  const attempts = [STUDENT_LESSON_SELECTION, STUDENT_LESSON_SELECTION_LISTS_ONLY]
  for (const selectionSet of attempts) {
    ;({ data: student, errors } = await client.models.Student.get(
      { id: studentId },
      { selectionSet },
    ))
    if (student) break
    const message = errorsMessage(errors)
    const retryable = /Sentence|Passage|words/i.test(message)
    if (!retryable || selectionSet === STUDENT_LESSON_SELECTION_LISTS_ONLY) {
      throw new Error(message || 'Student not found')
    }
  }

  if (!student) return null

  let lists = asArray(student.Lists)
  if (!lists.length) {
    lists = await listAll(client.models.List, {
      filter: { studentID: { eq: studentId } },
      selectionSet: ['id', 'name', 'conceptID', 'studentID', 'listData', 'createdAt'],
    })
  }

  const lessons = asArray(student.Lessons)
  let sentences = asArray(student.Sentences)
  let passages = asArray(student.Passages)

  if (!sentences.length || !passages.length) {
    const fallback = await fetchCatalogMaterials(student)
    if (!sentences.length) sentences = fallback.sentences
    if (!passages.length) passages = fallback.passages
  }

  lists.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  sentences.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  passages.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))

  return {
    student,
    lists,
    sentences,
    passages,
    lessons,
  }
}

async function fetchCatalogMaterials(student) {
  const inventory = parseScopeAndSequence(student.scopeAndSequence)
  const preferredIds = inventory
    .filter((entry) => entry.inScope && (entry.masteryStatus === 'new' || entry.masteryStatus === 'review'))
    .map((entry) => entry.conceptId)
    .filter(Boolean)
  const fallbackIds = inventory
    .filter((entry) => entry.inScope)
    .map((entry) => entry.conceptId)
    .filter(Boolean)
  const conceptIds = [...new Set(preferredIds.length ? preferredIds : fallbackIds)].slice(0, 8)

  if (!conceptIds.length) {
    return { sentences: [], passages: [] }
  }

  const orFilter = { or: conceptIds.map((id) => ({ conceptId: { eq: id } })) }
  const passageOrFilter = { or: conceptIds.map((id) => ({ conceptID: { eq: id } })) }

  const [sentenceLinks, passageItems] = await Promise.all([
    listAll(client.models.SentenceConcept, {
      filter: orFilter,
      selectionSet: ['id', 'sentenceId', 'conceptId', 'sentence.id', 'sentence.text', 'sentence.wordCount'],
    }).catch(() => []),
    listAll(client.models.Passage, {
      filter: passageOrFilter,
      selectionSet: ['id', 'title', 'text', 'wordCount', 'conceptID'],
    }).catch(() => []),
  ])

  const sentences = []
  const seenSentence = new Set()
  for (const link of sentenceLinks) {
    const sentence = link.sentence
    if (!sentence?.id || seenSentence.has(sentence.id) || !sentence.text) continue
    seenSentence.add(sentence.id)
    sentences.push(sentence)
  }

  return { sentences, passages: passageItems }
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
