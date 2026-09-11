/**
 * Structured dictionary entry stored on Word.dictionaryData (AWSJSON).
 */
export type DictionaryData = {
  syllabication: string
  ipa: string
  partOfSpeech: string
  definitions: string[]
  etymology: string
  exampleSentence: string
}

export type TaggedConcept = {
  id?: string
  concept?: string
}

export type GeneratedDictionaryEntry = {
  id: string
  word?: string
  dictionaryData?: DictionaryData | unknown | null
}

export const DICTIONARY_BATCH_LIMIT = 10
/** Max missing-definition words a Content data-ops run will write. */
export const DICTIONARY_WRITE_LIMIT = 250
/** Real catalog words sent to spell check per AppSync mutation. */
export const SPELL_CHECK_BATCH_LIMIT = 100

function parseJsonValue(raw: unknown): unknown {
  let current = raw
  for (let i = 0; i < 3; i += 1) {
    if (current == null) return null
    if (typeof current === 'object') return current
    if (typeof current !== 'string') return null
    const text = current.trim()
    if (!text) return null
    try {
      current = JSON.parse(text)
    } catch {
      return null
    }
  }
  return typeof current === 'object' ? current : null
}

function asDefinitionList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((definition) => String(definition ?? '').trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function normalizeIpa(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed
  return `/${trimmed.replace(/^\[|\]$/g, '')}/`
}

export function parseDictionaryData(raw: unknown): DictionaryData | null {
  const value = parseJsonValue(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const definitions = asDefinitionList(item.definitions)
  const syllabication = String(item.syllabication ?? '').trim()
  const ipa = normalizeIpa(String(item.ipa ?? ''))
  const partOfSpeech = String(item.partOfSpeech ?? '').trim()
  const etymology = String(item.etymology ?? '').trim()
  const exampleSentence = String(item.exampleSentence ?? '').trim()
  if (!syllabication || !ipa || !partOfSpeech || !definitions.length) return null
  return {
    syllabication,
    ipa,
    partOfSpeech,
    definitions,
    etymology,
    exampleSentence,
  }
}

export function hasDictionaryData(raw: unknown) {
  return parseDictionaryData(raw) != null
}

type CatalogWordLike = {
  id?: string
  word?: string
  isNonsenseWord?: boolean
  dictionaryData?: unknown
}

export function wordsMissingDictionaryData(words: CatalogWordLike[] = []) {
  return (words ?? []).filter((word) => {
    if (!word?.id || !String(word.word ?? '').trim()) return false
    if (word.isNonsenseWord) return false
    return !hasDictionaryData(word.dictionaryData)
  })
}

export function dictionaryCoverage(words: CatalogWordLike[] = []) {
  let withDefinitions = 0
  let missingDefinitions = 0
  let invalidWords = 0
  for (const word of words ?? []) {
    if (!word?.id || !String(word.word ?? '').trim()) continue
    if (word.isNonsenseWord) {
      invalidWords += 1
      continue
    }
    if (hasDictionaryData(word.dictionaryData)) withDefinitions += 1
    else missingDefinitions += 1
  }
  return { withDefinitions, missingDefinitions, invalidWords }
}

export function realCatalogWordIds(words: CatalogWordLike[] = []) {
  return (words ?? [])
    .filter((word) => word?.id && String(word.word ?? '').trim() && !word.isNonsenseWord)
    .map((word) => String(word.id))
}

export function pickWordOfTheDay(words: CatalogWordLike[] = [], now = new Date()) {
  const eligible = (words ?? []).filter((word) => {
    if (!word?.id || !String(word.word ?? '').trim() || word.isNonsenseWord) return false
    return hasDictionaryData(word.dictionaryData)
  })
  if (!eligible.length) return null
  const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const picked = eligible[Math.abs(hash) % eligible.length]
  return {
    ...picked,
    word: String(picked.word ?? '').trim(),
    dictionaryData: parseDictionaryData(picked.dictionaryData),
  }
}
