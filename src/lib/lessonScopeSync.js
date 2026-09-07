/**
 * After a lesson plan is saved, batch-update the student's New/Review statuses.
 */
import {
  client,
  countPreviousConceptAppearances,
  fetchStudentLessons,
  lessonConceptIds,
  parseScopeAndSequence,
} from './fetchStudentLessonPlan'
import { applyGeneratedLessonScopeStatuses, serializeScopeAndSequence } from './scopeAndSequence'

async function commitScopeInventory({ studentId, lessonId, inventory }) {
  const serialized = serializeScopeAndSequence(inventory)
  const commit = client.mutations?.commitLessonScopeStatuses
  if (typeof commit === 'function') {
    const result = await commit({
      studentId,
      lessonId,
      scopeAndSequence: serialized,
    })
    if (!result?.errors?.length) {
      return { id: studentId, scopeAndSequence: inventory }
    }
    console.warn('commitLessonScopeStatuses failed; falling back to Student.update', result.errors)
  }

  const { data, errors } = await client.models.Student.update({
    id: studentId,
    scopeAndSequence: serialized,
  })
  if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
  return { ...(data ?? { id: studentId }), scopeAndSequence: inventory }
}

/**
 * Compute New/Review from this student's lesson-plan history and persist one
 * batched Student.scopeAndSequence write (transactional when the mutation is live).
 */
export async function syncLessonGeneratedScope({ studentID, lesson, lessons }) {
  if (!studentID || !lesson?.id) return null
  const conceptIds = lessonConceptIds(lesson)
  if (!conceptIds.length) return null

  const [studentResult, history] = await Promise.all([
    client.models.Student.get({ id: studentID }, { selectionSet: ['id', 'scopeAndSequence'] }),
    lessons ? Promise.resolve(lessons) : fetchStudentLessons(studentID),
  ])
  if (studentResult.errors?.length && !studentResult.data?.id) {
    throw new Error(studentResult.errors.map((item) => item.message).join(', '))
  }

  const previousCounts = countPreviousConceptAppearances(history, lesson.id)
  const { inventory, changed } = applyGeneratedLessonScopeStatuses(
    parseScopeAndSequence(studentResult.data?.scopeAndSequence),
    conceptIds,
    previousCounts,
  )
  if (!changed) {
    return {
      id: studentID,
      ...(studentResult.data ?? {}),
      scopeAndSequence: inventory,
    }
  }

  return commitScopeInventory({
    studentId: studentID,
    lessonId: lesson.id,
    inventory,
  })
}
