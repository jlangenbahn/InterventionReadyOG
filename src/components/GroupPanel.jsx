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
import { studentDisplayName } from '../lib/fetchStudentLessonPlan'

const STUDENT_COLUMNS = [
  { field: 'name', headerName: 'Student', flex: 1.4, minWidth: 160 },
  { field: 'customID', headerName: 'ID', width: 120 },
]

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

  useEffect(() => {
    setName(group?.name || '')
    setSelection({
      type: 'include',
      ids: new Set(group?.studentIds ?? []),
    })
  }, [group?.id, group?.name, group?.studentIds])

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
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h6">{isNew ? 'Create group' : 'Group'}</Typography>
        <Chip size="small" variant="outlined" label={`${selectedIds.length} students`} />
        {saving ? <CircularProgress size={16} /> : null}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Bundle students so you can copy a lesson plan to everyone in the group. Scores still belong
        to each student.
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
      <Box sx={{ height: { xs: 360, md: 'calc(100vh - 320px)' }, minHeight: 280, width: '100%' }}>
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
  )
}
