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

export const DICTIONARY_BATCH_LIMIT = 10

function parseJsonValue(raw: unknown): unknown {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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
  const definitions = (Array.isArray(item.definitions) ? item.definitions : [])
    .map((definition) => String(definition ?? '').trim())
    .filter(Boolean)
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

export function wordsMissingDictionaryData(words: Array<{
  id?: string
  word?: string
  isNonsenseWord?: boolean
  dictionaryData?: unknown
}> = []) {
  return (words ?? []).filter((word) => {
    if (!word?.id || !String(word.word ?? '').trim()) return false
    if (word.isNonsenseWord) return false
    return !hasDictionaryData(word.dictionaryData)
  })
}
