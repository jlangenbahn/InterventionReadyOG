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
