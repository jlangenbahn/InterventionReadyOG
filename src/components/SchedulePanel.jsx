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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import PersonIcon from '@mui/icons-material/Person'
import SaveIcon from '@mui/icons-material/Save'
import TodayIcon from '@mui/icons-material/Today'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import { fetchStudentLessons, formatLessonDisplayName, studentDisplayName } from '../lib/fetchStudentLessonPlan'
import {
  addDays,
  addMinutes,
  defaultLessonTimes,
  deleteScheduledLesson,
  eventsForDay,
  fetchScheduledLessons,
  formatClock,
  formatDayName,
  formatMonthLabel,
  formatTimeRange,
  formatWeekRange,
  fromDateTimeLocal,
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
  studentScheduleColor,
  toDateTimeLocal,
} from '../lib/schedule'
import { BRAND } from '../theme'

const DETAIL_WIDTH = 360
const SLOT_MINUTES = 30
const SLOT_PX = 44
const GUTTER_PX = 64
const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 18
const WORK_DAYS = 5
const MONTH_MORE_LIMIT = 3

function emptyDraft(students, slotStart) {
  const { startAt, endAt } = defaultLessonTimes(slotStart ?? new Date())
  if (!slotStart) {
    startAt.setHours(9, 0, 0, 0)
    endAt.setTime(startAt.getTime() + 30 * 60_000)
  }
  return {
    id: null,
    studentID: students[0]?.id ?? '',
    title: '',
    startLocal: toDateTimeLocal(startAt),
    endLocal: toDateTimeLocal(endAt),
    notes: '',
    lessonID: '',
  }
}

function itemToDraft(item) {
  return {
    id: item.id,
    studentID: item.studentID ?? '',
    title: item.title ?? '',
    startLocal: toDateTimeLocal(item.startAt),
    endLocal: toDateTimeLocal(item.endAt),
    notes: item.notes ?? '',
    lessonID: item.lessonID ?? '',
  }
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
  const [studentLessons, setStudentLessons] = useState([])
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
      setDraft(emptyDraft(students, slotStart))
    },
    [students],
  )

  useEffect(() => {
    if (!createNonce) return
    setSelectedId(null)
    setDraft(emptyDraft(students))
    // students is read for the initial picker value; the form updates if the roster changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createNonce])

  const selectItem = useCallback((item) => {
    if (!item?.id) return
    setSelectedId(item.id)
    setDraft(itemToDraft(item))
  }, [])

  useEffect(() => {
    if (!draft?.studentID) {
      setStudentLessons([])
      return undefined
    }
    let cancelled = false
    setLoadingLessons(true)
    fetchStudentLessons(draft.studentID)
      .then((lessons) => {
        if (!cancelled) setStudentLessons(lessons ?? [])
      })
      .catch(() => {
        if (!cancelled) setStudentLessons([])
      })
      .finally(() => {
        if (!cancelled) setLoadingLessons(false)
      })
    return () => {
      cancelled = true
    }
  }, [draft?.studentID])

  const studentsById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )

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
    if (!draft?.studentID) return
    setSaving(true)
    try {
      const saved = await saveScheduledLesson({
        id: draft.id,
        title: draft.title,
        startAt: fromDateTimeLocal(draft.startLocal),
        endAt: fromDateTimeLocal(draft.endLocal),
        notes: draft.notes,
        studentID: draft.studentID,
        lessonID: draft.lessonID || null,
      })
      const records = await fetchScheduledLessons()
      setItems(records)
      setSelectedId(saved.id)
      setDraft(itemToDraft(saved))
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
    const student = studentsById.get(item.studentID)
    const name = studentDisplayName(student)
    const color = studentScheduleColor(item.studentID)
    const selected = item.id === selectedId || (!selectedId && draft?.id === item.id)
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
        {item.title ? (
          <Typography variant="caption" noWrap sx={{ display: 'block', opacity: 0.95 }}>
            {item.title}
          </Typography>
        ) : null}
      </Box>
    )
  }

  function renderDetail() {
    if (!draft) {
      return (
        <Stack spacing={2} sx={{ p: 2 }}>
          <Typography variant="h6">Lesson details</Typography>
          <Typography variant="body2" color="text.secondary">
            Select a lesson on the calendar to view or edit it, or create a new one.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => beginCreate()}>
            New lesson
          </Button>
        </Stack>
      )
    }

    const student = studentsById.get(draft.studentID)
    const isNew = !draft.id

    return (
      <Box component="form" onSubmit={(event) => void handleSave(event)} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack spacing={1.5} sx={{ p: 2, flex: 1, overflow: 'auto' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="h6">{isNew ? 'New lesson' : 'Lesson details'}</Typography>
            {student ? (
              <Button
                size="small"
                startIcon={<PersonIcon />}
                onClick={() => onOpenStudent?.(student.id)}
              >
                {studentDisplayName(student)}
              </Button>
            ) : null}
          </Stack>

            {students.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Add a student in the left nav before scheduling a lesson.
              </Typography>
            ) : null}
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

          <TextField
            label="Title"
            size="small"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Optional — student name is shown on the calendar"
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
              {studentLessons.map((lesson) => (
                <MenuItem key={lesson.id} value={lesson.id}>
                  {formatLessonDisplayName(lesson.name, '', lesson.lessonNumber) || `Lesson ${lesson.lessonNumber ?? ''}`.trim()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
            minRows={4}
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
            <Button onClick={() => setDraft(null)}>Cancel</Button>
          )}
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={saving || !draft.studentID}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </Button>
        </Stack>
      </Box>
    )
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
                        const student = studentsById.get(item.studentID)
                        const name = studentDisplayName(student)
                        const color = studentScheduleColor(item.studentID)
                        const selected = item.id === selectedId
                        return (
                          <Tooltip
                            key={item.id}
                            title={`${name} · ${formatTimeRange(item.startAt, item.endAt)}${item.title ? ` · ${item.title}` : ''}`}
                          >
                            <Chip
                              size="small"
                              clickable
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

      <Paper
        elevation={0}
        sx={{
          width: DETAIL_WIDTH,
          flexShrink: 0,
          borderLeft: '1px solid',
          borderColor: 'divider',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
        }}
      >
        {renderDetail()}
      </Paper>

      <ConfirmDeleteDialog
        open={Boolean(itemToDelete)}
        title="Delete this scheduled lesson?"
        description={
          itemToDelete
            ? `Remove “${itemToDelete.title || studentDisplayName(studentsById.get(itemToDelete.studentID)) || 'this lesson'}” from the calendar? This cannot be undone.`
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
