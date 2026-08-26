/**
 * Student Scope and Sequence grid.
 * Edits stay local until Save. Unlock to change in-scope, sequence, and mastery.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar, useGridApiRef } from '@mui/x-data-grid-pro'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import LockIcon from '@mui/icons-material/Lock'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SaveIcon from '@mui/icons-material/Save'
import { client } from '../../lib/amplifyClient'
import { downloadCsvTable, downloadXlsxTable, sanitizeFileStem } from '../../lib/exportTable'
import {
  MASTERY_STATUSES,
  buildScopeAndSequence,
  buildScopeExportTable,
  inventoryToRows,
  normalizeSequence,
  parseScopeAndSequence,
  serializeScopeAndSequence,
} from '../../lib/scopeAndSequence'
import { studentDisplayName } from '../../lib/studentDisplay'
import { masteryRowSx } from '../../theme'

function scopeColumnDefs(locked) {
  return [
    {
      field: 'inScope',
      headerName: 'In scope',
      width: 110,
      sortable: true,
      filterable: true,
      editable: false,
      disableColumnMenu: true,
      valueFormatter: (value) => (value === true ? 'Yes' : 'No'),
      // Display only — toggle is handled by DataGrid onCellClick (one click).
      renderCell: (params) => (
        <Checkbox
          size="small"
          checked={params.row.inScope === true}
          disabled={locked}
          tabIndex={-1}
          disableRipple
          sx={{ pointerEvents: 'none' }}
          inputProps={{ 'aria-label': `In scope for ${params.row.concept || 'concept'}` }}
        />
      ),
      sortComparator: (a, b) => Number(Boolean(b)) - Number(Boolean(a)),
    },
    {
      field: 'sequence',
      headerName: 'Sequence',
      type: 'number',
      width: 110,
      editable: !locked,
      align: 'left',
      headerAlign: 'left',
      sortComparator: (a, b) => {
        if (a == null && b == null) return 0
        if (a == null) return 1
        if (b == null) return -1
        return Number(a) - Number(b)
      },
    },
    { field: 'concept', headerName: 'Concept', flex: 1.2, minWidth: 180 },
    {
      field: 'masteryStatus',
      headerName: 'Mastery status',
      type: 'singleSelect',
      width: 150,
      editable: !locked,
      valueOptions: MASTERY_STATUSES,
    },
    {
      field: 'level',
      headerName: 'Level',
      width: 90,
      sortComparator: (a, b) => {
        const left = Number(a)
        const right = Number(b)
        const leftNum = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY
        const rightNum = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY
        return leftNum - rightNum
      },
    },
    { field: 'category', headerName: 'Category', flex: 1, minWidth: 160 },
    { field: 'subcategory', headerName: 'Subcategory', flex: 1, minWidth: 160 },
  ]
}

function emptyScopeSelection() {
  return { type: 'include', ids: new Set() }
}

function ScopeToolbarGroup({ label, children }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{ minWidth: 0 }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      {children}
    </Stack>
  )
}

export default function ScopeAndSequencePanel({
  student,
  concepts,
  loadingCatalog,
  onScopeUpdated,
  setError,
  locked,
  onLockedChange,
  saveRef,
}) {
  const [saving, setSaving] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  // Local draft while editing — nothing hits the DB until Save.
  const [draftInventory, setDraftInventory] = useState(null)
  const [scopeSelection, setScopeSelection] = useState(emptyScopeSelection)
  const [levelPreset, setLevelPreset] = useState('')
  const gridApiRef = useGridApiRef()

  const persistedInventory = useMemo(() => {
    if (!student || !concepts.length) return []
    return buildScopeAndSequence(concepts, parseScopeAndSequence(student.scopeAndSequence))
  }, [student, concepts])

  const activeInventory = !locked && draftInventory ? draftInventory : persistedInventory

  const rows = useMemo(
    () => inventoryToRows(concepts, activeInventory),
    [concepts, activeInventory],
  )

  const draftRef = useRef(null)

  const setDraft = useCallback(
    (updater) => {
      setDraftInventory((prev) => {
        const base =
          prev ??
          buildScopeAndSequence(concepts, parseScopeAndSequence(student?.scopeAndSequence))
        const next = typeof updater === 'function' ? updater(base) : updater
        draftRef.current = next
        return next
      })
    },
    [concepts, student],
  )

  const persistInventory = useCallback(
    async (nextInventory) => {
      if (!student?.id) return null
      setSaving(true)
      try {
        const { data, errors } = await client.models.Student.update({
          id: student.id,
          scopeAndSequence: serializeScopeAndSequence(nextInventory),
        })
        if (errors?.length) throw new Error(errors.map((e) => e.message).join(', '))
        // Always keep the inventory we just wrote — update responses sometimes omit AWSJSON.
        onScopeUpdated({
          ...student,
          ...(data ?? {}),
          scopeAndSequence: nextInventory,
        })
        setError('')
        return data
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update Scope and Sequence')
        throw err
      } finally {
        setSaving(false)
      }
    },
    [student, onScopeUpdated, setError],
  )

  const beginEdit = useCallback(() => {
    const draft = buildScopeAndSequence(
      concepts,
      parseScopeAndSequence(student?.scopeAndSequence),
    )
    draftRef.current = draft
    setDraftInventory(draft)
    onLockedChange(false)
  }, [concepts, student, onLockedChange])

  const saveEdit = useCallback(async () => {
    const draft = draftRef.current
    if (locked || !Array.isArray(draft)) {
      onLockedChange(true)
      return true
    }
    try {
      await persistInventory(draft)
      draftRef.current = null
      setDraftInventory(null)
      onLockedChange(true)
      return true
    } catch {
      return false
    }
  }, [locked, persistInventory, onLockedChange])

  useEffect(() => {
    if (!saveRef) return undefined
    saveRef.current = saveEdit
    return () => {
      if (saveRef.current === saveEdit) saveRef.current = null
    }
  }, [saveRef, saveEdit])

  useEffect(() => {
    if (locked) {
      draftRef.current = null
      setDraftInventory(null)
      setScopeSelection(emptyScopeSelection())
      setLevelPreset('')
    }
  }, [locked])

  useEffect(() => {
    draftRef.current = null
    setDraftInventory(null)
    setScopeSelection(emptyScopeSelection())
    setLevelPreset('')
  }, [student?.id])

  const toggleInScopeForRow = useCallback(
    (row, nextValue) => {
      if (locked || !row?.conceptId) return
      setDraft((base) =>
        base.map((entry) =>
          entry.conceptId === row.conceptId
            ? { ...entry, inScope: nextValue === true }
            : entry,
        ),
      )
    },
    [locked, setDraft],
  )

  const selectedScopeRows = useMemo(() => {
    const ids = scopeSelection?.ids ?? new Set()
    const type = scopeSelection?.type ?? 'include'
    if (!ids.size) return []
    if (type === 'exclude') return rows.filter((row) => !ids.has(row.conceptId))
    return rows.filter((row) => ids.has(row.conceptId))
  }, [rows, scopeSelection])

  const applyInScopeToSelected = useCallback(
    (inScope) => {
      if (locked || !selectedScopeRows.length) return
      const ids = new Set(selectedScopeRows.map((row) => row.conceptId).filter(Boolean))
      if (!ids.size) return
      setDraft((base) =>
        base.map((entry) => (ids.has(entry.conceptId) ? { ...entry, inScope } : entry)),
      )
    },
    [locked, selectedScopeRows, setDraft],
  )

  const applyInScopeToAll = useCallback(
    (inScope) => {
      if (locked) return
      setLevelPreset('')
      setDraft((base) => base.map((entry) => ({ ...entry, inScope })))
    },
    [locked, setDraft],
  )

  const scopeLevels = useMemo(() => {
    const levels = new Set()
    for (const concept of concepts ?? []) {
      const level = String(concept?.level ?? '').trim()
      if (level) levels.add(level)
    }
    return [...levels].sort((a, b) => {
      const left = Number(a)
      const right = Number(b)
      const leftNum = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY
      const rightNum = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY
      if (leftNum !== rightNum) return leftNum - rightNum
      return String(a).localeCompare(String(b))
    })
  }, [concepts])

  const columns = useMemo(() => scopeColumnDefs(locked), [locked])

  const collectExportRows = useCallback(() => {
    const sorted = gridApiRef.current?.getSortedRows?.()
    return Array.isArray(sorted) && sorted.length ? sorted : rows
  }, [gridApiRef, rows])

  const exportFileStem = useMemo(
    () => sanitizeFileStem(`Scope and Sequence - ${studentDisplayName(student)}`),
    [student],
  )

  const exportScopeTable = useCallback(
    (format) => {
      const table = buildScopeExportTable(collectExportRows(), columns)
      if (format === 'xlsx') {
        downloadXlsxTable(`${exportFileStem}.xlsx`, table.headers, table.rows, 'Scope and Sequence')
        return
      }
      downloadCsvTable(`${exportFileStem}.csv`, table.headers, table.rows)
    },
    [collectExportRows, columns, exportFileStem],
  )

  // Backfill only missing concept IDs. Never run while editing (would clobber draft/saves).
  useEffect(() => {
    if (!student?.id || loadingCatalog || !concepts.length || !locked) return
    const existing = parseScopeAndSequence(student.scopeAndSequence)
    const existingIds = new Set(existing.map((entry) => entry.conceptId).filter(Boolean))
    const needsPersist = concepts.some((concept) => !existingIds.has(concept.id))
    if (!needsPersist) return

    const merged = buildScopeAndSequence(concepts, existing)
    let cancelled = false
    ;(async () => {
      try {
        const { data, errors } = await client.models.Student.update({
          id: student.id,
          scopeAndSequence: serializeScopeAndSequence(merged),
        })
        if (errors?.length) throw new Error(errors.map((e) => e.message).join(', '))
        if (!cancelled) {
          onScopeUpdated({
            ...student,
            ...(data ?? {}),
            scopeAndSequence: merged,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize Scope and Sequence')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [student, concepts, loadingCatalog, locked, onScopeUpdated, setError])

  function processRowUpdate(newRow, oldRow) {
    if (locked) return oldRow

    const sequence = normalizeSequence(newRow.sequence)
    const inScope = newRow.inScope === true
    const masteryStatus = MASTERY_STATUSES.includes(newRow.masteryStatus)
      ? newRow.masteryStatus
      : 'unknown'

    setDraft((base) =>
      base.map((entry) =>
        entry.conceptId === newRow.conceptId
          ? {
              conceptId: newRow.conceptId,
              inScope,
              masteryStatus,
              sequence,
            }
          : entry,
      ),
    )

    return {
      ...newRow,
      inScope,
      masteryStatus,
      sequence,
    }
  }

  function applyLevelPreset(level) {
    if (locked) return
    const target = String(level ?? '').trim()
    setLevelPreset(target)
    if (!target) return
    setDraft((base) =>
      base.map((entry) => {
        const concept = concepts.find((item) => item.id === entry.conceptId)
        const isTargetLevel = String(concept?.level ?? '').trim() === target
        return { ...entry, inScope: isTargetLevel }
      }),
    )
  }

  function resetMasteryToUnknown() {
    if (locked) return
    setDraft((base) => base.map((entry) => ({ ...entry, masteryStatus: 'unknown' })))
    setResetConfirmOpen(false)
  }

  if (!student) {
    return (
      <Typography color="text.secondary">
        Select a student to view their Scope and Sequence.
      </Typography>
    )
  }

  if (loadingCatalog) {
    return (
      <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Paper
      sx={{
        p: 2,
        height: 'calc(100vh - 200px)',
        minHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        border: locked ? '1px solid' : '2px solid',
        borderColor: locked ? 'divider' : 'primary.main',
        bgcolor: locked ? 'background.paper' : 'rgba(15, 76, 92, 0.04)',
      }}
    >
      <Stack spacing={1.25} sx={{ mb: 1.5 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
            <Typography variant="h6">Scope and Sequence</Typography>
            <Chip size="small" label={studentDisplayName(student)} />
            <Chip size="small" variant="outlined" label={`${rows.length} concepts`} />
            {saving ? <Chip size="small" color="primary" label="Saving…" /> : null}
          </Stack>
          {locked ? (
            <Tooltip title="Unlock to edit Scope and Sequence">
              <Button
                variant="contained"
                color="warning"
                startIcon={<LockIcon />}
                onClick={beginEdit}
              >
                Locked
              </Button>
            </Tooltip>
          ) : (
            <Tooltip title="Save all changes to the database">
              <Button
                variant="contained"
                color="success"
                startIcon={<SaveIcon />}
                disabled={saving}
                onClick={() => {
                  void saveEdit()
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </Tooltip>
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={2.5}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <ScopeToolbarGroup label="Download">
            <ButtonGroup variant="outlined" color="inherit" disabled={!rows.length} size="small">
              <Button startIcon={<FileDownloadIcon />} onClick={() => exportScopeTable('csv')}>
                CSV
              </Button>
              <Button onClick={() => exportScopeTable('xlsx')}>XLSX</Button>
            </ButtonGroup>
          </ScopeToolbarGroup>
          <ScopeToolbarGroup label="In scope">
            <ButtonGroup variant="outlined" color="inherit" disabled={locked || saving} size="small">
              <Button
                onClick={() => applyInScopeToSelected(true)}
                disabled={locked || saving || !selectedScopeRows.length}
              >
                Selected in
              </Button>
              <Button
                onClick={() => applyInScopeToSelected(false)}
                disabled={locked || saving || !selectedScopeRows.length}
              >
                Selected out
              </Button>
              <Button onClick={() => applyInScopeToAll(true)} disabled={locked || saving || !rows.length}>
                All in
              </Button>
              <Button onClick={() => applyInScopeToAll(false)} disabled={locked || saving || !rows.length}>
                All out
              </Button>
            </ButtonGroup>
            <Chip size="small" variant="outlined" label={`${selectedScopeRows.length} selected`} />
          </ScopeToolbarGroup>
          {scopeLevels.length ? (
            <ScopeToolbarGroup label="Level">
              <FormControl size="small" sx={{ minWidth: 110 }} disabled={locked || saving}>
                <InputLabel id="scope-level-preset">Level</InputLabel>
                <Select
                  labelId="scope-level-preset"
                  label="Level"
                  value={levelPreset}
                  onChange={(event) => applyLevelPreset(event.target.value)}
                >
                  <MenuItem value="">
                    <em>Choose…</em>
                  </MenuItem>
                  {scopeLevels.map((level) => (
                    <MenuItem key={level} value={level}>
                      Level {level}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </ScopeToolbarGroup>
          ) : null}
          <ScopeToolbarGroup label="Mastery">
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<RestartAltIcon />}
              disabled={locked || saving}
              onClick={() => setResetConfirmOpen(true)}
            >
              Reset to unknown
            </Button>
          </ScopeToolbarGroup>
        </Stack>
      </Stack>

      {locked ? (
        <Alert severity="warning" icon={<LockIcon />} sx={{ mb: 1.5 }}>
          Editing is locked. Unlock to change In scope, Sequence, Mastery status, or bulk scope
          actions. Changes are saved only when you click Save.
        </Alert>
      ) : (
        <Alert severity="info" icon={<SaveIcon />} sx={{ mb: 1.5 }}>
          Editing mode: changes stay on this page until you click Save. Click In scope once to
          toggle, select rows and use Selected in / Selected out, or use All in / All out. A level
          marks only that level in scope. Save before leaving this tab or switching students.
        </Alert>
      )}

      <Box sx={{ flex: 1, width: '100%' }}>
        <DataGridPro
          key={student.id}
          apiRef={gridApiRef}
          rows={rows}
          columns={columns}
          getRowId={(row) => row.conceptId}
          getRowClassName={(params) => {
            const status = MASTERY_STATUSES.includes(params.row.masteryStatus)
              ? params.row.masteryStatus
              : 'unknown'
            return `mastery-row-${status}`
          }}
          disableRowSelectionOnClick
          checkboxSelection={!locked}
          disableRowSelectionExcludeModel
          hideFooterSelectedRowCount
          isRowSelectable={() => !locked}
          rowSelectionModel={scopeSelection}
          onRowSelectionModelChange={(model) => setScopeSelection(model)}
          pagination
          sortingMode="client"
          filterMode="client"
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 50 } },
            sorting: {
              sortModel: [
                { field: 'inScope', sort: 'asc' },
                { field: 'sequence', sort: 'asc' },
                { field: 'level', sort: 'asc' },
              ],
            },
          }}
          isCellEditable={(params) => !locked && params.field !== 'inScope'}
          onCellClick={(params, event) => {
            if (params.field !== 'inScope') return
            event.defaultMuiPrevented = true
            if (locked) return
            void toggleInScopeForRow(params.row, !params.row.inScope)
          }}
          onCellDoubleClick={(params, event) => {
            if (params.field === 'inScope') {
              event.defaultMuiPrevented = true
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          processRowUpdate={processRowUpdate}
          onProcessRowUpdateError={(err) => {
            setError(err instanceof Error ? err.message : 'Failed to update row')
          }}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: { debounceMs: 300 },
              csvOptions: {
                fileName: exportFileStem,
                utf8WithBom: true,
                includeHeaders: true,
                allColumns: true,
              },
            },
          }}
          density="compact"
          sx={{
            '& .MuiDataGrid-cell[data-field="inScope"]': {
              px: 0,
            },
            ...masteryRowSx,
          }}
        />
      </Box>

      <Dialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        aria-labelledby="reset-mastery-title"
      >
        <DialogTitle id="reset-mastery-title">Reset all mastery statuses?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will set every concept to unknown. Click Reset only if you are sure you want to
            clear all current mastery statuses (unknown, new, review, and mastered). Changes stay on
            this page until you click Save.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={resetMasteryToUnknown} autoFocus>
            Reset to unknown
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
