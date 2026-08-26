/**
 * Publish, list, apply, and delete reusable lesson templates (My vs Global).
 */
import { client, fetchStudentLessons, nextLessonNumber, saveStudentLesson } from './fetchStudentLessonPlan'
import {
  canonicalToPlan,
  getLessonPlan,
  planFieldSelection,
} from './lessonPlanDocument'

const TEMPLATE_SELECTION = [
  'id',
  'name',
  'summary',
  'searchName',
  'focusConceptId',
  'conceptName',
  'category',
  'level',
  'reviewConceptIds',
  'reviewConceptNames',
  'createdAt',
  'updatedAt',
  'owner',
  ...planFieldSelection('plan'),
]

const TEMPLATE_SELECTION_PUBLIC = TEMPLATE_SELECTION.filter((field) => field !== 'owner')

async function paginate(request) {
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await request(nextToken)
    items.push(...(data ?? []))
    if (errors?.length && !data?.length) {
      throw new Error(errors.map((item) => item.message).join(', '))
    }
    nextToken = token
  } while (nextToken)
  return items
}

function throwIfErrors(result) {
  if (result?.errors?.length) {
    throw new Error(result.errors.map((item) => item.message).join(', '))
  }
}

function conceptLookup(concepts = []) {
  return new Map((concepts ?? []).filter((item) => item?.id).map((item) => [item.id, item]))
}

function reviewNamesFromPlan(plan, conceptsById) {
  const ids = plan?.conceptSlots?.reviewConceptIds ?? []
  const fromLists = ['review1', 'review2', 'review3']
    .map((key) => plan?.snapshots?.lists?.[key]?.concept)
    .filter(Boolean)
  if (fromLists.length) return fromLists
  return ids
    .map((id) => conceptsById.get(id)?.concept)
    .filter(Boolean)
}

export function templateIsOwnedBy(template, identity) {
  const owner = String(template?.owner ?? '')
  if (!owner) return false
  const candidates = (Array.isArray(identity) ? identity : [identity]).filter(Boolean)
  return candidates.some((value) => String(value) === owner)
}

async function listTemplates(selectionSet, focusConceptId) {
  const byConcept = client.models.LessonTemplate.listLessonTemplateByFocusConceptId
  if (focusConceptId && typeof byConcept === 'function') {
    try {
      const indexed = await paginate((nextToken) =>
        byConcept.call(client.models.LessonTemplate, { focusConceptId }, {
          limit: 1000,
          nextToken,
          selectionSet,
        }),
      )
      if (indexed.length) return indexed.filter((item) => item?.id)
    } catch {
      // Fall through to a full list.
    }
  }

  const items = await paginate((nextToken) =>
    client.models.LessonTemplate.list({
      limit: 1000,
      nextToken,
      selectionSet,
    }),
  )
  const all = items.filter((item) => item?.id)
  if (!focusConceptId) return all
  return all.filter((item) => item.focusConceptId === focusConceptId)
}

export async function listLessonTemplates({ focusConceptId } = {}) {
  if (!client.models.LessonTemplate) {
    throw new Error('Lesson templates are still deploying. Wait for Amplify sandbox to finish, then try again.')
  }
  try {
    return await listTemplates(TEMPLATE_SELECTION, focusConceptId)
  } catch {
    return listTemplates(TEMPLATE_SELECTION_PUBLIC, focusConceptId)
  }
}

export async function publishLessonTemplate({
  lesson,
  name,
  summary,
  concepts = [],
}) {
  if (!client.models.LessonTemplate) {
    throw new Error('Lesson templates are still deploying. Wait for Amplify sandbox to finish, then try again.')
  }
  if (!lesson?.id) throw new Error('Save the lesson plan before publishing it as a template.')

  const plan = getLessonPlan(lesson)
  const conceptsById = conceptLookup(concepts)
  const focusConceptId =
    plan.conceptSlots?.newConceptId
    || plan.snapshots?.lists?.newConcept?.conceptID
    || lesson.concepts
    || null
  if (!focusConceptId) {
    throw new Error('This lesson plan needs a new concept before it can be published.')
  }

  const concept = conceptsById.get(focusConceptId)
  const conceptName =
    plan.snapshots?.lists?.newConcept?.concept
    || concept?.concept
    || ''
  const trimmedName = String(name ?? '').trim()
    || String(lesson.name || plan.name || '').trim()
    || (conceptName ? `Lesson plan – ${conceptName}` : 'Lesson plan')
  const reviewConceptIds = plan.conceptSlots?.reviewConceptIds ?? []

  const { data, errors } = await client.models.LessonTemplate.create({
    name: trimmedName,
    summary: String(summary ?? '').trim() || null,
    searchName: trimmedName.toLowerCase(),
    focusConceptId,
    conceptName: conceptName || null,
    category: concept?.category || null,
    level: concept?.level || null,
    reviewConceptIds,
    reviewConceptNames: reviewNamesFromPlan(plan, conceptsById),
    plan: canonicalToPlan(plan),
    sourceLessonId: lesson.id,
  }, { selectionSet: TEMPLATE_SELECTION })

  throwIfErrors({ errors })
  if (!data?.id) throw new Error('Failed to publish lesson template')
  return data
}

export async function deleteLessonTemplate(templateId) {
  if (!templateId) return
  if (!client.models.LessonTemplate) {
    throw new Error('Lesson templates are still deploying. Wait for Amplify sandbox to finish, then try again.')
  }
  const result = await client.models.LessonTemplate.delete({ id: templateId })
  throwIfErrors(result)
}

export async function applyLessonTemplate({ template, studentId }) {
  if (!template?.id) throw new Error('Select a lesson template.')
  if (!studentId) throw new Error('Select a student to apply this template to.')

  const plan = getLessonPlan(template)
  const focusConceptId =
    template.focusConceptId
    || plan.conceptSlots?.newConceptId
    || plan.snapshots?.lists?.newConcept?.conceptID
    || null
  if (!focusConceptId) {
    throw new Error('This template is missing a focus concept and cannot be applied.')
  }

  const existing = await fetchStudentLessons(studentId)
  return saveStudentLesson({
    studentID: studentId,
    date: new Date().toISOString().slice(0, 10),
    lessonNumber: nextLessonNumber(existing),
    conceptId: focusConceptId,
    plan,
    scores: {},
    comments: null,
    name: template.name || null,
  })
}
