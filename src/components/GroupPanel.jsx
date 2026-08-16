import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import {
  fetchLessonsForStudents,
  formatLessonDisplayName,
  parseLessonData,
  studentDisplayName,
} from '../lib/fetchStudentLessonPlan'

const STUDENT_COLUMNS = [
  { field: 'name', headerName: 'Student', flex: 1.4, minWidth: 160 },
  { field: 'customID', headerName: 'ID', width: 120 },
]

const GROUP_LESSON_COLUMNS = [
  { field: 'studentName', headerName: 'Student', flex: 1, minWidth: 140 },
  {
    field: 'lessonNumber',
    headerName: 'Lesson #',
    type: 'number',
    width: 90,
    align: 'left',
    headerAlign: 'left',
  },
  { field: 'lessonDateLabel', headerName: 'Lesson date', width: 130 },
  { field: 'name', headerName: 'Lesson', flex: 1.2, minWidth: 160 },
  { field: 'newConcept', headerName: 'New concept', flex: 1, minWidth: 140 },
]

function todayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toIsoDate(value) {
  if (!value) return todayIso()
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return todayIso()
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return todayIso()
  return toIsoDate(parsed)
}

function formatLessonDate(value) {
  if (!value) return ''
  const iso = toIsoDate(value)
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export default function GroupPanel({
  group = null,
  students = [],
  saving = false,
  setError,
  onSave,
}) {
  const isNew = !group?.id
  const [name, setName] = useState(group?.name || '')
  const [selection, setSelection] = useState({
    type: 'include',
    ids: new Set(group?.studentIds ?? []),
  })
  const [lessons, setLessons] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(false)

  const memberIds = useMemo(
    () => [...new Set((group?.studentIds ?? []).filter(Boolean))],
    [group?.studentIds],
  )
  const memberKey = memberIds.join(',')

  useEffect(() => {
    setName(group?.name || '')
    setSelection({
      type: 'include',
      ids: new Set(group?.studentIds ?? []),
    })
  }, [group?.id, group?.name, group?.studentIds])

  useEffect(() => {
    const ids = memberKey ? memberKey.split(',') : []
    if (!group?.id || !ids.length) {
      setLessons([])
      setLoadingLessons(false)
      return undefined
    }
    let cancelled = false
    setLoadingLessons(true)
    fetchLessonsForStudents(ids)
      .then((items) => {
        if (!cancelled) setLessons(items)
      })
      .catch((err) => {
        if (!cancelled) {
          setLessons([])
          setError(err instanceof Error ? err.message : 'Failed to load group lessons')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLessons(false)
      })
    return () => {
      cancelled = true
    }
  }, [group?.id, memberKey, setError])

  const studentsById = useMemo(
    () => new Map((students ?? []).filter((student) => student?.id).map((student) => [student.id, student])),
    [students],
  )

  const rows = useMemo(
    () =>
      (students ?? [])
        .filter((student) => student?.id)
        .map((student) => ({
          id: student.id,
          name: studentDisplayName(student),
          customID: student.customID || '',
        })),
    [students],
  )

  const selectedIds = useMemo(() => {
    const ids = selection?.ids ?? new Set()
    const type = selection?.type ?? 'include'
    return rows
      .filter((row) => (type === 'exclude' ? !ids.has(row.id) : ids.has(row.id)))
      .map((row) => row.id)
  }, [rows, selection])

  const lessonRows = useMemo(
    () =>
      [...lessons]
        .sort((a, b) => {
          const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''))
          if (byDate) return byDate
          return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
        })
        .map((lesson) => {
          const data = parseLessonData(lesson.lessonData)
          const newConcept =
            data?.snapshots?.lists?.newConcept?.concept
            || data?.snapshots?.lists?.newConcept?.name
            || ''
          const customName = data?.name || lesson.name || ''
          const student = studentsById.get(lesson.studentID)
          return {
            id: lesson.id,
            studentName: student ? studentDisplayName(student) : 'Unknown student',
            lessonNumber: lesson.lessonNumber ?? '',
            lessonDateLabel: formatLessonDate(lesson.date) || '—',
            newConcept: newConcept || '—',
            name: formatLessonDisplayName(customName, newConcept, lesson.lessonNumber) || '—',
          }
        }),
    [lessons, studentsById],
  )

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the group a name.')
      return
    }
    onSave?.({
      id: group?.id ?? null,
      name: trimmed,
      studentIds: selectedIds,
    })
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 2,
        alignItems: 'start',
      }}
    >
      <Paper sx={{ p: 2, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <Typography variant="h6">{isNew ? 'Create group' : 'Students'}</Typography>
          <Chip size="small" variant="outlined" label={`${selectedIds.length} students`} />
          {saving ? <CircularProgress size={16} /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose who belongs in this group. Assigned lesson plans for these students appear on the right.
        </Typography>
        <TextField
          label="Group name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          size="small"
          fullWidth
          sx={{ mb: 2 }}
        />
        <Box sx={{ height: { xs: 360, md: 'calc(100vh - 360px)' }, minHeight: 280, width: '100%' }}>
          <DataGridPro
            rows={rows}
            columns={STUDENT_COLUMNS}
            checkboxSelection
            disableRowSelectionOnClick
            hideFooterSelectedRowCount
            rowSelectionModel={selection}
            onRowSelectionModelChange={(model) => setSelection(model)}
            pagination
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
            density="compact"
            localeText={{ noRowsLabel: 'Add students first, then put them in a group.' }}
          />
        </Box>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {isNew ? 'Save group' : 'Update group'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <Typography variant="h6">Assigned lessons</Typography>
          <Chip size="small" variant="outlined" label={`${lessonRows.length} plans`} />
          {loadingLessons ? <CircularProgress size={16} /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Lesson plans currently saved for students in this group, including copies shared from another student.
        </Typography>
        <Box sx={{ height: { xs: 360, md: 'calc(100vh - 280px)' }, minHeight: 280, width: '100%' }}>
          <DataGridPro
            rows={lessonRows}
            columns={GROUP_LESSON_COLUMNS}
            getRowId={(row) => row.id}
            loading={loadingLessons}
            pagination
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'lessonDateLabel', sort: 'desc' }] },
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
            density="compact"
            localeText={{
              noRowsLabel: isNew
                ? 'Save the group first, then assigned lesson plans will show here.'
                : memberIds.length
                  ? 'No lesson plans assigned to students in this group yet. Share a plan from a student\'s Lesson Plan tab.'
                  : 'Add students to this group to see their assigned lesson plans.',
            }}
          />
        </Box>
      </Paper>
    </Box>
  )
}
