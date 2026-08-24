import { client } from './fetchStudentLessonPlan'
import { serializeTagResult } from './tagMultiWordText'
import { removeStudentFromSchedule } from './schedule'

async function listAll(model, options = {}) {
  if (!model?.list) return []
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await model.list({
      limit: 1000,
      nextToken,
      ...options,
    })
    items.push(...(data ?? []))
    if (errors?.length && !data?.length) {
      throw new Error(errors.map((item) => item.message).join(', '))
    }
    nextToken = token
  } while (nextToken)
  return items
}

function throwIfErrors(results) {
  const errors = (Array.isArray(results) ? results : [results]).flatMap(
    (result) => result?.errors ?? [],
  )
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(', '))
  }
}

async function deleteByIds(model, ids) {
  if (!model?.delete) return
  const unique = [...new Set((ids ?? []).filter(Boolean))]
  for (let index = 0; index < unique.length; index += 25) {
    const chunk = unique.slice(index, index + 25)
    const results = await Promise.all(chunk.map((id) => model.delete({ id })))
    throwIfErrors(results)
  }
}

async function listIdsByField(model, field, value) {
  if (!model?.list || !value) return []
  try {
    const items = await listAll(model, {
      filter: { [field]: { eq: value } },
      selectionSet: ['id'],
    })
    return items.map((item) => item?.id).filter(Boolean)
  } catch {
    const items = await listAll(model, { selectionSet: ['id', field] }).catch(() => [])
    return items.filter((item) => item?.[field] === value).map((item) => item.id).filter(Boolean)
  }
}

async function deleteWhere(model, field, value) {
  const ids = await listIdsByField(model, field, value)
  await deleteByIds(model, ids)
}

export async function updateStudent({ id, firstName, lastName, customID, comments }) {
  if (!id) throw new Error('Student is required')
  const { data, errors } = await client.models.Student.update({
    id,
    firstName: firstName?.trim() || null,
    lastName: lastName?.trim() || null,
    customID: customID?.trim() || null,
    comments: comments?.trim() || null,
  })
  if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
  if (!data?.id) throw new Error('Failed to update student')
  return data
}

export async function deleteWordList(listId) {
  if (!listId) return
  await Promise.all([
    deleteWhere(client.models.WordList, 'listId', listId),
    deleteWhere(client.models.ListLesson, 'listId', listId),
  ])
  const result = await client.models.List.delete({ id: listId })
  throwIfErrors(result)
}

export async function updateWordList({ id, name }) {
  if (!id) throw new Error('List is required')
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Give the list a name.')
  const { data, errors } = await client.models.List.update({ id, name: trimmed })
  if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
  if (!data?.id) throw new Error('Failed to rename list')
  return data
}

export async function createWordList({ studentId, conceptId, name, selectedWordRows = [] }) {
  const trimmed = String(name ?? '').trim()
  if (!studentId) throw new Error('Student is required')
  if (!conceptId) throw new Error('Concept is required')
  if (!trimmed) throw new Error('Give the list a name.')
  if (!selectedWordRows.length) throw new Error('Select at least one word.')

  const conceptWordIds = selectedWordRows.map((row) => row.conceptWordId).filter(Boolean)
  const wordIds = selectedWordRows.map((row) => row.wordId || row.id).filter(Boolean)
  const { data, errors } = await client.models.List.create({
    name: trimmed,
    conceptID: conceptId,
    studentID: studentId,
    listData: JSON.stringify({
      conceptId,
      conceptWordIds,
      wordIds,
    }),
  })
  if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
  if (!data?.id) throw new Error('Failed to create list')

  const linkResults = await Promise.all(
    wordIds.map((wordId) => client.models.WordList.create({ wordId, listId: data.id })),
  )
  throwIfErrors(linkResults)
  return data
}

export async function deleteSentence(sentenceId) {
  if (!sentenceId) return
  await Promise.all([
    deleteWhere(client.models.SentenceWord, 'sentenceId', sentenceId),
    deleteWhere(client.models.SentenceConcept, 'sentenceId', sentenceId),
    deleteWhere(client.models.SentenceLesson, 'sentenceId', sentenceId),
  ])
  const result = await client.models.Sentence.delete({ id: sentenceId })
  throwIfErrors(result)
}

export async function deletePassage(passageId) {
  if (!passageId) return
  await deleteWhere(client.models.PassageLesson, 'passageId', passageId)
  const result = await client.models.Passage.delete({ id: passageId })
  throwIfErrors(result)
}

async function replaceSentenceLinks(sentenceId, tagged) {
  await Promise.all([
    deleteWhere(client.models.SentenceWord, 'sentenceId', sentenceId),
    deleteWhere(client.models.SentenceConcept, 'sentenceId', sentenceId),
  ])
  const wordIds = [...new Set((tagged?.wordIds ?? []).filter(Boolean))]
  const conceptIds = [...new Set((tagged?.conceptIds ?? []).filter(Boolean))]
  const results = await Promise.all([
    ...wordIds.map((wordId) => client.models.SentenceWord.create({ sentenceId, wordId })),
    ...conceptIds.map((conceptId) =>
      client.models.SentenceConcept.create({ sentenceId, conceptId }),
    ),
  ])
  throwIfErrors(results)
}

export async function updateSentence({ id, text, wordCount, conceptID, tagged }) {
  if (!id) throw new Error('Sentence is required')
  const payload = {
    id,
    text,
    wordCount,
    sentenceData: JSON.stringify({
      tags: serializeTagResult(tagged),
      focusConceptId: conceptID,
    }),
  }
  let result = await client.models.Sentence.update({ ...payload, conceptID })
  if (result.errors?.length) {
    result = await client.models.Sentence.update(payload)
  }
  throwIfErrors(result)
  if (!result.data?.id) throw new Error('Failed to update sentence')
  await replaceSentenceLinks(id, tagged)
  return result.data
}

export async function updatePassage({ id, title, text, wordCount, conceptID, tagged }) {
  if (!id) throw new Error('Passage is required')
  const { data, errors } = await client.models.Passage.update({
    id,
    title,
    text,
    wordCount,
    conceptID,
    passageData: JSON.stringify({
      tags: serializeTagResult(tagged),
      focusConceptId: conceptID,
    }),
  })
  if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
  if (!data?.id) throw new Error('Failed to update passage')
  return data
}

export async function deleteLesson(lessonId) {
  if (!lessonId) return
  await Promise.all([
    deleteWhere(client.models.ConceptLesson, 'lessonId', lessonId),
    deleteWhere(client.models.PassageLesson, 'lessonId', lessonId),
    deleteWhere(client.models.SentenceLesson, 'lessonId', lessonId),
    deleteWhere(client.models.ListLesson, 'lessonId', lessonId),
  ])
  const result = await client.models.Lesson.delete({ id: lessonId })
  throwIfErrors(result)
}

/**
 * Permanently remove a student and the records that belong to them:
 * lessons, lists, sentences, passages, scheduled lessons, and group membership.
 */
export async function deleteStudentCascade(studentId) {
  if (!studentId) throw new Error('Student is required')

  const [lists, lessons, sentences, passages] = await Promise.all([
    listIdsByField(client.models.List, 'studentID', studentId),
    listIdsByField(client.models.Lesson, 'studentID', studentId),
    listIdsByField(client.models.Sentence, 'studentID', studentId),
    listIdsByField(client.models.Passage, 'studentID', studentId),
  ])

  for (const listId of lists) await deleteWordList(listId)
  for (const sentenceId of sentences) await deleteSentence(sentenceId)
  for (const passageId of passages) await deletePassage(passageId)
  for (const lessonId of lessons) await deleteLesson(lessonId)
  await removeStudentFromSchedule(studentId)

  await Promise.all([
    deleteWhere(client.models.GroupStudent, 'studentId', studentId),
    deleteWhere(client.models.StudentConcept, 'studentId', studentId),
  ])

  const result = await client.models.Student.delete({ id: studentId })
  throwIfErrors(result)
}
