import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import GroupsIcon from '@mui/icons-material/Groups'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import PersonIcon from '@mui/icons-material/Person'
import SaveIcon from '@mui/icons-material/Save'
import TodayIcon from '@mui/icons-material/Today'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import {
  fetchLessonsForStudents,
  fetchStudentLessons,
  formatLessonDisplayName,
  studentDisplayName,
} from '../lib/fetchStudentLessonPlan'
import {
  addDays,
  addMinutes,
  defaultLessonTimes,
  deleteScheduledLesson,
  ensureGroupLessonAttendees,
  eventScheduleColor,
  eventsForDay,
  fetchScheduledLessons,
  formatClock,
  formatDayName,
  formatMonthLabel,
  formatTimeRange,
  formatWeekRange,
  fromDateTimeLocal,
  isGroupEvent,
  isSameDay,
  layoutDayEvents,
  minutesSinceMidnight,
  parseScheduleDate,
  saveScheduledLesson,
  scheduleModelReady,
  startOfDay,
  startOfMonth,
  startOfMonthGrid,
  startOfWorkWeek,
  toDateTimeLocal,
} from '../lib/schedule'
import { BRAND } from '../theme'

const DETAIL_WIDTH = 400
const SLOT_MINUTES = 30
const SLOT_PX = 44
const GUTTER_PX = 64
const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 18
const WORK_DAYS = 5
const MONTH_MORE_LIMIT = 3

function emptyDraft(students, groups, slotStart) {
  const { startAt, endAt } = defaultLessonTimes(slotStart ?? new Date())
  if (!slotStart) {
    startAt.setHours(9, 0, 0, 0)
    endAt.setTime(startAt.getTime() + 30 * 60_000)
  }
  return {
    id: null,
    audience: 'student',
    studentID: students[0]?.id ?? '',
    groupID: groups[0]?.id ?? '',
    title: '',
    startLocal: toDateTimeLocal(startAt),
    endLocal: toDateTimeLocal(endAt),
    notes: '',
    lessonID: '',
  }
}

function itemToDraft(item) {
  const attendees = item?.attendees ?? []
  return {
    id: item.id,
    audience: item.groupID ? 'group' : 'student',
    studentID: item.studentID || attendees[0]?.studentId || '',
    groupID: item.groupID ?? '',
    title: item.title ?? '',
    startLocal: toDateTimeLocal(item.startAt),
    endLocal: toDateTimeLocal(item.endAt),
    notes: item.notes ?? '',
    lessonID: item.lessonID || attendees.find((entry) => entry.lessonId)?.lessonId || '',
  }
}

function lessonLabel(lesson) {
  if (!lesson) return ''
  return (
    formatLessonDisplayName(lesson.name, '', lesson.lessonNumber)
    || (lesson.lessonNumber != null ? `Lesson ${lesson.lessonNumber}` : 'Lesson plan')
  )
}

function formatWhen(start, end) {
  const from = parseScheduleDate(start)
  if (!from) return ''
  const day = from.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  return `${day} · ${formatTimeRange(start, end)}`
}

function eventPrimaryName(item, studentsById, groupsById) {
  if (item?.groupID) return groupsById.get(item.groupID)?.name || 'Group lesson'
  return studentDisplayName(studentsById.get(item?.studentID || item?.attendees?.[0]?.studentId))
}

function eventSecondaryName(item, studentsById) {
  if (item?.groupID) {
    const names = (item.attendees ?? [])
      .map((entry) => studentDisplayName(studentsById.get(entry.studentId)))
      .filter((name) => name && name !== 'Unnamed student')
    if (names.length) return names.join(', ')
    return `${(item.attendees ?? []).length} students`
  }
  return item?.title || ''
}

function visibleHourRange(items) {
  let start = DEFAULT_START_HOUR * 60
  let end = DEFAULT_END_HOUR * 60
  for (const item of items ?? []) {
    const from = parseScheduleDate(item.startAt)
    const to = parseScheduleDate(item.endAt)
    if (!from || !to) continue
    start = Math.min(start, Math.floor(minutesSinceMidnight(from) / 60) * 60)
    end = Math.max(end, Math.ceil(minutesSinceMidnight(to) / 60) * 60)
  }
  start = Math.max(0, start)
  end = Math.min(24 * 60, Math.max(start + 60, end))
  return { startMinutes: start, endMinutes: end }
}

function hourLabels(startMinutes, endMinutes) {
  const labels = []
  for (let minute = startMinutes; minute < endMinutes; minute += 60) {
    const date = new Date()
    date.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
    labels.push({ minute, label: formatClock(date) })
  }
  return labels
}

export default function SchedulePanel({
  students = [],
  groups = [],
  setError,
  onOpenStudent,
  createNonce = 0,
}) {
  const [view, setView] = useState('workWeek')
  const [anchor, setAnchor] = useState(() => new Date())
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(false)
  const [lessonOptions, setLessonOptions] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  const weekStart = useMemo(() => startOfWorkWeek(anchor), [anchor])
  const weekDays = useMemo(
    () => Array.from({ length: WORK_DAYS }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )
  const monthGridStart = useMemo(() => startOfMonthGrid(anchor), [anchor])
  const monthCells = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)),
    [monthGridStart],
  )

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const records = await fetchScheduledLessons()
      setItems(records)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const beginCreate = useCallback(
    (slotStart) => {
      setSelectedId(null)
      setEditing(true)
      setDraft(emptyDraft(students, groups, slotStart))
    },
    [students, groups],
  )

  useEffect(() => {
    if (!createNonce) return
    setSelectedId(null)
    setEditing(true)
    setDraft(emptyDraft(students, groups))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createNonce])

  const selectItem = useCallback((item) => {
    if (!item?.id) return
    setSelectedId(item.id)
    setEditing(false)
    setDraft(itemToDraft(item))
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDraft(null)
    setEditing(false)
  }, [])

  const studentsById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )
  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  )

  const selectedGroup = groupsById.get(draft?.groupID) ?? null
  const lessonStudentIds = useMemo(() => {
    if (editing) {
      if (draft?.audience === 'group') return selectedGroup?.studentIds ?? []
      return draft?.studentID ? [draft.studentID] : []
    }
    const item = items.find((entry) => entry.id === selectedId)
    if (item?.attendees?.length) return item.attendees.map((entry) => entry.studentId)
    if (item?.studentID) return [item.studentID]
    return []
  }, [editing, draft?.audience, draft?.studentID, selectedGroup, items, selectedId])

  useEffect(() => {
    if (!lessonStudentIds.length) {
      setLessonOptions([])
      return undefined
    }
    let cancelled = false
    setLoadingLessons(true)
    const request =
      lessonStudentIds.length === 1
        ? fetchStudentLessons(lessonStudentIds[0])
        : fetchLessonsForStudents(lessonStudentIds)
    request
      .then((lessons) => {
        if (!cancelled) setLessonOptions(lessons ?? [])
      })
      .catch(() => {
        if (!cancelled) setLessonOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingLessons(false)
      })
    return () => {
      cancelled = true
    }
  }, [lessonStudentIds])

  const rangeItems = useMemo(() => {
    if (view === 'month') {
      const start = monthGridStart
      const end = addDays(start, 42)
      return items.filter((item) => {
        const at = parseScheduleDate(item.startAt)
        return at && at >= start && at < end
      })
    }
    const end = addDays(weekStart, WORK_DAYS)
    return items.filter((item) => {
      const at = parseScheduleDate(item.startAt)
      return at && at >= weekStart && at < end
    })
  }, [items, view, weekStart, monthGridStart])

  const { startMinutes, endMinutes } = useMemo(
    () => visibleHourRange(view === 'workWeek' ? rangeItems : []),
    [view, rangeItems],
  )
  const slotCount = Math.max(1, (endMinutes - startMinutes) / SLOT_MINUTES)
  const hours = useMemo(() => hourLabels(startMinutes, endMinutes), [startMinutes, endMinutes])

  function shiftAnchor(direction) {
    setAnchor((current) =>
      view === 'month' ? startOfMonth(addDays(startOfMonth(current), direction * 32)) : addDays(current, direction * 7),
    )
  }

  function handleDaySlotClick(event, day) {
    const column = event.currentTarget
    if (event.target !== column && !event.target.dataset?.slot) return
    const rect = column.getBoundingClientRect()
    const y = event.clientY - rect.top
    const snappedSlots = Math.max(0, Math.min(slotCount - 1, Math.floor(y / SLOT_PX)))
    const start = startOfDay(day)
    start.setMinutes(startMinutes + snappedSlots * SLOT_MINUTES)
    beginCreate(start)
  }

  function handleMonthDayClick(day) {
    const start = startOfDay(day)
    start.setHours(9, 0, 0, 0)
    beginCreate(start)
  }

  async function handleSave(event) {
    event?.preventDefault()
    const isGroup = draft?.audience === 'group'
    if (!isGroup && !draft?.studentID) return
    if (isGroup && !draft?.groupID) return
    const memberIds = isGroup ? selectedGroup?.studentIds ?? [] : [draft.studentID]
    if (isGroup && !memberIds.length) {
      setError('This group has no students. Add students to the group, then schedule it.')
      return
    }
    setSaving(true)
    try {
      const sourceLesson = draft.lessonID
        ? lessonOptions.find((lesson) => lesson.id === draft.lessonID) ?? { id: draft.lessonID, studentID: draft.studentID }
        : null
      const attendees = isGroup
        ? await ensureGroupLessonAttendees(sourceLesson, memberIds)
        : [{ studentId: draft.studentID, lessonId: draft.lessonID || null }]
      const saved = await saveScheduledLesson({
        id: draft.id,
        title: draft.title,
        startAt: fromDateTimeLocal(draft.startLocal),
        endAt: fromDateTimeLocal(draft.endLocal),
        notes: draft.notes,
        studentID: isGroup ? null : draft.studentID,
        groupID: isGroup ? draft.groupID : null,
        lessonID: draft.lessonID || null,
        attendees,
      })
      const records = await fetchScheduledLessons()
      setItems(records)
      setSelectedId(saved.id)
      setDraft(itemToDraft(saved))
      setEditing(false)
      const savedStart = parseScheduleDate(saved.startAt)
      if (savedStart) setAnchor(savedStart)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save calendar item')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    const target = itemToDelete
    if (!target?.id) return
    setDeleting(true)
    try {
      await deleteScheduledLesson(target.id)
      setItems((prev) => prev.filter((item) => item.id !== target.id))
      if (selectedId === target.id) {
        setSelectedId(null)
        setDraft(null)
        setEditing(false)
      }
      setItemToDelete(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete calendar item')
    } finally {
      setDeleting(false)
    }
  }

  const now = new Date()
  const showNowLine = view === 'workWeek' && weekDays.some((day) => isSameDay(day, now))
  const nowTop =
    ((minutesSinceMidnight(now) - startMinutes) / SLOT_MINUTES) * SLOT_PX
  const showNow = showNowLine && nowTop >= 0 && nowTop <= slotCount * SLOT_PX

  function renderEventBlock(item, layout) {
    const start = parseScheduleDate(item.startAt)
    const end = parseScheduleDate(item.endAt)
    if (!start || !end) return null
    const top = ((minutesSinceMidnight(start) - startMinutes) / SLOT_MINUTES) * SLOT_PX
    const height = Math.max(SLOT_PX * 0.8, ((end.getTime() - start.getTime()) / 60_000 / SLOT_MINUTES) * SLOT_PX)
    const pack = layout.get(item.id) ?? { col: 0, colCount: 1 }
    const widthPct = 100 / pack.colCount
    const name = eventPrimaryName(item, studentsById, groupsById)
    const secondary = eventSecondaryName(item, studentsById)
    const color = eventScheduleColor(item)
    const selected = item.id === selectedId || (!selectedId && draft?.id === item.id)
    const grouped = isGroupEvent(item)
    return (
      <Box
        key={item.id}
        role="button"
        tabIndex={0}
        aria-label={`${name}, ${formatTimeRange(start, end)}`}
        onClick={(event) => {
          event.stopPropagation()
          selectItem(item)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectItem(item)
          }
        }}
        sx={{
          position: 'absolute',
          top,
          height,
          left: `calc(${pack.col * widthPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
          bgcolor: color.bg,
          color: color.fg,
          borderLeft: `3px solid ${color.accent}`,
          borderRadius: 1,
          px: 0.75,
          py: 0.25,
          overflow: 'hidden',
          cursor: 'pointer',
          boxShadow: selected ? `0 0 0 2px ${BRAND.gold}` : 'none',
          zIndex: selected ? 3 : 1,
          '&:hover': { bgcolor: color.hover },
        }}
      >
        <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2, opacity: 0.9 }}>
          {formatTimeRange(start, end)}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          {grouped ? <GroupsIcon sx={{ fontSize: 14, flexShrink: 0 }} /> : null}
          <Box
            component="button"
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              selectItem(item)
            }}
            style={{
              all: 'unset',
              display: 'block',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.75rem',
              lineHeight: 1.25,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </Box>
        </Stack>
        {secondary ? (
          <Typography variant="caption" noWrap sx={{ display: 'block', opacity: 0.95 }}>
            {secondary}
          </Typography>
        ) : null}
      </Box>
    )
  }

  function renderAttendeeLinks(item) {
    const attendees = item?.attendees?.length
      ? item.attendees
      : item?.studentID
        ? [{ studentId: item.studentID, lessonId: item.lessonID }]
        : []
    if (!attendees.length) {
      return (
        <Typography variant="body2" color="text.secondary">
          No students are linked to this calendar item.
        </Typography>
      )
    }
    return (
      <Stack spacing={1.25}>
        {attendees.map((entry) => {
          const student = studentsById.get(entry.studentId)
          const lesson = lessonOptions.find((option) => option.id === entry.lessonId)
          const name = studentDisplayName(student)
          return (
            <Paper key={entry.studentId} variant="outlined" sx={{ p: 1.25 }}>
              <Stack spacing={0.5}>
                <Button
                  size="small"
                  startIcon={<PersonIcon />}
                  onClick={() => onOpenStudent?.(entry.studentId)}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  {name}
                </Button>
                {entry.lessonId ? (
                  <Button
                    size="small"
                    startIcon={<MenuBookIcon />}
                    onClick={() => onOpenStudent?.(entry.studentId, entry.lessonId)}
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                  >
                    {lessonLabel(lesson) || 'Open lesson plan'}
                  </Button>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                    No lesson plan linked
                  </Typography>
                )}
              </Stack>
            </Paper>
          )
        })}
      </Stack>
    )
  }

  function renderReadOnlyDetail(item) {
    const grouped = isGroupEvent(item)
    const group = groupsById.get(item.groupID)
    const student = studentsById.get(item.studentID || item.attendees?.[0]?.studentId)
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack spacing={1.5} sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6">
                {item.title || eventPrimaryName(item, studentsById, groupsById)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatWhen(item.startAt, item.endAt)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Tooltip title="Hide details">
                <IconButton size="small" aria-label="Hide lesson details" onClick={closeDetail}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <Chip
            size="small"
            icon={grouped ? <GroupsIcon /> : <PersonIcon />}
            label={grouped ? `Group · ${group?.name || 'Untitled group'}` : studentDisplayName(student)}
            sx={{ alignSelf: 'flex-start' }}
          />
          {item.title && grouped ? (
            <Typography variant="body2">{item.title}</Typography>
          ) : null}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {grouped ? 'Students and lessons' : 'Student and lesson'}
            </Typography>
            <Box sx={{ mt: 1 }}>{renderAttendeeLinks(item)}</Box>
          </Box>
          {item.notes ? (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Notes
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {item.notes}
              </Typography>
            </Box>
          ) : null}
        </Stack>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 1.5 }} justifyContent="flex-start">
          <Button
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setItemToDelete(item)}
          >
            Delete
          </Button>
        </Stack>
      </Box>
    )
  }

  function renderEditor() {
    const isNew = !draft.id
    const isGroup = draft.audience === 'group'
    const canSave = isGroup ? Boolean(draft.groupID) : Boolean(draft.studentID)
    return (
      <Box component="form" onSubmit={(event) => void handleSave(event)} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack spacing={1.5} sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">{isNew ? 'New lesson' : 'Edit lesson'}</Typography>
            {!isNew ? (
              <IconButton
                size="small"
                aria-label="Cancel editing"
                onClick={() => {
                  const current = items.find((item) => item.id === draft.id)
                  if (current) setDraft(itemToDraft(current))
                  setEditing(false)
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            ) : (
              <Tooltip title="Hide details">
                <IconButton size="small" aria-label="Hide lesson details" onClick={closeDetail}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={draft.audience}
            onChange={(_event, value) => {
              if (!value) return
              setDraft((prev) => ({ ...prev, audience: value, lessonID: '' }))
            }}
          >
            <ToggleButton value="student">Student</ToggleButton>
            <ToggleButton value="group">Group</ToggleButton>
          </ToggleButtonGroup>

          {isGroup && groups.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Create a group in the left nav before scheduling a group lesson.
            </Typography>
          ) : null}

          {isGroup ? (
            <FormControl fullWidth size="small" required>
              <InputLabel id="schedule-group">Group</InputLabel>
              <Select
                labelId="schedule-group"
                label="Group"
                value={draft.groupID}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, groupID: event.target.value, lessonID: '' }))
                }
              >
                {groups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    {group.name || 'Untitled group'} ({(group.studentIds ?? []).length})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth size="small" required>
              <InputLabel id="schedule-student">Student</InputLabel>
              <Select
                labelId="schedule-student"
                label="Student"
                value={draft.studentID}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, studentID: event.target.value, lessonID: '' }))
                }
              >
                {students.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {studentDisplayName(item)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {isGroup && selectedGroup ? (
            <Typography variant="caption" color="text.secondary">
              {(selectedGroup.studentIds ?? []).map((id) => studentDisplayName(studentsById.get(id))).join(', ')
                || 'This group has no students.'}
            </Typography>
          ) : null}

          <TextField
            label="Title"
            size="small"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder={isGroup ? 'Optional — the group name is shown on the calendar' : 'Optional — student name is shown on the calendar'}
          />
          <TextField
            label="Start"
            type="datetime-local"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={draft.startLocal}
            onChange={(event) => {
              const startLocal = event.target.value
              const start = parseScheduleDate(startLocal)
              const end = parseScheduleDate(draft.endLocal)
              const next = { ...draft, startLocal }
              if (start && (!end || end <= start)) {
                next.endLocal = toDateTimeLocal(addMinutes(start, 30))
              }
              setDraft(next)
            }}
          />
          <TextField
            label="End"
            type="datetime-local"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={draft.endLocal}
            onChange={(event) => setDraft((prev) => ({ ...prev, endLocal: event.target.value }))}
          />
          <FormControl fullWidth size="small">
            <InputLabel id="schedule-lesson-plan">Lesson plan</InputLabel>
            <Select
              labelId="schedule-lesson-plan"
              label="Lesson plan"
              value={draft.lessonID}
              onChange={(event) => setDraft((prev) => ({ ...prev, lessonID: event.target.value }))}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {lessonOptions.map((lesson) => (
                <MenuItem key={lesson.id} value={lesson.id}>
                  {isGroup
                    ? `${studentDisplayName(studentsById.get(lesson.studentID))} · ${lessonLabel(lesson)}`
                    : lessonLabel(lesson)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {isGroup ? (
            <Typography variant="caption" color="text.secondary">
              One calendar item is created for the group. Each student is linked to their own copy of
              this lesson. Missing copies are created automatically.
            </Typography>
          ) : null}
          {loadingLessons ? (
            <Typography variant="caption" color="text.secondary">
              Loading lesson plans…
            </Typography>
          ) : null}
          <TextField
            label="Notes"
            size="small"
            value={draft.notes}
            onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
            multiline
            minRows={3}
          />
        </Stack>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 1.5 }} justifyContent="space-between">
          {draft.id ? (
            <Button
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => setItemToDelete(selectedItem ?? { id: draft.id, title: draft.title })}
            >
              Delete
            </Button>
          ) : (
            <Button onClick={closeDetail}>Cancel</Button>
          )}
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={saving || !canSave}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </Button>
        </Stack>
      </Box>
    )
  }

  function renderDetail() {
    if (!draft) {
      return (
        <Stack spacing={2} sx={{ p: 2 }}>
          <Typography variant="h6">Lesson details</Typography>
          <Typography variant="body2" color="text.secondary">
            Select a lesson on the calendar to view it, or create a new one. Use Edit to change an
            existing item.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => beginCreate()}>
            New lesson
          </Button>
        </Stack>
      )
    }

    if (!editing && draft.id && selectedItem) {
      return renderReadOnlyDetail(selectedItem)
    }

    return renderEditor()
  }

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        flex: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Typography variant="h6" sx={{ mr: 1 }}>
            Schedule
          </Typography>
          <IconButton size="small" aria-label="Previous" onClick={() => shiftAnchor(-1)}>
            <ChevronLeftIcon />
          </IconButton>
          <Button size="small" startIcon={<TodayIcon />} onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <IconButton size="small" aria-label="Next" onClick={() => shiftAnchor(1)}>
            <ChevronRightIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ minWidth: 180 }}>
            {view === 'month' ? formatMonthLabel(anchor) : formatWeekRange(weekStart)}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_event, value) => {
              if (value) setView(value)
            }}
          >
            <ToggleButton value="workWeek" aria-label="Work week">
              <CalendarViewWeekIcon fontSize="small" sx={{ mr: 0.75 }} />
              Work week
            </ToggleButton>
            <ToggleButton value="month" aria-label="Month">
              <CalendarMonthIcon fontSize="small" sx={{ mr: 0.75 }} />
              Month
            </ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => beginCreate()}>
            New lesson
          </Button>
        </Stack>

        {!scheduleModelReady() ? (
          <AlertLike>
            The schedule backend is still deploying. You can explore the calendar now; creating
            items will work once Amplify finishes updating DynamoDB.
          </AlertLike>
        ) : null}

        {loading ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : view === 'workWeek' ? (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `${GUTTER_PX}px repeat(${WORK_DAYS}, 1fr)`,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
              }}
            >
              <Box />
              {weekDays.map((day) => {
                const today = isSameDay(day, now)
                return (
                  <Box
                    key={day.toISOString()}
                    sx={{
                      py: 1,
                      textAlign: 'center',
                      bgcolor: today ? 'secondary.light' : 'transparent',
                      borderLeft: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
                      {formatDayName(day, 'short').toUpperCase()}
                    </Typography>
                    <Typography variant={today ? 'h6' : 'subtitle1'} sx={{ color: today ? 'primary.main' : 'text.primary' }}>
                      {day.getDate()}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `${GUTTER_PX}px repeat(${WORK_DAYS}, 1fr)`,
                  minHeight: slotCount * SLOT_PX,
                }}
              >
                <Box sx={{ position: 'relative', height: slotCount * SLOT_PX }}>
                  {hours.map((hour) => (
                    <Typography
                      key={hour.minute}
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        position: 'absolute',
                        top: ((hour.minute - startMinutes) / SLOT_MINUTES) * SLOT_PX - 8,
                        right: 8,
                      }}
                    >
                      {hour.label}
                    </Typography>
                  ))}
                </Box>
                {weekDays.map((day) => {
                  const dayItems = eventsForDay(items, day)
                  const layout = layoutDayEvents(dayItems)
                  return (
                    <Box
                      key={day.toISOString()}
                      onClick={(event) => handleDaySlotClick(event, day)}
                      sx={{
                        position: 'relative',
                        height: slotCount * SLOT_PX,
                        borderLeft: '1px solid',
                        borderColor: 'divider',
                        bgcolor: isSameDay(day, now) ? 'rgba(168, 198, 250, 0.12)' : 'background.paper',
                        cursor: 'crosshair',
                      }}
                    >
                      {Array.from({ length: slotCount }, (_, index) => (
                        <Box
                          key={index}
                          data-slot="true"
                          sx={{
                            height: SLOT_PX,
                            borderBottom: '1px solid',
                            borderColor: index % 2 === 1 ? 'divider' : 'rgba(192, 192, 192, 0.45)',
                          }}
                        />
                      ))}
                      {showNow && isSameDay(day, now) ? (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: nowTop,
                            left: 0,
                            right: 0,
                            height: 0,
                            borderTop: `2px solid ${BRAND.navy}`,
                            zIndex: 4,
                            pointerEvents: 'none',
                            '&::before': {
                              content: '""',
                              position: 'absolute',
                              left: -5,
                              top: -5,
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: 'primary.main',
                            },
                          }}
                        />
                      ) : null}
                      {dayItems.map((item) => renderEventBlock(item, layout))}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                <Typography
                  key={label}
                  variant="caption"
                  sx={{ py: 1, textAlign: 'center', fontWeight: 700, letterSpacing: 0.5 }}
                >
                  {label}
                </Typography>
              ))}
            </Box>
            <Box
              sx={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gridTemplateRows: 'repeat(6, 1fr)',
                minHeight: 0,
              }}
            >
              {monthCells.map((day) => {
                const inMonth = day.getMonth() === startOfMonth(anchor).getMonth()
                const today = isSameDay(day, now)
                const dayItems = eventsForDay(items, day).sort((a, b) =>
                  String(a.startAt).localeCompare(String(b.startAt)),
                )
                const visible = dayItems.slice(0, MONTH_MORE_LIMIT)
                const extra = dayItems.length - visible.length
                return (
                  <Box
                    key={day.toISOString()}
                    onClick={() => handleMonthDayClick(day)}
                    sx={{
                      borderRight: '1px solid',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      p: 0.5,
                      minHeight: 88,
                      bgcolor: inMonth ? 'background.paper' : BRAND.grayBg,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: inMonth ? 'rgba(168, 198, 250, 0.16)' : 'rgba(192,192,192,0.35)' },
                    }}
                  >
                    <Box
                      component="button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setAnchor(day)
                        setView('workWeek')
                      }}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        background: today ? BRAND.navy : 'transparent',
                        color: today ? '#fff' : inMonth ? BRAND.ink : BRAND.inkMuted,
                      }}
                    >
                      {day.getDate()}
                    </Box>
                    <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                      {visible.map((item) => {
                        const name = eventPrimaryName(item, studentsById, groupsById)
                        const color = eventScheduleColor(item)
                        const selected = item.id === selectedId
                        return (
                          <Tooltip
                            key={item.id}
                            title={`${name} · ${formatTimeRange(item.startAt, item.endAt)}${item.title ? ` · ${item.title}` : ''}`}
                          >
                            <Chip
                              size="small"
                              clickable
                              icon={isGroupEvent(item) ? <GroupsIcon sx={{ fontSize: 14 }} /> : undefined}
                              label={`${formatClock(item.startAt)} ${name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                selectItem(item)
                              }}
                              sx={{
                                height: 22,
                                justifyContent: 'flex-start',
                                bgcolor: color.bg,
                                color: color.fg,
                                fontWeight: selected ? 800 : 600,
                                '& .MuiChip-label': {
                                  px: 0.75,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                },
                                '& .MuiChip-icon': { color: color.fg, ml: 0.5 },
                                outline: selected ? `2px solid ${BRAND.gold}` : 'none',
                              }}
                            />
                          </Tooltip>
                        )
                      })}
                      {extra > 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          +{extra} more
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          width: draft ? DETAIL_WIDTH : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: (theme) =>
            theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: draft
                ? theme.transitions.duration.enteringScreen
                : theme.transitions.duration.leavingScreen,
            }),
          display: 'flex',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: DETAIL_WIDTH,
            height: '100%',
            flexShrink: 0,
            borderLeft: '1px solid',
            borderColor: 'divider',
            borderRadius: 0,
            display: 'flex',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              flexShrink: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tooltip title="Hide details">
              <IconButton
                size="small"
                aria-label="Hide lesson details"
                onClick={closeDetail}
                sx={{ mt: 1.25, mx: 0.25 }}
              >
                <ChevronRightIcon />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {draft ? renderDetail() : null}
          </Box>
        </Paper>
      </Box>

      <ConfirmDeleteDialog
        open={Boolean(itemToDelete)}
        title="Delete this scheduled lesson?"
        description={
          itemToDelete
            ? `Remove “${itemToDelete.title || eventPrimaryName(itemToDelete, studentsById, groupsById) || 'this lesson'}” from the calendar? ${
                isGroupEvent(itemToDelete)
                  ? 'Student lesson plans stay. Only this calendar item is removed.'
                  : 'This cannot be undone.'
              }`
            : ''
        }
        confirmLabel="Delete lesson"
        deleting={deleting}
        onClose={() => !deleting && setItemToDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </Box>
  )
}

function AlertLike({ children }) {
  return (
    <Box sx={{ mx: 2, mt: 1.5, p: 1.25, bgcolor: 'secondary.light', borderRadius: 1 }}>
      <Typography variant="body2">{children}</Typography>
    </Box>
  )
}
