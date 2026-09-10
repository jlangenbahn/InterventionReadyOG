/**
 * Word ↔ Concept join helpers for inline catalog edits and data-quality approve.
 */
import { client } from './amplifyClient'

function throwIfErrors(results) {
  const errors = (Array.isArray(results) ? results : [results]).flatMap(
    (result) => result?.errors ?? [],
  )
  if (errors.length) {
    throw new Error(errors.map((item) => item.message).join(', '))
  }
}

export function wordRecordId(row) {
  return row?.wordId || row?.id
}

export function assignedConceptLinks(wordId, wordsByConceptId) {
  if (!wordId || !wordsByConceptId) return []
  const links = []
  for (const [conceptId, rows] of wordsByConceptId.entries()) {
    const match = (rows ?? []).find((row) => (row.wordId || row.id) === wordId)
    if (!match) continue
    links.push({
      conceptId,
      conceptWordId: match.conceptWordId || match.id,
      word: match.word,
    })
  }
  return links
}

export function assignedConcepts(wordId, wordsByConceptId, concepts = []) {
  const byId = new Map((concepts ?? []).map((concept) => [concept.id, concept]))
  return assignedConceptLinks(wordId, wordsByConceptId)
    .map((link) => {
      const concept = byId.get(link.conceptId)
      if (!concept) return null
      return { ...concept, conceptWordId: link.conceptWordId }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.concept ?? '').localeCompare(String(b.concept ?? '')))
}

export async function saveWordConcepts({ wordId, nextConceptIds, currentLinks = [] }) {
  if (!wordId) throw new Error('Word is required')
  if (!client.models.ConceptWord) {
    throw new Error('Concept mappings are still deploying. Wait for Amplify to finish, then try again.')
  }

  const current = new Map(
    (currentLinks ?? [])
      .filter((link) => link?.conceptId && link?.conceptWordId)
      .map((link) => [link.conceptId, link.conceptWordId]),
  )
  const next = new Set((nextConceptIds ?? []).filter(Boolean))
  const toAdd = [...next].filter((conceptId) => !current.has(conceptId))
  const toRemove = [...current.entries()].filter(([conceptId]) => !next.has(conceptId))

  if (toAdd.length) {
    throwIfErrors(
      await Promise.all(
        toAdd.map((conceptId) => client.models.ConceptWord.create({ wordId, conceptId })),
      ),
    )
  }
  if (toRemove.length) {
    throwIfErrors(
      await Promise.all(
        toRemove.map(([, conceptWordId]) => client.models.ConceptWord.delete({ id: conceptWordId })),
      ),
    )
  }
}

export function wordLabelById(wordsByConceptId) {
  const map = new Map()
  for (const rows of wordsByConceptId?.values?.() ?? []) {
    for (const row of rows ?? []) {
      const id = row?.wordId || row?.id
      const label = String(row?.word ?? '').trim()
      if (id && label && !map.has(id)) map.set(id, label)
    }
  }
  return map
}
