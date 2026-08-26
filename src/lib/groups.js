/**
 * Instructor groups: fetch, save, and delete Group + GroupStudent join rows.
 */
import { client } from './fetchStudentLessonPlan'
import { deleteScheduledLessonsForGroup } from './schedule'

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

export async function fetchInstructorGroups() {
  if (!client.models.Group) return []
  const [groups, links] = await Promise.all([
    listAll(client.models.Group),
    client.models.GroupStudent ? listAll(client.models.GroupStudent).catch(() => []) : [],
  ])
  return (groups ?? [])
    .filter((group) => group?.id)
    .map((group) => ({
      ...group,
      studentIds: (links ?? [])
        .filter((link) => link?.groupId === group.id && link?.studentId)
        .map((link) => link.studentId),
      linkIdsByStudentId: Object.fromEntries(
        (links ?? [])
          .filter((link) => link?.groupId === group.id && link?.studentId && link?.id)
          .map((link) => [link.studentId, link.id]),
      ),
    }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
}

export async function saveInstructorGroup({ id, name, studentIds = [] }) {
  if (!client.models.Group) {
    throw new Error('Groups are still deploying. Wait for Amplify to finish, then try again.')
  }
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Give the group a name.')

  let group = null
  if (id) {
    const updated = await client.models.Group.update({ id, name: trimmed })
    if (updated.errors?.length) throw new Error(updated.errors.map((item) => item.message).join(', '))
    group = updated.data
  } else {
    const created = await client.models.Group.create({ name: trimmed })
    if (created.errors?.length) throw new Error(created.errors.map((item) => item.message).join(', '))
    group = created.data
  }
  if (!group?.id) throw new Error('Failed to save group')

  const uniqueIds = [...new Set((studentIds ?? []).filter(Boolean))]
  if (client.models.GroupStudent) {
    const existing = (await listAll(client.models.GroupStudent).catch(() => []))
      .filter((link) => link?.groupId === group.id)
    const existingByStudent = new Map(existing.map((link) => [link.studentId, link]))
    const nextSet = new Set(uniqueIds)
    const toDelete = existing.filter((link) => !nextSet.has(link.studentId))
    const toCreate = uniqueIds.filter((studentId) => !existingByStudent.has(studentId))
    const results = await Promise.all([
      ...toDelete.map((link) => client.models.GroupStudent.delete({ id: link.id })),
      ...toCreate.map((studentId) =>
        client.models.GroupStudent.create({ groupId: group.id, studentId }),
      ),
    ])
    const errors = results.flatMap((result) => result.errors ?? [])
    if (errors.length) throw new Error(errors.map((item) => item.message).join(', '))
  }

  return { ...group, studentIds: uniqueIds }
}

export async function deleteInstructorGroup(groupId) {
  if (!groupId) throw new Error('Group is required')
  if (!client.models.Group) {
    throw new Error('Groups are still deploying. Wait for Amplify to finish, then try again.')
  }

  if (client.models.GroupStudent) {
    const links = (await listAll(client.models.GroupStudent).catch(() => []))
      .filter((link) => link?.groupId === groupId && link?.id)
    const results = await Promise.all(
      links.map((link) => client.models.GroupStudent.delete({ id: link.id })),
    )
    const errors = results.flatMap((result) => result.errors ?? [])
    if (errors.length) throw new Error(errors.map((item) => item.message).join(', '))
  }

  const result = await client.models.Group.delete({ id: groupId })
  if (result.errors?.length) throw new Error(result.errors.map((item) => item.message).join(', '))
  await deleteScheduledLessonsForGroup(groupId)
}
