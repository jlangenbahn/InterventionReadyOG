/**
 * Paradigm overlay CRUD. Labels map onto existing Concept ids.
 */
import { client } from './amplifyClient'
import { listAll } from './paginate'

function throwIfErrors(results) {
  const errors = (Array.isArray(results) ? results : [results]).flatMap(
    (result) => result?.errors ?? [],
  )
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(', '))
  }
}

function paradigmModel() {
  if (!client.models.Paradigm) {
    throw new Error('Paradigm settings are still deploying. Wait for Amplify to finish, then try again.')
  }
  return client.models.Paradigm
}

function mappingModel() {
  if (!client.models.ParadigmConceptMapping) {
    throw new Error('Paradigm settings are still deploying. Wait for Amplify to finish, then try again.')
  }
  return client.models.ParadigmConceptMapping
}

export async function fetchParadigms() {
  const items = await listAll(paradigmModel())
  items.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
  return items
}

export async function fetchParadigmMappings(paradigmId) {
  if (!paradigmId) return []
  try {
    const indexed = client.models.ParadigmConceptMapping?.listParadigmConceptMappingByParadigmId
    if (typeof indexed === 'function') {
      const items = []
      let nextToken
      do {
        const { data, errors, nextToken: token } = await indexed({ paradigmId }, { limit: 1000, nextToken })
        if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
        items.push(...(data ?? []))
        nextToken = token
      } while (nextToken)
      return items
    }
  } catch {
    // Fall through to a filtered list if the GSI is still deploying.
  }
  const items = await listAll(mappingModel(), {
    filter: { paradigmId: { eq: paradigmId } },
  })
  return items
}

export async function createParadigmWithMappings({ name, description, mappings = [] }) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Give the paradigm a name.')
  if (!mappings.length) throw new Error('Map at least one concept before saving.')

  const created = await paradigmModel().create({
    name: trimmed,
    description: String(description ?? '').trim() || null,
  })
  throwIfErrors(created)
  const paradigm = created.data
  if (!paradigm?.id) throw new Error('Failed to create paradigm')

  const results = await Promise.all(
    mappings.map((mapping, index) =>
      mappingModel().create({
        paradigmId: paradigm.id,
        baseConceptId: mapping.baseConceptId,
        label: String(mapping.label ?? '').trim(),
        sequenceOrder: Number.isFinite(mapping.sequenceOrder) ? mapping.sequenceOrder : index,
      }),
    ),
  )
  throwIfErrors(results)
  return paradigm
}
