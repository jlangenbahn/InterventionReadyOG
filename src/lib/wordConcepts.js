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

export const TAG_FILTER = {
  UNTAGGED: 'untagged',
  ONE_TAG: 'oneTag',
  TWO_TAGS: 'twoTags',
}

export function wordTagCountById(wordsByConceptId) {
  const idsByWord = new Map()
  for (const [conceptId, rows] of wordsByConceptId?.entries?.() ?? []) {
    if (!conceptId) continue
    for (const row of rows ?? []) {
      const wordId = row?.wordId || row?.id
      if (!wordId) continue
      let ids = idsByWord.get(wordId)
      if (!ids) {
        ids = new Set()
        idsByWord.set(wordId, ids)
      }
      ids.add(conceptId)
    }
  }
  const counts = new Map()
  for (const [wordId, ids] of idsByWord) counts.set(wordId, ids.size)
  return counts
}

export function catalogWordTagKind(tagCount) {
  if (tagCount === 0) return TAG_FILTER.UNTAGGED
  if (tagCount === 1) return TAG_FILTER.ONE_TAG
  if (tagCount === 2) return TAG_FILTER.TWO_TAGS
  return null
}

export function tagCoverage(words = [], wordsByConceptId) {
  const counts = wordTagCountById(wordsByConceptId)
  let untagged = 0
  let oneTag = 0
  let twoTags = 0
  for (const word of words ?? []) {
    if (!word?.id || !String(word.word ?? '').trim()) continue
    const kind = catalogWordTagKind(counts.get(word.id) ?? 0)
    if (kind === TAG_FILTER.UNTAGGED) untagged += 1
    else if (kind === TAG_FILTER.ONE_TAG) oneTag += 1
    else if (kind === TAG_FILTER.TWO_TAGS) twoTags += 1
  }
  return { untagged, oneTag, twoTags }
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

export function wordLabelById(wordsByConceptId, catalogWords = []) {
  const map = new Map()
  for (const word of catalogWords ?? []) {
    const id = word?.id
    const label = String(word?.word ?? '').trim()
    if (id && label) map.set(id, label)
  }
  for (const rows of wordsByConceptId?.values?.() ?? []) {
    for (const row of rows ?? []) {
      const id = row?.wordId || row?.id
      const label = String(row?.word ?? '').trim()
      if (id && label && !map.has(id)) map.set(id, label)
    }
  }
  return map
}

export function uniqueCatalogWords(catalogWords = [], wordsByConceptId) {
  const byId = new Map()
  for (const word of catalogWords ?? []) {
    if (!word?.id) continue
    byId.set(word.id, {
      id: word.id,
      wordId: word.id,
      word: word.word,
      isNonsenseWord: Boolean(word.isNonsenseWord),
      dictionaryData: word.dictionaryData ?? null,
    })
  }
  for (const rows of wordsByConceptId?.values?.() ?? []) {
    for (const row of rows ?? []) {
      const id = row?.wordId || row?.id
      if (!id) continue
      const existing = byId.get(id)
      if (existing) {
        if (existing.dictionaryData == null && row.dictionaryData != null) {
          existing.dictionaryData = row.dictionaryData
        }
        continue
      }
      byId.set(id, {
        id,
        wordId: id,
        word: row.word,
        isNonsenseWord: Boolean(row.isNonsenseWord),
        dictionaryData: row.dictionaryData ?? null,
      })
    }
  }
  return [...byId.values()].sort((a, b) =>
    String(a.word ?? '').localeCompare(String(b.word ?? '')),
  )
}
