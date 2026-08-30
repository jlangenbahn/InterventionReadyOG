/**
 * Per-student concept inventory ("Scope and Sequence").
 * Stored as AWSJSON on Student.scopeAndSequence — send as a JSON string to AppSync.
 */
import { parseScopeAndSequence } from './fetchStudentLessonPlan'

export { parseScopeAndSequence }

export const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']

export function nextMasteryStatus(current) {
  const index = MASTERY_STATUSES.indexOf(current)
  const from = index < 0 ? 0 : index
  return MASTERY_STATUSES[(from + 1) % MASTERY_STATUSES.length]
}

export function normalizeSequence(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(999, Math.floor(Math.abs(n)))
}

export function normalizeScopeEntry(entry) {
  const mastery = MASTERY_STATUSES.includes(entry?.masteryStatus)
    ? entry.masteryStatus
    : 'unknown'
  return {
    conceptId: entry.conceptId,
    inScope: entry?.inScope === true,
    masteryStatus: mastery,
    sequence: normalizeSequence(entry?.sequence),
  }
}

/** Ensure every catalog concept exists on the student's inventory. */
export function buildScopeAndSequence(concepts, existing) {
  const byId = new Map()
  const raw = Array.isArray(existing) ? existing : []
  for (const entry of raw) {
    if (entry?.conceptId) byId.set(entry.conceptId, normalizeScopeEntry(entry))
  }
  return concepts.map((concept) => {
    const prior = byId.get(concept.id)
    return (
      prior ?? {
        conceptId: concept.id,
        inScope: false,
        masteryStatus: 'unknown',
        sequence: null,
      }
    )
  })
}

export function serializeScopeAndSequence(inventory) {
  return JSON.stringify(inventory)
}

/** New + review in-scope concepts, ordered like a typical lesson (1 new, then reviews). */
export function lessonConceptsFromScope(concepts, inventory) {
  const byId = new Map((inventory ?? []).map((entry) => [entry?.conceptId, entry]))
  const rows = []
  for (const concept of concepts ?? []) {
    if (!concept?.id) continue
    const entry = byId.get(concept.id)
    if (!entry?.inScope) continue
    if (entry.masteryStatus !== 'new' && entry.masteryStatus !== 'review') continue
    rows.push({
      ...concept,
      role: entry.masteryStatus,
      sequence: Number.isFinite(Number(entry.sequence)) ? Number(entry.sequence) : null,
    })
  }
  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'new' ? -1 : 1
    const seqA = a.sequence ?? Number.POSITIVE_INFINITY
    const seqB = b.sequence ?? Number.POSITIVE_INFINITY
    if (seqA !== seqB) return seqA - seqB
    return String(a.concept ?? '').localeCompare(String(b.concept ?? ''))
  })
  return rows
}

export function inventoryToRows(concepts, inventory) {
  const byConceptId = new Map(inventory.map((entry) => [entry.conceptId, entry]))
  return concepts.map((concept) => {
    const entry = byConceptId.get(concept.id)
    return {
      id: concept.id,
      conceptId: concept.id,
      concept: concept.concept ?? '',
      level: concept.level ?? '',
      category: concept.category ?? '',
      subcategory: concept.subcategory ?? '',
      inScope: entry?.inScope === true,
      masteryStatus: entry?.masteryStatus ?? 'unknown',
      sequence: entry?.sequence ?? null,
    }
  })
}

function formatScopeExportValue(field, value) {
  if (field === 'inScope') return value === true ? 'Yes' : 'No'
  if (field === 'sequence' || field === 'level') {
    if (value === '' || value == null) return ''
    const n = Number(value)
    return Number.isFinite(n) ? n : String(value)
  }
  if (value == null) return ''
  return String(value)
}

export function buildScopeExportTable(rowModels, columns) {
  return {
    headers: columns.map((col) => col.headerName),
    rows: rowModels.map((row) => columns.map((col) => formatScopeExportValue(col.field, row[col.field]))),
  }
}
