/**
 * DataGrid selection helpers for picking practice words (include/exclude + random).
 */
export const FOCUS_WORD_COUNT = 10

export function emptyWordSelection() {
  return { type: 'include', ids: new Set() }
}

export function wordRowId(row) {
  return row?.conceptWordId || row?.id
}

export function includeWordSelection(ids) {
  return {
    type: 'include',
    ids: new Set((ids ?? []).filter(Boolean)),
  }
}

export function randomWordSelection(words, count = FOCUS_WORD_COUNT) {
  const ids = (words ?? []).map(wordRowId).filter(Boolean)
  const pool = [...ids]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return includeWordSelection(pool.slice(0, Math.min(count, pool.length)))
}
