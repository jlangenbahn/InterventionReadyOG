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

  const result = id
    ? await client.models.Lesson.update({ id, ...payload }, { selectionSet: LESSON_SELECTION })
    : await client.models.Lesson.create(payload, { selectionSet: LESSON_SELECTION })

  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join(', '))
  }
  if (!result.data?.id) throw new Error('Failed to save lesson plan')
  return result.data
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

  const [sentenceItems, passageItems] = await Promise.all([
    listAll(client.models.Sentence, {
      filter: { studentID: { eq: studentId } },
      selectionSet: ['id', 'text', 'wordCount', 'createdAt', 'studentID'],
    }).catch(() => []),
    listAll(client.models.Passage, {
      filter: { studentID: { eq: studentId } },
      selectionSet: ['id', 'title', 'text', 'wordCount', 'conceptID', 'createdAt', 'studentID'],
    }).catch(() => []),
  ])

  const lists = []
  const sentences = sentenceItems
  const passages = passageItems
  const lessons = asArray(student?.Lessons)

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
