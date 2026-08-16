import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { studentDisplayName } from '../lib/fetchStudentLessonPlan'

export default function ShareLessonDialog({
  open,
  lesson,
  students = [],
  groups = [],
  currentStudentId,
  sharing = false,
  onClose,
  onShare,
}) {
  const [selectedStudentIds, setSelectedStudentIds] = useState({ type: 'include', ids: new Set() })
  const [selectedGroupIds, setSelectedGroupIds] = useState({ type: 'include', ids: new Set() })

  useEffect(() => {
    if (!open) return
    setSelectedStudentIds({ type: 'include', ids: new Set() })
    setSelectedGroupIds({ type: 'include', ids: new Set() })
  }, [open, lesson?.id])

  const studentRows = useMemo(
    () =>
      (students ?? [])
        .filter((student) => student?.id && student.id !== currentStudentId)
        .map((student) => ({
          id: student.id,
          name: studentDisplayName(student),
          customID: student.customID || '',
        })),
    [students, currentStudentId],
  )

  const groupRows = useMemo(
    () =>
      (groups ?? [])
        .filter((group) => group?.id)
        .map((group) => ({
          id: group.id,
          name: group.name || 'Untitled group',
          memberCount: (group.studentIds ?? []).filter((id) => id && id !== currentStudentId).length,
          studentIds: (group.studentIds ?? []).filter((id) => id && id !== currentStudentId),
        })),
    [groups, currentStudentId],
  )

  const selectedIds = useMemo(() => {
    const ids = new Set()
    const studentSet = selectedStudentIds?.ids ?? new Set()
    const studentType = selectedStudentIds?.type ?? 'include'
    for (const row of studentRows) {
      const picked = studentSet.has(row.id)
      if (studentType === 'exclude' ? !picked : picked) ids.add(row.id)
    }
    const groupSet = selectedGroupIds?.ids ?? new Set()
    const groupType = selectedGroupIds?.type ?? 'include'
    for (const row of groupRows) {
      const picked = groupSet.has(row.id)
      if (groupType === 'exclude' ? !picked : picked) {
        for (const studentId of row.studentIds) ids.add(studentId)
      }
    }
    return [...ids]
  }, [selectedStudentIds, selectedGroupIds, studentRows, groupRows])

  function handleClose() {
    if (sharing) return
    setSelectedStudentIds({ type: 'include', ids: new Set() })
    setSelectedGroupIds({ type: 'include', ids: new Set() })
    onClose?.()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Share lesson plan</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Copy “{lesson?.name || 'this lesson'}” onto other students. Each copy belongs to that
          student and is scored separately. The original stays with the current student.
        </Typography>
        {groupRows.length ? (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Groups
            </Typography>
            <Box sx={{ height: 180, width: '100%' }}>
              <DataGridPro
                rows={groupRows}
                columns={[
                  { field: 'name', headerName: 'Group', flex: 1, minWidth: 140 },
                  {
                    field: 'memberCount',
                    headerName: 'Students',
                    type: 'number',
                    width: 100,
                    align: 'left',
                    headerAlign: 'left',
                  },
                ]}
                checkboxSelection
                disableRowSelectionOnClick
                hideFooterSelectedRowCount
                rowSelectionModel={selectedGroupIds}
                onRowSelectionModelChange={(model) => setSelectedGroupIds(model)}
                density="compact"
                slots={{ toolbar: GridToolbar }}
                slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
                localeText={{ noRowsLabel: 'No groups yet.' }}
              />
            </Box>
          </Box>
        ) : null}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
            Students
          </Typography>
          <Box sx={{ height: 280, width: '100%' }}>
            <DataGridPro
              rows={studentRows}
              columns={[
                { field: 'name', headerName: 'Student', flex: 1.2, minWidth: 140 },
                { field: 'customID', headerName: 'ID', width: 110 },
              ]}
              checkboxSelection
              disableRowSelectionOnClick
              hideFooterSelectedRowCount
              rowSelectionModel={selectedStudentIds}
              onRowSelectionModelChange={(model) => setSelectedStudentIds(model)}
              density="compact"
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
              localeText={{ noRowsLabel: 'No other students yet.' }}
            />
          </Box>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" variant="outlined" label={`${selectedIds.length} students will receive a copy`} />
        </Stack>
        {!studentRows.length ? (
          <Alert severity="info">Add another student before sharing a lesson plan.</Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={sharing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onShare?.(selectedIds)}
          disabled={sharing || selectedIds.length === 0}
        >
          {sharing ? 'Sharing…' : 'Copy to selected students'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
