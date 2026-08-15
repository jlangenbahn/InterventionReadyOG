/**
 * Tokenize multi-word text (sentences, passages, freeform lists) and tag
 * each token against the concept-word catalog.
 */

export function normalizeLookupWord(value) {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}']+/u, '')
    .replace(/[^\p{L}\p{N}']+$/u, '')
  if (!trimmed) return ''
  if (trimmed.endsWith("'s")) return trimmed.slice(0, -2)
  return trimmed
}

export function tokenizeForTagging(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((original, index) => ({
      index,
      original,
      lookup: normalizeLookupWord(original),
    }))
}

export function buildWordCatalogIndex(concepts = [], wordsByConceptId) {
  const conceptById = new Map((concepts ?? []).map((concept) => [concept.id, concept]))
  const byWord = new Map()

  if (!wordsByConceptId) return byWord

  for (const [conceptId, rows] of wordsByConceptId.entries()) {
    const concept = conceptById.get(conceptId)
    for (const row of rows ?? []) {
      const lookup = normalizeLookupWord(row?.word)
      if (!lookup) continue
      let entry = byWord.get(lookup)
      if (!entry) {
        entry = {
          lookup,
          display: row.word,
          wordIds: new Set(),
          concepts: [],
        }
        byWord.set(lookup, entry)
      }
      const wordId = row.wordId || row.id
      if (wordId) entry.wordIds.add(wordId)
      if (conceptId && !entry.concepts.some((item) => item.id === conceptId)) {
        entry.concepts.push({
          id: conceptId,
          name: concept?.concept || 'Unknown concept',
          category: concept?.category || '',
          subcategory: concept?.subcategory || '',
          level: concept?.level || '',
          isNonsense: row.isNonsenseWord === true,
        })
      }
    }
  }

  return byWord
}

export function tagMultiWordText(text, catalogIndex) {
  const tokens = tokenizeForTagging(text)
  const conceptCounts = new Map()
  const uniqueLookups = new Set()
  const uniqueMatched = new Set()
  const uniqueUnmatched = new Set()

  const tagged = tokens.map((token) => {
    if (token.lookup) uniqueLookups.add(token.lookup)
    const hit = token.lookup && catalogIndex ? catalogIndex.get(token.lookup) : null
    if (hit) {
      uniqueMatched.add(token.lookup)
      for (const concept of hit.concepts) {
        const prev = conceptCounts.get(concept.id) ?? {
          id: concept.id,
          name: concept.name,
          category: concept.category,
          subcategory: concept.subcategory,
          level: concept.level,
          count: 0,
          words: [],
        }
        prev.count += 1
        prev.words.push(token.original)
        conceptCounts.set(concept.id, prev)
      }
    } else if (token.lookup) {
      uniqueUnmatched.add(token.lookup)
    }
    return {
      ...token,
      found: Boolean(hit),
      wordIds: hit ? [...hit.wordIds] : [],
      concepts: hit ? hit.concepts : [],
      isNonsense: hit ? hit.concepts.some((concept) => concept.isNonsense) : false,
    }
  })

  const conceptRows = [...conceptCounts.values()]
    .map((row) => ({
      ...row,
      uniqueWords: [...new Set(row.words.map((word) => normalizeLookupWord(word)).filter(Boolean))],
      percentOfTokens: tokens.length ? row.count / tokens.length : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const matchedCount = tagged.filter((token) => token.found).length
  const unmatchedTokens = tagged.filter((token) => !token.found)
  const multiConceptTokens = tagged.filter((token) => token.concepts.length > 1)

  return {
    text: String(text ?? ''),
    tokens: tagged,
    tokenCount: tagged.length,
    uniqueCount: uniqueLookups.size,
    matchedCount,
    unmatchedCount: unmatchedTokens.length,
    unmatchedTokens,
    unmatchedWords: [...uniqueUnmatched],
    uniqueMatchedCount: uniqueMatched.size,
    coverage: tagged.length ? matchedCount / tagged.length : 0,
    conceptRows,
    conceptCount: conceptRows.length,
    topConcept: conceptRows[0] ?? null,
    multiConceptCount: multiConceptTokens.length,
    wordIds: [...new Set(tagged.flatMap((token) => token.wordIds))],
    conceptIds: conceptRows.map((row) => row.id),
  }
}

export function serializeTagResult(result) {
  if (!result) return null
  return {
    tokenCount: result.tokenCount,
    matchedCount: result.matchedCount,
    coverage: result.coverage,
    unmatchedWords: result.unmatchedWords,
    conceptCounts: (result.conceptRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      count: row.count,
      percentOfTokens: row.percentOfTokens,
    })),
    tokens: (result.tokens ?? []).map((token) => ({
      original: token.original,
      lookup: token.lookup,
      found: token.found,
      conceptIds: (token.concepts ?? []).map((concept) => concept.id),
      wordIds: token.wordIds ?? [],
    })),
  }
}
