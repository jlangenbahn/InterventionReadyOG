/**
 * Shared Content catalog chip filters (definitions, tags, and word text).
 */
import { catalogWordCoverageKind } from './dictionaryData'
import { catalogWordTagKind, TAG_FILTER } from './wordConcepts'

export const TEXT_FILTER = {
  CONTAINS_SPACE: 'containsSpace',
}

export function wordContainsSpace(word) {
  return /\s/.test(String(word?.word ?? ''))
}

export function wordsContainingSpace(words = []) {
  return (words ?? []).filter(
    (word) => word?.id && String(word.word ?? '').trim() && wordContainsSpace(word),
  )
}

export function isTagFilter(filter) {
  return (
    filter === TAG_FILTER.UNTAGGED ||
    filter === TAG_FILTER.ONE_TAG ||
    filter === TAG_FILTER.TWO_TAGS
  )
}

export function matchesCatalogFilter(word, filter, tagCount = 0) {
  if (!filter) return true
  if (filter === TEXT_FILTER.CONTAINS_SPACE) return wordContainsSpace(word)
  if (isTagFilter(filter)) return catalogWordTagKind(tagCount) === filter
  return catalogWordCoverageKind(word) === filter
}
