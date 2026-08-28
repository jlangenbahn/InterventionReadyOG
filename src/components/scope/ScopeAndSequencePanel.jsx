/**
 * Student Scope and Sequence grid.
 * Mastery is the default tab and focuses on in-scope concepts; click a status to cycle it.
 * Concept Inventory controls what is in scope and the teaching sequence.
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
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar, useGridApiRef } from '@mui/x-data-grid-pro'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
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
  nextMasteryStatus,
  normalizeSequence,
  parseScopeAndSequence,
  serializeScopeAndSequence,
} from '../../lib/scopeAndSequence'
import { studentDisplayName } from '../../lib/studentDisplay'
import { MASTERY_ROW_COLORS, masteryRowSx } from '../../theme'

const SCOPE_TAB_MASTERY = 0
const SCOPE_TAB_INVENTORY = 1

function catalogColumn(field, headerName, extra = {}) {
  return { field, headerName, ...extra }
}

function levelSortComparator(a, b) {
  const left = Number(a)
  const right = Number(b)
  const leftNum = Number.isFinite(left) ? left : Number.POSITIVE_INFINITY
  const rightNum = Number.isFinite(right) ? right : Number.POSITIVE_INFINITY
  return leftNum - rightNum
}

function visibleRowsFromGrid(apiRef, rows) {
  const sorted = apiRef.current?.getSortedRows?.()
  return Array.isArray(sorted) && sorted.length ? sorted : rows
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

function inventoryColumnDefs({ locked, headerChecked, headerIndeterminate, onHeaderToggle }) {
  return [
    {
      field: 'inScope',
      headerName: 'In scope',
      width: 128,
      sortable: true,
      filterable: true,
      editable: false,
      disableColumnMenu: true,
      valueFormatter: (value) => (value === true ? 'Yes' : 'No'),
      renderHeader: () => (
        <Stack direction="row" spacing={0.25} alignItems="center">
          <Checkbox
            size="small"
            checked={headerChecked}
            indeterminate={headerIndeterminate}
            disabled={locked}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onChange={onHeaderToggle}
            inputProps={{ 'aria-label': 'Mark visible concepts in scope' }}
          />
          <Box component="span">In scope</Box>
        </Stack>
      ),
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
    catalogColumn('concept', 'Concept', { flex: 1.2, minWidth: 180 }),
    catalogColumn('level', 'Level', { width: 90, sortComparator: levelSortComparator }),
    catalogColumn('category', 'Category', { flex: 1, minWidth: 160 }),
    catalogColumn('subcategory', 'Subcategory', { flex: 1, minWidth: 160 }),
  ]
}

function MasteryStatusChip({ status }) {
  const colors = MASTERY_ROW_COLORS[status] ?? MASTERY_ROW_COLORS.unknown
  return (
    <Chip
      size="small"
      label={status}
      sx={{
        pointerEvents: 'none',
        textTransform: 'capitalize',
        fontWeight: 700,
        bgcolor: colors.bg,
        color: colors.color,
        border: '1px solid',
        borderColor: status === 'unknown' ? 'divider' : colors.color,
      }}
    />
  )
}

function masteryColumnDefs({ hideInScope }) {
  const columns = [
    {
      field: 'masteryStatus',
      headerName: 'Mastery',
      width: 150,
      sortable: true,
      filterable: true,
      editable: false,
      disableColumnMenu: true,
      valueOptions: MASTERY_STATUSES,
      renderCell: (params) => {
        const status = MASTERY_STATUSES.includes(params.row.masteryStatus)
          ? params.row.masteryStatus
          : 'unknown'
        return <MasteryStatusChip status={status} />
      },
    },
    catalogColumn('concept', 'Concept', { flex: 1.2, minWidth: 180 }),
  ]
  if (!hideInScope) {
    columns.push({
      field: 'inScope',
      headerName: 'In scope',
      width: 110,
      sortable: true,
      filterable: true,
      editable: false,
      valueFormatter: (value) => (value === true ? 'Yes' : 'No'),
      renderCell: (params) => (
        <Chip
          size="small"
          variant={params.row.inScope ? 'filled' : 'outlined'}
          color={params.row.inScope ? 'primary' : 'default'}
          label={params.row.inScope ? 'Yes' : 'No'}
        />
      ),
      sortComparator: (a, b) => Number(Boolean(b)) - Number(Boolean(a)),
    })
  }
  columns.push(
    {
      field: 'sequence',
      headerName: 'Sequence',
      type: 'number',
      width: 110,
      editable: false,
      align: 'left',
      headerAlign: 'left',
    },
    catalogColumn('level', 'Level', { width: 90, sortComparator: levelSortComparator }),
    catalogColumn('category', 'Category', { flex: 1, minWidth: 160 }),
    catalogColumn('subcategory', 'Subcategory', { flex: 1, minWidth: 160 }),
  )
  return columns
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
  const [draftInventory, setDraftInventory] = useState(null)
  const [levelPreset, setLevelPreset] = useState('')
  const [subTab, setSubTab] = useState(SCOPE_TAB_MASTERY)
  const [masteryInScopeOnly, setMasteryInScopeOnly] = useState(true)
  const [visibleTick, setVisibleTick] = useState(0)
  const gridApiRef = useGridApiRef()
  const lastInScopeIndexRef = useRef(-1)
  const lastMasteryIndexRef = useRef(-1)

  const persistedInventory = useMemo(() => {
    if (!student || !concepts.length) return []
    return buildScopeAndSequence(concepts, parseScopeAndSequence(student.scopeAndSequence))
  }, [student, concepts])

  const activeInventory = !locked && draftInventory ? draftInventory : persistedInventory

  const rows = useMemo(
    () => inventoryToRows(concepts, activeInventory),
    [concepts, activeInventory],
  )

  const gridRows = useMemo(() => {
    if (subTab !== SCOPE_TAB_MASTERY || !masteryInScopeOnly) return rows
    return rows.filter((row) => row.inScope === true)
  }, [rows, subTab, masteryInScopeOnly])

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
      setLevelPreset('')
      lastInScopeIndexRef.current = -1
      lastMasteryIndexRef.current = -1
    }
  }, [locked])

  useEffect(() => {
    draftRef.current = null
    setDraftInventory(null)
    setLevelPreset('')
    lastInScopeIndexRef.current = -1
    lastMasteryIndexRef.current = -1
    setSubTab(SCOPE_TAB_MASTERY)
  }, [student?.id])

  const bumpVisible = useCallback(() => {
    lastInScopeIndexRef.current = -1
    lastMasteryIndexRef.current = -1
    setVisibleTick((tick) => tick + 1)
  }, [])

  const visibleInventoryRows = useMemo(() => {
    void visibleTick
    if (subTab !== SCOPE_TAB_INVENTORY) return gridRows
    return visibleRowsFromGrid(gridApiRef, gridRows)
  }, [visibleTick, subTab, gridRows, gridApiRef])

  const visibleInScopeCount = visibleInventoryRows.filter((row) => row.inScope === true).length
  const headerChecked = visibleInventoryRows.length > 0 && visibleInScopeCount === visibleInventoryRows.length
  const headerIndeterminate = visibleInScopeCount > 0 && visibleInScopeCount < visibleInventoryRows.length

  const applyInScopeToIds = useCallback(
    (ids, inScope) => {
      if (locked || !ids.size) return
      setDraft((base) =>
        base.map((entry) => (ids.has(entry.conceptId) ? { ...entry, inScope } : entry)),
      )
    },
    [locked, setDraft],
  )

  const applyInScopeToVisible = useCallback(
    (inScope) => {
      const ids = new Set(visibleInventoryRows.map((row) => row.conceptId).filter(Boolean))
      applyInScopeToIds(ids, inScope)
    },
    [visibleInventoryRows, applyInScopeToIds],
  )

  const applyInScopeToAll = useCallback(
    (inScope) => {
      if (locked) return
      setLevelPreset('')
      setDraft((base) => base.map((entry) => ({ ...entry, inScope })))
    },
    [locked, setDraft],
  )

  const toggleInScopeRange = useCallback(
    (row, nextValue, shiftKey) => {
      if (locked || !row?.conceptId) return
      const visible = visibleRowsFromGrid(gridApiRef, gridRows)
      const clickedIndex = visible.findIndex((item) => item.conceptId === row.conceptId)
      let targetIds = new Set([row.conceptId])
      if (shiftKey && lastInScopeIndexRef.current >= 0 && clickedIndex >= 0) {
        const start = Math.min(lastInScopeIndexRef.current, clickedIndex)
        const end = Math.max(lastInScopeIndexRef.current, clickedIndex)
        targetIds = new Set(visible.slice(start, end + 1).map((item) => item.conceptId))
      }
      lastInScopeIndexRef.current = clickedIndex
      applyInScopeToIds(targetIds, nextValue === true)
    },
    [locked, gridApiRef, gridRows, applyInScopeToIds],
  )

  const applyMasteryToIds = useCallback(
    (ids, masteryStatus) => {
      if (locked || !ids.size || !MASTERY_STATUSES.includes(masteryStatus)) return
      setDraft((base) =>
        base.map((entry) => (ids.has(entry.conceptId) ? { ...entry, masteryStatus } : entry)),
      )
    },
    [locked, setDraft],
  )

  const applyMasteryToVisible = useCallback(
    (masteryStatus) => {
      const visible = visibleRowsFromGrid(gridApiRef, gridRows)
      const ids = new Set(visible.map((row) => row.conceptId).filter(Boolean))
      applyMasteryToIds(ids, masteryStatus)
    },
    [gridApiRef, gridRows, applyMasteryToIds],
  )

  const cycleMasteryRange = useCallback(
    (row, shiftKey) => {
      if (locked || !row?.conceptId) return
      const visible = visibleRowsFromGrid(gridApiRef, gridRows)
      const clickedIndex = visible.findIndex((item) => item.conceptId === row.conceptId)
      const nextStatus = nextMasteryStatus(row.masteryStatus)
      let targetIds = new Set([row.conceptId])
      if (shiftKey && lastMasteryIndexRef.current >= 0 && clickedIndex >= 0) {
        const start = Math.min(lastMasteryIndexRef.current, clickedIndex)
        const end = Math.max(lastMasteryIndexRef.current, clickedIndex)
        targetIds = new Set(visible.slice(start, end + 1).map((item) => item.conceptId))
      }
      lastMasteryIndexRef.current = clickedIndex
      applyMasteryToIds(targetIds, nextStatus)
    },
    [locked, gridApiRef, gridRows, applyMasteryToIds],
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

  const columns = useMemo(
    () =>
      subTab === SCOPE_TAB_MASTERY
        ? masteryColumnDefs({ hideInScope: masteryInScopeOnly })
        : inventoryColumnDefs({
            locked,
            headerChecked,
            headerIndeterminate,
            onHeaderToggle: () => applyInScopeToVisible(!headerChecked),
          }),
    [subTab, locked, headerChecked, headerIndeterminate, applyInScopeToVisible, masteryInScopeOnly],
  )

  const collectExportRows = useCallback(() => {
    return visibleRowsFromGrid(gridApiRef, gridRows)
  }, [gridApiRef, gridRows])

  const exportFileStem = useMemo(
    () =>
      sanitizeFileStem(
        `${subTab === SCOPE_TAB_MASTERY ? 'Mastery' : 'Concept Inventory'} - ${studentDisplayName(student)}`,
      ),
    [student, subTab],
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

  const inventoryTab = subTab === SCOPE_TAB_INVENTORY

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

        <Tabs
          value={subTab}
          onChange={(_event, value) => {
            lastInScopeIndexRef.current = -1
            lastMasteryIndexRef.current = -1
            setSubTab(value)
          }}
          variant="fullWidth"
        >
          <Tab icon={<InsightsOutlinedIcon />} iconPosition="start" label="Mastery" />
          <Tab
            icon={<Inventory2OutlinedIcon />}
            iconPosition="start"
            label="Concept Inventory"
          />
        </Tabs>

        <Stack
          direction="row"
          spacing={2.5}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <ScopeToolbarGroup label="Download">
            <ButtonGroup variant="outlined" color="inherit" disabled={!gridRows.length} size="small">
              <Button startIcon={<FileDownloadIcon />} onClick={() => exportScopeTable('csv')}>
                CSV
              </Button>
              <Button onClick={() => exportScopeTable('xlsx')}>XLSX</Button>
            </ButtonGroup>
          </ScopeToolbarGroup>
          {inventoryTab ? (
            <>
              <ScopeToolbarGroup label="In scope">
                <ButtonGroup variant="outlined" color="inherit" disabled={locked || saving} size="small">
                  <Button
                    onClick={() => applyInScopeToVisible(true)}
                    disabled={locked || saving || !visibleInventoryRows.length}
                  >
                    Visible in
                  </Button>
                  <Button
                    onClick={() => applyInScopeToVisible(false)}
                    disabled={locked || saving || !visibleInventoryRows.length}
                  >
                    Visible out
                  </Button>
                  <Button onClick={() => applyInScopeToAll(true)} disabled={locked || saving || !rows.length}>
                    All in
                  </Button>
                  <Button onClick={() => applyInScopeToAll(false)} disabled={locked || saving || !rows.length}>
                    All out
                  </Button>
                </ButtonGroup>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${visibleInScopeCount} of ${visibleInventoryRows.length} shown`}
                />
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
            </>
          ) : (
            <ScopeToolbarGroup label="Mastery">
              <FormControlLabel
                sx={{ mr: 0, ml: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={masteryInScopeOnly}
                    onChange={(event) => setMasteryInScopeOnly(event.target.checked)}
                  />
                }
                label="In scope only"
              />
              <FormControl size="small" sx={{ minWidth: 150 }} disabled={locked || saving || !gridRows.length}>
                <InputLabel id="mastery-set-visible">Set shown to</InputLabel>
                <Select
                  labelId="mastery-set-visible"
                  label="Set shown to"
                  value=""
                  onChange={(event) => applyMasteryToVisible(event.target.value)}
                >
                  <MenuItem value="">
                    <em>Choose…</em>
                  </MenuItem>
                  {MASTERY_STATUSES.map((status) => (
                    <MenuItem key={status} value={status} sx={{ textTransform: 'capitalize' }}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Chip
                size="small"
                variant="outlined"
                label={`${gridRows.length} shown`}
              />
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
          )}
        </Stack>
      </Stack>

      {locked ? (
        <Alert severity="warning" icon={<LockIcon />} sx={{ mb: 1.5 }}>
          Editing is locked. Unlock to change {inventoryTab ? 'In scope and Sequence' : 'Mastery'}.
          Changes are saved only when you click Save.
        </Alert>
      ) : inventoryTab ? (
        <Alert severity="info" icon={<SaveIcon />} sx={{ mb: 1.5 }}>
          The In scope column is the bulk control: click to toggle, shift-click to fill a range, or use
          the header checkbox / Visible in-out for every concept currently shown. Filters apply. All in
          / All out and Level change the whole catalog. Save before leaving this tab or switching
          students.
        </Alert>
      ) : (
        <Alert severity="info" icon={<SaveIcon />} sx={{ mb: 1.5 }}>
          Click a Mastery chip to cycle unknown → new → review → mastered. Shift-click to fill a
          range of the rows currently shown. This tab stays on in-scope concepts unless you turn
          that filter off. Inventory is where you decide what is in scope. Save before leaving.
        </Alert>
      )}

      <Box sx={{ flex: 1, width: '100%' }}>
        <DataGridPro
          key={`${student.id}-${subTab}`}
          apiRef={gridApiRef}
          rows={gridRows}
          columns={columns}
          getRowId={(row) => row.conceptId}
          getRowClassName={(params) => {
            if (inventoryTab) return ''
            const status = MASTERY_STATUSES.includes(params.row.masteryStatus)
              ? params.row.masteryStatus
              : 'unknown'
            return `mastery-row-${status}`
          }}
          disableRowSelectionOnClick
          hideFooterSelectedRowCount
          pagination
          sortingMode="client"
          filterMode="client"
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 50 } },
            sorting: {
              sortModel: inventoryTab
                ? [
                    { field: 'inScope', sort: 'asc' },
                    { field: 'sequence', sort: 'asc' },
                    { field: 'level', sort: 'asc' },
                  ]
                : [
                    { field: 'masteryStatus', sort: 'asc' },
                    { field: 'sequence', sort: 'asc' },
                    { field: 'concept', sort: 'asc' },
                  ],
            },
          }}
          isCellEditable={(params) =>
            !locked && inventoryTab && params.field === 'sequence'
          }
          onFilterModelChange={bumpVisible}
          onSortModelChange={bumpVisible}
          onPaginationModelChange={bumpVisible}
          onCellClick={(params, event) => {
            if (inventoryTab && params.field === 'inScope') {
              event.defaultMuiPrevented = true
              if (locked) return
              toggleInScopeRange(params.row, !params.row.inScope, event.shiftKey)
              return
            }
            if (!inventoryTab && params.field === 'masteryStatus') {
              event.defaultMuiPrevented = true
              if (locked) return
              cycleMasteryRange(params.row, event.shiftKey)
            }
          }}
          onCellDoubleClick={(params, event) => {
            if (params.field === 'inScope' || params.field === 'masteryStatus') {
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
              px: inventoryTab ? 0 : 1,
              cursor: inventoryTab && !locked ? 'pointer' : 'default',
            },
            '& .MuiDataGrid-cell[data-field="masteryStatus"]': {
              cursor: !inventoryTab && !locked ? 'pointer' : 'default',
            },
            ...(inventoryTab ? null : masteryRowSx),
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
