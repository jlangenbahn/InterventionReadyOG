import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from 'react'
import { Authenticator, ThemeProvider as AmplifyThemeProvider } from '@aws-amplify/ui-react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar, useGridApiRef } from '@mui/x-data-grid-pro'
import AddIcon from '@mui/icons-material/Add'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import LockIcon from '@mui/icons-material/Lock'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import Groups3Icon from '@mui/icons-material/Groups3'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SaveIcon from '@mui/icons-material/Save'
import LessonPlanPanel from './components/LessonPlanPanel'
import DataPanel from './components/DataPanel'
import ContentPanel from './components/ContentPanel'
import GroupPanel from './components/GroupPanel'
import SchedulePanel from './components/SchedulePanel'
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog'
import { fetchStudentLists } from './lib/fetchStudentLessonPlan'
import { client } from './lib/amplifyClient'
import { deleteInstructorGroup, fetchInstructorGroups, saveInstructorGroup } from './lib/groups'
import { deleteStudentCascade, updateStudent } from './lib/crudRecords'
import { downloadCsvTable, downloadXlsxTable, sanitizeFileStem } from './lib/exportTable'
import { amplifyTheme, BRAND, createAppTheme, masteryRowSx } from './theme'
import readyOgLogo from './assets/readyog-logo.png'

const DRAWER_WIDTH = 300
const HEADER_BRAND_SIZE = 48
const TAB_LESSON_PLAN = 0
const TAB_SCOPE = 1
const TAB_CONTENT = 2
const TAB_DATA = 3
const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']
const COLOR_MODE_KEY = 'readyog-color-mode'

const ColorModeContext = createContext({
  mode: 'light',
  toggleColorMode: () => {},
})

function readStoredColorMode() {
  try {
    const stored = window.localStorage.getItem(COLOR_MODE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Private mode or blocked storage.
  }
  return 'light'
}

function ColorModeToggle({ color = 'inherit' }) {
  const { mode, toggleColorMode } = useContext(ColorModeContext)
  const dark = mode === 'dark'
  return (
    <Tooltip title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        color={color}
        onClick={toggleColorMode}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  )
}


const scopeColumnDefs = (locked) => [
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

function inventoryToRows(concepts, inventory) {
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

function buildScopeExportTable(rowModels) {
  const columns = scopeColumnDefs(true)
  return {
    headers: columns.map((col) => col.headerName),
    rows: rowModels.map((row) => columns.map((col) => formatScopeExportValue(col.field, row[col.field]))),
  }
}

async function listAll(model, options = {}) {
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await model.list({
      limit: 1000,
      nextToken,
      ...options,
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join(', '))
    }
    items.push(...(data ?? []))
    nextToken = token
  } while (nextToken)
  return items
}

function buildWordsByConceptId(conceptWords, wordsById) {
  const map = new Map()
  for (const link of conceptWords) {
    const word = wordsById.get(link.wordId)
    if (!word || !link.conceptId || !link.id) continue
    const row = {
      ...word,
      wordId: word.id,
      conceptWordId: link.id,
      conceptId: link.conceptId,
    }
    const bucket = map.get(link.conceptId)
    if (bucket) bucket.push(row)
    else map.set(link.conceptId, [row])
  }
  for (const [, list] of map) {
    list.sort((a, b) => String(a.word ?? '').localeCompare(String(b.word ?? '')))
  }
  return map
}

function normalizeSequence(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(999, Math.floor(Math.abs(n)))
}

function normalizeScopeEntry(entry) {
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
function buildScopeAndSequence(concepts, existing) {
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

function parseScopeAndSequence(value) {
  let current = value
  // Amplify AWSJSON may arrive as an array or as a (sometimes double-encoded) string.
  for (let i = 0; i < 3; i += 1) {
    if (Array.isArray(current)) return current
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed) return []
    try {
      current = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  return Array.isArray(current) ? current : []
}

/** AWSJSON fields must be sent as JSON strings to AppSync. */
function serializeScopeAndSequence(inventory) {
  return JSON.stringify(inventory)
}

function studentDisplayName(student) {
  return (
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unnamed student'
  )
}

function studentNavDisplayName(student) {
  const first = String(student?.firstName ?? '').trim()
  const last = String(student?.lastName ?? '').trim()
  if (last && first) return `${last}, ${first}`
  return first || last || 'Unnamed student'
}

function normalizeLastInitial(value) {
  const raw = String(value ?? '')
  const letter = raw.match(/[\p{L}]/u)?.[0] ?? raw.trim().slice(0, 1)
  return letter ? letter.toUpperCase() : ''
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

function ScopeAndSequencePanel({
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
      const table = buildScopeExportTable(collectExportRows())
      if (format === 'xlsx') {
        downloadXlsxTable(`${exportFileStem}.xlsx`, table.headers, table.rows, 'Scope and Sequence')
        return
      }
      downloadCsvTable(`${exportFileStem}.csv`, table.headers, table.rows)
    },
    [collectExportRows, exportFileStem],
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

function NavSectionHeader({
  title,
  expanded = true,
  onToggleExpand,
  onAdd,
  addLabel,
  selected = false,
  onSelect,
  icon = null,
}) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        bgcolor: selected ? 'action.selected' : 'transparent',
      }}
    >
      <IconButton
        size="small"
        aria-label={
          onToggleExpand
            ? expanded
              ? `Collapse ${title}`
              : `Expand ${title}`
            : `Open ${title}`
        }
        onClick={onToggleExpand ?? onSelect}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 120ms',
          }}
        />
      </IconButton>
      <Box
        onClick={onSelect ?? onToggleExpand}
        sx={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          minWidth: 0,
          cursor: onSelect || onToggleExpand ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {icon}
        <Typography variant="subtitle1" sx={{ py: 0.5 }}>
          {title}
        </Typography>
      </Box>
      {onAdd ? (
        <IconButton color="primary" size="small" aria-label={addLabel} onClick={onAdd}>
          <AddIcon />
        </IconButton>
      ) : null}
    </Box>
  )
}

function AppShell({ user, signOut }) {
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [mainTab, setMainTab] = useState(0)
  const [concepts, setConcepts] = useState([])
  const [wordsByConceptId, setWordsByConceptId] = useState(() => new Map())
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogStatus, setCatalogStatus] = useState('Loading concept/word catalog…')
  const [error, setError] = useState('')
  const [studentLists, setStudentLists] = useState([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState(null)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [studentDialogOpen, setStudentDialogOpen] = useState(false)
  const [studentFormMode, setStudentFormMode] = useState('create')
  const [studentForm, setStudentForm] = useState({
    firstName: '',
    lastName: '',
    customID: '',
    comments: '',
  })
  const [savingStudent, setSavingStudent] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState(null)
  const [deletingStudent, setDeletingStudent] = useState(false)
  const [scopeLocked, setScopeLocked] = useState(true)
  const [navBlock, setNavBlock] = useState(null)
  const [viewingSchedule, setViewingSchedule] = useState(true)
  const [studentsNavOpen, setStudentsNavOpen] = useState(true)
  const [groupsNavOpen, setGroupsNavOpen] = useState(true)
  const [scheduleCreateNonce, setScheduleCreateNonce] = useState(0)
  const [openLessonId, setOpenLessonId] = useState(null)
  const scopeSaveRef = useRef(null)
  const lessonLeaveGuardRef = useRef(null)

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  )

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  )

  const handleScopeUpdated = useCallback((updatedStudent) => {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === updatedStudent.id ? { ...student, ...updatedStudent } : student,
      ),
    )
  }, [])

  const handleConceptUpdated = useCallback((updatedConcept) => {
    if (!updatedConcept?.id) return
    setConcepts((prev) =>
      [...prev.map((concept) =>
        concept.id === updatedConcept.id ? { ...concept, ...updatedConcept } : concept,
      )].sort((a, b) => String(a.concept ?? '').localeCompare(String(b.concept ?? ''))),
    )
  }, [])

  const loadStudents = useCallback(async () => {
    setLoadingStudents(true)
    try {
      const items = await listAll(client.models.Student)
      items.sort((a, b) =>
        `${a.lastName ?? ''} ${a.firstName ?? ''}`.localeCompare(
          `${b.lastName ?? ''} ${b.firstName ?? ''}`,
        ),
      )
      setStudents(items)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students')
    } finally {
      setLoadingStudents(false)
    }
  }, [])

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true)
    setCatalogStatus('Loading concepts, words, and mappings…')
    try {
      const [conceptItems, wordItems, linkItems] = await Promise.all([
        listAll(client.models.Concept),
        listAll(client.models.Word, {
          selectionSet: ['id', 'word', 'isNonsenseWord'],
        }),
        listAll(client.models.ConceptWord, {
          selectionSet: ['id', 'conceptId', 'wordId'],
        }),
      ])

      conceptItems.sort((a, b) =>
        String(a.concept ?? '').localeCompare(String(b.concept ?? '')),
      )
      const wordsById = new Map(wordItems.map((w) => [w.id, w]))
      const indexed = buildWordsByConceptId(linkItems, wordsById)

      setConcepts(conceptItems)
      setWordsByConceptId(indexed)
      setCatalogStatus(
        `${conceptItems.length} concepts · ${wordItems.length} words · ${linkItems.length} mappings`,
      )
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog')
      setCatalogStatus('Catalog failed to load')
    } finally {
      setLoadingCatalog(false)
    }
  }, [])

  useEffect(() => {
    loadStudents()
    loadCatalog()
  }, [loadStudents, loadCatalog])

  const loadStudentLists = useCallback(async () => {
    if (!selectedStudentId) {
      setStudentLists([])
      return
    }
    setLoadingLists(true)
    try {
      const items = await fetchStudentLists(selectedStudentId)
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      setStudentLists(items)
      setError('')
    } catch (err) {
      setStudentLists([])
      setError(err instanceof Error ? err.message : 'Failed to load lists')
    } finally {
      setLoadingLists(false)
    }
  }, [selectedStudentId])

  useEffect(() => {
    void loadStudentLists()
  }, [loadStudentLists])

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const items = await fetchInstructorGroups()
      setGroups(items)
    } catch (err) {
      setGroups([])
      setError(err instanceof Error ? err.message : 'Failed to load groups')
    } finally {
      setLoadingGroups(false)
    }
  }, [setError])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    setScopeLocked(true)
  }, [selectedStudentId])

  function requestNavigation(action) {
    if (!scopeLocked && mainTab === TAB_SCOPE) {
      // Wrap so React does not treat the callback as a state updater.
      setNavBlock({ action })
      return
    }
    if (lessonLeaveGuardRef.current?.isDirty?.()) {
      lessonLeaveGuardRef.current.requestLeave(action)
      return
    }
    action()
  }

  function handleSelectStudent(studentId) {
    if (studentId === selectedStudentId && !creatingGroup && !selectedGroupId && !viewingSchedule) return
    requestNavigation(() => {
      setSelectedStudentId(studentId)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setViewingSchedule(false)
      setOpenLessonId(null)
      setScopeLocked(true)
    })
  }

  function handleSelectGroup(groupId) {
    if (groupId === selectedGroupId && !creatingGroup && !viewingSchedule) return
    requestNavigation(() => {
      setSelectedGroupId(groupId)
      setSelectedStudentId(null)
      setCreatingGroup(false)
      setViewingSchedule(false)
      setScopeLocked(true)
    })
  }

  function handleStartCreateGroup() {
    requestNavigation(() => {
      setCreatingGroup(true)
      setSelectedGroupId(null)
      setSelectedStudentId(null)
      setViewingSchedule(false)
      setScopeLocked(true)
    })
  }

  function handleSelectSchedule() {
    if (viewingSchedule) return
    requestNavigation(() => {
      setViewingSchedule(true)
      setSelectedStudentId(null)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setScopeLocked(true)
    })
  }

  function handleStartCreateScheduledLesson() {
    requestNavigation(() => {
      setViewingSchedule(true)
      setSelectedStudentId(null)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setScopeLocked(true)
      setScheduleCreateNonce((current) => current + 1)
    })
  }

  async function handleSaveGroup(payload) {
    setSavingGroup(true)
    try {
      const saved = await saveInstructorGroup(payload)
      const items = await fetchInstructorGroups()
      setGroups(items)
      setCreatingGroup(false)
      setSelectedGroupId(saved.id)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group')
    } finally {
      setSavingGroup(false)
    }
  }

  function handleMainTabChange(_event, value) {
    if (value === mainTab) return
    requestNavigation(() => {
      setMainTab(value)
      setScopeLocked(true)
    })
  }

  async function handleSaveAndContinue() {
    const action = navBlock?.action
    setNavBlock(null)
    const saved = (await scopeSaveRef.current?.()) ?? true
    if (!saved) return
    if (typeof action === 'function') action()
  }

  function emptyStudentForm() {
    return { firstName: '', lastName: '', customID: '', comments: '' }
  }

  function openCreateStudent() {
    setStudentFormMode('create')
    setStudentForm(emptyStudentForm())
    setStudentDialogOpen(true)
  }

  function openEditStudent() {
    if (!selectedStudent) return
    setStudentFormMode('edit')
    setStudentForm({
      firstName: selectedStudent.firstName || '',
      lastName: normalizeLastInitial(selectedStudent.lastName),
      customID: selectedStudent.customID || '',
      comments: selectedStudent.comments || '',
    })
    setStudentDialogOpen(true)
  }

  function askDeleteStudent(student) {
    if (!student?.id) return
    setStudentToDelete(student)
  }

  function askDeleteGroup(group) {
    if (!group?.id) return
    setGroupToDelete(group)
  }

  async function handleConfirmDeleteGroup() {
    const group = groupToDelete
    if (!group?.id) return
    setDeletingGroup(true)
    try {
      await deleteInstructorGroup(group.id)
      const remaining = groups.filter((item) => item.id !== group.id)
      setGroups(remaining)
      if (selectedGroupId === group.id) {
        const nextGroup = remaining[0] ?? null
        setSelectedGroupId(nextGroup?.id ?? null)
        setCreatingGroup(false)
        if (!nextGroup) setSelectedStudentId(students[0]?.id ?? null)
      }
      setGroupToDelete(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group')
    } finally {
      setDeletingGroup(false)
    }
  }

  async function handleSaveStudent(event) {
    event.preventDefault()
    if (!studentForm.firstName.trim() && !normalizeLastInitial(studentForm.lastName)) return
    setSavingStudent(true)
    try {
      const lastInitial = normalizeLastInitial(studentForm.lastName)
      if (studentFormMode === 'edit' && selectedStudent?.id) {
        const data = await updateStudent({
          id: selectedStudent.id,
          firstName: studentForm.firstName,
          lastName: lastInitial,
          customID: studentForm.customID,
          comments: studentForm.comments,
        })
        setStudents((prev) =>
          prev.map((student) =>
            student.id === data.id ? { ...student, ...data } : student,
          ),
        )
      } else {
        const inventory = concepts.length ? buildScopeAndSequence(concepts, []) : []
        const { data, errors } = await client.models.Student.create({
          firstName: studentForm.firstName.trim() || null,
          lastName: lastInitial || null,
          customID: studentForm.customID.trim() || null,
          comments: studentForm.comments.trim() || null,
          scopeAndSequence: inventory.length ? serializeScopeAndSequence(inventory) : null,
        })
        if (errors?.length) {
          throw new Error(errors.map((e) => e.message).join(', '))
        }
        await loadStudents()
        if (data?.id) {
          setSelectedStudentId(data.id)
          setSelectedGroupId(null)
          setCreatingGroup(false)
          setViewingSchedule(false)
          setScopeLocked(true)
        }
      }
      setStudentDialogOpen(false)
      setStudentForm(emptyStudentForm())
      setError('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : studentFormMode === 'edit'
            ? 'Failed to update student'
            : 'Failed to create student',
      )
    } finally {
      setSavingStudent(false)
    }
  }

  async function handleConfirmDeleteStudent() {
    const student = studentToDelete
    if (!student?.id) return
    setDeletingStudent(true)
    try {
      await deleteStudentCascade(student.id)
      const remaining = students.filter((item) => item.id !== student.id)
      setStudents(remaining)
      if (selectedStudentId === student.id) {
        setSelectedStudentId(remaining[0]?.id ?? null)
        setSelectedGroupId(null)
        setCreatingGroup(false)
        setScopeLocked(true)
      }
      setStudentToDelete(null)
      setError('')
      await loadGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete student')
    } finally {
      setDeletingStudent(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: '3px solid',
          borderColor: 'secondary.main',
          bgcolor: BRAND.navy,
          color: '#ffffff',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box
              component="img"
              src={readyOgLogo}
              alt=""
              sx={{
                height: HEADER_BRAND_SIZE,
                width: HEADER_BRAND_SIZE,
                flexShrink: 0,
                borderRadius: 1,
                objectFit: 'contain',
              }}
            />
            <Typography
              noWrap
              sx={{
                display: 'flex',
                alignItems: 'center',
                height: HEADER_BRAND_SIZE,
                fontSize: HEADER_BRAND_SIZE * 0.5,
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: '-0.03em',
              }}
            >
              ReadyOG!
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' }, color: 'secondary.main' }}>
            {catalogStatus}
          </Typography>
          <Typography variant="body2" sx={{ color: 'secondary.main' }}>
            {user?.signInDetails?.loginId ?? user?.username}
          </Typography>
          <Button startIcon={<LogoutIcon />} onClick={signOut} color="inherit">
            Sign out
          </Button>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          <NavSectionHeader
            title="Schedule"
            selected={viewingSchedule}
            onSelect={handleSelectSchedule}
            onAdd={handleStartCreateScheduledLesson}
            addLabel="Add scheduled lesson"
            icon={
              <CalendarMonthIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
            }
          />
          <Divider />
          <NavSectionHeader
            title="Students"
            expanded={studentsNavOpen}
            onToggleExpand={() => setStudentsNavOpen((open) => !open)}
            onAdd={openCreateStudent}
            addLabel="Add student"
            icon={<PersonIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />}
          />
          <Divider />
          <Collapse in={studentsNavOpen} timeout="auto" unmountOnExit={false}>
            {loadingStudents ? (
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : students.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No students yet. Click + to add your first student.
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {students.map((student) => {
                  const name = studentNavDisplayName(student)
                  const fullName = studentDisplayName(student)
                  return (
                    <ListItem
                      key={student.id}
                      disablePadding
                      secondaryAction={
                        <Tooltip title={`Delete ${fullName}`}>
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={`Delete ${fullName}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              askDeleteStudent(student)
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemButton
                        selected={
                          !creatingGroup &&
                          !selectedGroupId &&
                          !viewingSchedule &&
                          student.id === selectedStudentId
                        }
                        onClick={() => handleSelectStudent(student.id)}
                      >
                        <PersonIcon fontSize="small" sx={{ mr: 1.25, color: 'text.secondary' }} />
                        <ListItemText
                          primary={name}
                          secondary={student.customID ? `ID ${student.customID}` : null}
                        />
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </List>
            )}
          </Collapse>
          <Divider />
          <NavSectionHeader
            title="Groups"
            expanded={groupsNavOpen}
            onToggleExpand={() => setGroupsNavOpen((open) => !open)}
            onAdd={handleStartCreateGroup}
            addLabel="Add group"
            icon={<Groups3Icon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />}
          />
          <Divider />
          <Collapse in={groupsNavOpen} timeout="auto" unmountOnExit={false}>
            {loadingGroups ? (
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={22} />
              </Box>
            ) : groups.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No groups yet. Click + to bundle students.
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {groups.map((group) => {
                  const groupName = group.name || 'Untitled group'
                  return (
                    <ListItem
                      key={group.id}
                      disablePadding
                      secondaryAction={
                        <Tooltip title={`Delete ${groupName}`}>
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label={`Delete ${groupName}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              askDeleteGroup(group)
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemButton
                        selected={!creatingGroup && !viewingSchedule && group.id === selectedGroupId}
                        onClick={() => handleSelectGroup(group.id)}
                      >
                        <Groups3Icon fontSize="small" sx={{ mr: 1.25, color: 'text.secondary' }} />
                        <ListItemText
                          primary={groupName}
                          secondary={`${(group.studentIds ?? []).length} students`}
                        />
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </List>
            )}
          </Collapse>
        </Box>
      </Drawer>

      <Box component="main" sx={{
        flexGrow: 1,
        p: viewingSchedule ? 2 : 3,
        minWidth: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: viewingSchedule ? 'hidden' : 'auto',
      }}>
        <Toolbar />
        {error ? (
          <Paper sx={{ p: 2, mb: 2, bgcolor: 'secondary.light' }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        ) : null}

        {!selectedStudent && !creatingGroup && !selectedGroup && !viewingSchedule ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Select a student, choose a group, open Schedule, or click + to create one.
            </Typography>
          </Paper>
        ) : viewingSchedule ? (
          <SchedulePanel
            students={students}
            groups={groups}
            setError={setError}
            createNonce={scheduleCreateNonce}
            onOpenStudent={(studentId, lessonId) => {
              requestNavigation(() => {
                setViewingSchedule(false)
                setSelectedStudentId(studentId)
                setOpenLessonId(lessonId || null)
                setSelectedGroupId(null)
                setCreatingGroup(false)
                setMainTab(TAB_LESSON_PLAN)
                setScopeLocked(true)
              })
            }}
          />
        ) : creatingGroup || selectedGroup ? (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
              <Typography variant="h5">
                {creatingGroup ? 'New group' : selectedGroup?.name || 'Group'}
              </Typography>
              {!creatingGroup ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${(selectedGroup?.studentIds ?? []).length} students`}
                />
              ) : null}
              {!creatingGroup && selectedGroup ? (
                <>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={() => askDeleteGroup(selectedGroup)}
                  >
                    Delete
                  </Button>
                </>
              ) : null}
            </Stack>
            <GroupPanel
              group={creatingGroup ? null : selectedGroup}
              students={students}
              saving={savingGroup}
              setError={setError}
              onSave={(payload) => void handleSaveGroup(payload)}
            />
          </>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
              <Typography variant="h5">{studentDisplayName(selectedStudent)}</Typography>
              {selectedStudent.customID ? (
                <Chip size="small" label={`ID ${selectedStudent.customID}`} />
              ) : null}
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" startIcon={<EditIcon />} onClick={openEditStudent}>
                Edit
              </Button>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => askDeleteStudent(selectedStudent)}
              >
                Delete
              </Button>
            </Stack>

            <Tabs
              value={mainTab}
              onChange={handleMainTabChange}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Lesson Plan" />
              <Tab label="Scope & Sequence" />
              <Tab label="Content" />
              <Tab label="Data" />
            </Tabs>

            {mainTab === TAB_LESSON_PLAN ? (
              <LessonPlanPanel
                student={selectedStudent}
                concepts={concepts}
                studentLists={studentLists}
                loadingLists={loadingLists}
                wordsByConceptId={wordsByConceptId}
                loadingCatalog={loadingCatalog}
                onReloadLists={loadStudentLists}
                instructor={user?.signInDetails?.loginId ?? user?.username ?? ''}
                username={[
                  user?.username,
                  user?.userId,
                  user?.signInDetails?.loginId,
                ].filter(Boolean)}
                setError={setError}
                students={students}
                groups={groups}
                leaveGuardRef={lessonLeaveGuardRef}
                openLessonId={openLessonId}
              />
            ) : mainTab === TAB_SCOPE ? (
              <ScopeAndSequencePanel
                student={selectedStudent}
                concepts={concepts}
                loadingCatalog={loadingCatalog}
                onScopeUpdated={handleScopeUpdated}
                setError={setError}
                locked={scopeLocked}
                onLockedChange={setScopeLocked}
                saveRef={scopeSaveRef}
              />
            ) : mainTab === TAB_CONTENT ? (
              <ContentPanel
                student={selectedStudent}
                concepts={concepts}
                wordsByConceptId={wordsByConceptId}
                loadingCatalog={loadingCatalog}
                studentLists={studentLists}
                loadingLists={loadingLists}
                onReloadLists={loadStudentLists}
                setError={setError}
                onConceptUpdated={handleConceptUpdated}
              />
            ) : mainTab === TAB_DATA ? (
              <DataPanel
                student={selectedStudent}
                concepts={concepts}
                wordsByConceptId={wordsByConceptId}
                setError={setError}
              />
            ) : null}
          </>
        )}
      </Box>

      <Dialog open={studentDialogOpen} onClose={() => setStudentDialogOpen(false)} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={handleSaveStudent}>
          <DialogTitle>{studentFormMode === 'edit' ? 'Edit student' : 'Add student'}</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField
              label="First name"
              value={studentForm.firstName}
              onChange={(e) => setStudentForm((s) => ({ ...s, firstName: e.target.value }))}
              autoFocus
            />
            <TextField
              label="Last initial"
              value={studentForm.lastName}
              onChange={(e) =>
                setStudentForm((s) => ({ ...s, lastName: normalizeLastInitial(e.target.value) }))
              }
              inputProps={{ maxLength: 1, autoComplete: 'off' }}
              helperText="One letter only. Last names are not stored."
            />
            <TextField
              label="Custom ID"
              value={studentForm.customID}
              onChange={(e) => setStudentForm((s) => ({ ...s, customID: e.target.value }))}
            />
            <TextField
              label="Comments"
              value={studentForm.comments}
              onChange={(e) => setStudentForm((s) => ({ ...s, comments: e.target.value }))}
              multiline
              minRows={2}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStudentDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingStudent}>
              {savingStudent ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(studentToDelete)}
        title="Are you sure?"
        description={
          studentToDelete
            ? `Delete ${studentDisplayName(studentToDelete)}? This permanently removes this student and their lesson plans, word lists, sentences, and passages. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete student"
        deleting={deletingStudent}
        onClose={() => !deletingStudent && setStudentToDelete(null)}
        onConfirm={() => void handleConfirmDeleteStudent()}
      />

      <ConfirmDeleteDialog
        open={Boolean(groupToDelete)}
        title="Delete this group?"
        description={
          groupToDelete
            ? `Delete “${groupToDelete.name || 'Untitled group'}”? Students and their lesson plans stay. Only this group is removed.`
            : ''
        }
        confirmLabel="Delete group"
        deleting={deletingGroup}
        onClose={() => !deletingGroup && setGroupToDelete(null)}
        onConfirm={() => void handleConfirmDeleteGroup()}
      />

      <Dialog open={Boolean(navBlock)} onClose={() => setNavBlock(null)}>
        <DialogTitle>Save Scope and Sequence?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved Scope and Sequence edits. Save them before leaving this view, or stay
            and keep editing.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNavBlock(null)}>Stay</Button>
          <Button variant="contained" color="primary" onClick={() => void handleSaveAndContinue()} autoFocus>
            Save and continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default function App() {
  const [mode, setMode] = useState(readStoredColorMode)
  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((current) => {
          const next = current === 'dark' ? 'light' : 'dark'
          try {
            window.localStorage.setItem(COLOR_MODE_KEY, next)
          } catch {
            // Private mode or blocked storage.
          }
          return next
        })
      },
    }),
    [mode],
  )
  const muiTheme = useMemo(() => createAppTheme(mode), [mode])

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline enableColorScheme />
        <AmplifyThemeProvider theme={amplifyTheme} colorMode={mode}>
          <Authenticator
            loginMechanisms={['email']}
            components={{
              Header() {
                return (
                  <Box sx={{ position: 'fixed', top: 8, right: 8, zIndex: 1300 }}>
                    <ColorModeToggle color="primary" />
                  </Box>
                )
              },
            }}
          >
            {({ signOut, user }) => <AppShell user={user} signOut={signOut} />}
          </Authenticator>
        </AmplifyThemeProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}
