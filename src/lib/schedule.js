import { client } from './amplifyClient'
import { BRAND } from '../theme'

const SELECTION = ['id', 'title', 'startAt', 'endAt', 'notes', 'studentID', 'lessonID', 'createdAt', 'updatedAt']

const STUDENT_COLORS = [
  { bg: BRAND.navy, fg: '#ffffff', accent: BRAND.gold, hover: BRAND.navyDark },
  { bg: BRAND.sky, fg: BRAND.navyDark, accent: BRAND.navy, hover: '#6a94d4' },
  { bg: BRAND.navyMid, fg: '#ffffff', accent: BRAND.glow, hover: '#2f4a86' },
  { bg: '#d6e4fa', fg: BRAND.navy, accent: BRAND.skyDark, hover: '#c4d7f5' },
  { bg: BRAND.goldBg, fg: BRAND.navyDark, accent: BRAND.goldDark, hover: BRAND.goldHover },
  { bg: '#5c6370', fg: '#ffffff', accent: BRAND.gray, hover: '#4a505b' },
]

async function listAll(model, options = {}) {
  if (!model?.list) return []
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await model.list({
      limit: 1000,
      nextToken,
      ...options,
    })
    items.push(...(data ?? []))
    if (errors?.length && !data?.length) {
      throw new Error(errors.map((item) => item.message).join(', '))
    }
    nextToken = token
  } while (nextToken)
  return items
}

function throwIfErrors(result) {
  const errors = result?.errors ?? []
  if (errors.length) throw new Error(errors.map((item) => item.message).join(', '))
}

export function parseScheduleDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function startOfDay(value) {
  const date = parseScheduleDate(value) ?? new Date()
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(value, amount) {
  const date = parseScheduleDate(value) ?? new Date()
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function addMinutes(value, amount) {
  const date = parseScheduleDate(value) ?? new Date()
  return new Date(date.getTime() + amount * 60_000)
}

/** Monday of the week containing `value`. */
export function startOfWorkWeek(value) {
  const date = startOfDay(value)
  const weekday = date.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  return addDays(date, offset)
}

export function startOfMonth(value) {
  const date = parseScheduleDate(value) ?? new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** Sunday that begins the month grid containing `value`. */
export function startOfMonthGrid(value) {
  const first = startOfMonth(value)
  return addDays(first, -first.getDay())
}

export function isSameDay(left, right) {
  const a = parseScheduleDate(left)
  const b = parseScheduleDate(right)
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function minutesSinceMidnight(value) {
  const date = parseScheduleDate(value)
  if (!date) return 0
  return date.getHours() * 60 + date.getMinutes()
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function toDateTimeLocal(value) {
  const date = parseScheduleDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeLocal(value) {
  const date = parseScheduleDate(value)
  if (!date) return null
  return date.toISOString()
}

export function formatClock(value) {
  const date = parseScheduleDate(value)
  if (!date) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatTimeRange(start, end) {
  const from = formatClock(start)
  const to = formatClock(end)
  if (from && to) return `${from} – ${to}`
  return from || to
}

export function formatDayName(value, style = 'short') {
  const date = parseScheduleDate(value)
  if (!date) return ''
  return date.toLocaleDateString(undefined, { weekday: style })
}

export function formatWeekRange(start) {
  const monday = startOfWorkWeek(start)
  const friday = addDays(monday, 4)
  const sameMonth = monday.getMonth() === friday.getMonth()
  const sameYear = monday.getFullYear() === friday.getFullYear()
  const startLabel = monday.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
  const endLabel = friday.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startLabel} – ${endLabel}`
}

export function formatMonthLabel(value) {
  const date = parseScheduleDate(value) ?? new Date()
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function studentScheduleColor(studentId) {
  const raw = String(studentId ?? '')
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  }
  return STUDENT_COLORS[hash % STUDENT_COLORS.length]
}

export function defaultLessonTimes(slotStart) {
  const start = parseScheduleDate(slotStart) ?? new Date()
  const snapped = new Date(start)
  snapped.setSeconds(0, 0)
  const minutes = snapped.getMinutes()
  snapped.setMinutes(minutes < 30 ? 0 : 30)
  return { startAt: snapped, endAt: addMinutes(snapped, 30) }
}

export function eventsForDay(items, day) {
  const start = startOfDay(day)
  const end = addDays(start, 1)
  return (items ?? []).filter((item) => {
    const at = parseScheduleDate(item?.startAt)
    return at && at >= start && at < end
  })
}

/**
 * Pack overlapping timed events into columns, Outlook-style.
 * Returns { col, colCount } per event id.
 */
export function layoutDayEvents(items) {
  const events = (items ?? [])
    .map((item) => {
      const start = parseScheduleDate(item?.startAt)
      const end = parseScheduleDate(item?.endAt)
      if (!start || !end || end <= start) return null
      return { item, start: start.getTime(), end: end.getTime() }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const layout = new Map()
  let cluster = []
  let clusterEnd = 0

  function flushCluster() {
    if (!cluster.length) return
    const columns = []
    for (const entry of cluster) {
      let col = 0
      while (columns[col] && columns[col] > entry.start) col += 1
      columns[col] = entry.end
      entry.col = col
    }
    const colCount = columns.length
    for (const entry of cluster) {
      layout.set(entry.item.id, { col: entry.col, colCount })
    }
    cluster = []
    clusterEnd = 0
  }

  for (const entry of events) {
    if (cluster.length && entry.start >= clusterEnd) flushCluster()
    cluster.push(entry)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  flushCluster()
  return layout
}

export async function fetchScheduledLessons() {
  if (!client.models.ScheduledLesson) return []
  const items = await listAll(client.models.ScheduledLesson, { selectionSet: SELECTION })
  return (items ?? [])
    .filter((item) => item?.id)
    .sort((a, b) => String(a.startAt ?? '').localeCompare(String(b.startAt ?? '')))
}

export async function saveScheduledLesson({
  id,
  title,
  startAt,
  endAt,
  notes,
  studentID,
  lessonID,
}) {
  if (!client.models.ScheduledLesson) {
    throw new Error('Schedule is still deploying. Wait for Amplify to finish, then try again.')
  }
  if (!studentID) throw new Error('Choose a student for this lesson.')
  const startIso = typeof startAt === 'string' ? startAt : fromDateTimeLocal(startAt)
  const endIso = typeof endAt === 'string' ? endAt : fromDateTimeLocal(endAt)
  const start = parseScheduleDate(startIso)
  const end = parseScheduleDate(endIso)
  if (!start || !end) throw new Error('Start and end times are required.')
  if (end <= start) throw new Error('End time must be after the start time.')

  const payload = {
    title: String(title ?? '').trim() || null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    notes: String(notes ?? '').trim() || null,
    studentID,
  }
  if (id) payload.lessonID = lessonID || null
  else if (lessonID) payload.lessonID = lessonID

  const result = id
    ? await client.models.ScheduledLesson.update({ id, ...payload }, { selectionSet: SELECTION })
    : await client.models.ScheduledLesson.create(payload, { selectionSet: SELECTION })
  throwIfErrors(result)
  if (!result?.data?.id) throw new Error('Failed to save calendar item')
  return result.data
}

export async function deleteScheduledLesson(id) {
  if (!id || !client.models.ScheduledLesson) return
  const result = await client.models.ScheduledLesson.delete({ id })
  throwIfErrors(result)
}

export function scheduleModelReady() {
  return Boolean(client.models.ScheduledLesson)
}
