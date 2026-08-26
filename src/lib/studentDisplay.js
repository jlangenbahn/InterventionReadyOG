/**
 * Student name helpers. Last names are stored as a single initial.
 */

export function studentDisplayName(student) {
  return (
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unnamed student'
  )
}

/** Last-name-first label for the left nav: "L, First". */
export function studentNavDisplayName(student) {
  const first = String(student?.firstName ?? '').trim()
  const last = String(student?.lastName ?? '').trim()
  if (last && first) return `${last}, ${first}`
  return first || last || 'Unnamed student'
}

export function normalizeLastInitial(value) {
  const raw = String(value ?? '')
  const letter = raw.match(/[\p{L}]/u)?.[0] ?? raw.trim().slice(0, 1)
  return letter ? letter.toUpperCase() : ''
}
