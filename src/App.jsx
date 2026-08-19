import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { generateClient } from 'aws-amplify/data'
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  CircularProgress,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  createTheme,
} from '@mui/material'
import { DataGridPro, GridToolbar, useGridApiRef } from '@mui/x-data-grid-pro'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import LockIcon from '@mui/icons-material/Lock'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import GroupsIcon from '@mui/icons-material/Groups'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SaveIcon from '@mui/icons-material/Save'
import LessonPlanPanel from './components/LessonPlanPanel'
import DataPanel from './components/DataPanel'
import ContentPanel from './components/ContentPanel'
import ConceptsCatalogPanel from './components/ConceptsCatalogPanel'
import GroupPanel from './components/GroupPanel'
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog'
import { fetchStudentLists } from './lib/fetchStudentLessonPlan'
import { deleteInstructorGroup, fetchInstructorGroups, saveInstructorGroup } from './lib/groups'
import { deleteStudentCascade, updateStudent } from './lib/crudRecords'
import { downloadCsvTable, downloadXlsxTable, sanitizeFileStem } from './lib/exportTable'

const client = generateClient()
const DRAWER_WIDTH = 300
const TAB_LESSON_PLAN = 0
const TAB_SCOPE = 1
const TAB_CONCEPTS = 2
const TAB_CONTENT = 3
const TAB_DATA = 4
const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']

/** Sequential teal: unknown (lightest) → mastered (darkest). */
const MASTERY_ROW_COLORS = {
  unknown: { bg: '#eef6f8', hover: '#e2f0f3', color: '#1a2a2e' },
  new: { bg: '#c5dce1', hover: '#b4d2d8', color: '#1a2a2e' },
  review: { bg: '#7aadb8', hover: '#689faa', color: '#102428' },
  mastered: { bg: '#0f4c5c', hover: '#0c3e4b', color: '#ffffff' },
}

const masteryRowSx = Object.fromEntries(
  Object.entries(MASTERY_ROW_COLORS).flatMap(([status, { bg, hover, color }]) => [
    [
      `& .mastery-row-${status}`,
      {
        bgcolor: bg,
        color,
        '& .MuiCheckbox-root': { color },
        '& .MuiDataGrid-cell': { color },
      },
    ],
    [`& .mastery-row-${status}:hover`, { bgcolor: hover }],
  ]),
)

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0f4c5c' },
    secondary: { main: '#e36414' },
    background: { default: '#f4f6f8', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 650 },
  },
  shape: { borderRadius: 10 },
})

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

function normalizeLastInitial(value) {
  const raw = String(value ?? '')
  const letter = raw.match(/[\p{L}]/u)?.[0] ?? raw.trim().slice(0, 1)
  return letter ? letter.toUpperCase() : ''
}

function emptyScopeSelection() {
  return { type: 'include', ids: new Set() }
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
    }
  }, [locked])

  useEffect(() => {
    draftRef.current = null
    setDraftInventory(null)
    setScopeSelection(emptyScopeSelection())
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
    const target = String(level)
    setDraft((base) =>
      base.map((entry) => {
        const concept = concepts.find((item) => item.id === entry.conceptId)
        const isTargetLevel = String(concept?.level ?? '') === target
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
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6">Scope and Sequence</Typography>
          <Chip size="small" label={studentDisplayName(student)} />
          <Chip size="small" variant="outlined" label={`${rows.length} concepts`} />
          {saving ? <Chip size="small" color="primary" label="Saving…" /> : null}
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
          spacing={1.25}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ ml: { xs: 0, md: 'auto' }, flexShrink: 0 }}
        >
          <FormLabel sx={{ fontWeight: 600, m: 0 }}>Download</FormLabel>
          <ButtonGroup variant="outlined" color="inherit" disabled={!rows.length}>
            <Button startIcon={<FileDownloadIcon />} onClick={() => exportScopeTable('csv')}>
              CSV
            </Button>
            <Button onClick={() => exportScopeTable('xlsx')}>XLSX</Button>
          </ButtonGroup>
          <FormLabel sx={{ fontWeight: 600, m: 0 }}>In scope</FormLabel>
          <ButtonGroup variant="outlined" color="inherit" disabled={locked || saving}>
            <Button
              onClick={() => applyInScopeToSelected(true)}
              disabled={locked || saving || !selectedScopeRows.length}
            >
              Select in scope
            </Button>
            <Button
              onClick={() => applyInScopeToSelected(false)}
              disabled={locked || saving || !selectedScopeRows.length}
            >
              Unselect in scope
            </Button>
          </ButtonGroup>
          <Chip
            size="small"
            variant="outlined"
            label={`${selectedScopeRows.length} selected`}
          />
          <FormLabel sx={{ fontWeight: 600, m: 0 }}>Scope Presets</FormLabel>
          <ButtonGroup variant="outlined" color="inherit" disabled={locked || saving}>
            <Button onClick={() => applyLevelPreset(1)}>Level 1</Button>
            <Button onClick={() => applyLevelPreset(2)}>Level 2</Button>
            <Button onClick={() => applyLevelPreset(3)}>Level 3</Button>
            <Button startIcon={<RestartAltIcon />} onClick={() => setResetConfirmOpen(true)}>
              Reset to unknown
            </Button>
          </ButtonGroup>
        </Stack>
      </Stack>

      {locked ? (
        <Alert severity="warning" icon={<LockIcon />} sx={{ mb: 1.5 }}>
          Editing is locked. Unlock to change In scope, Sequence, Mastery status, or use Scope
          Presets. Changes are saved only when you click Save.
        </Alert>
      ) : (
        <Alert severity="info" icon={<SaveIcon />} sx={{ mb: 1.5 }}>
          Editing mode: changes stay on this page until you click Save. Click In scope once to
          toggle, or select rows and use Select in scope / Unselect in scope. Save before leaving
          this tab or switching students.
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
  const scopeSaveRef = useRef(null)

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
      setSelectedStudentId((current) => current ?? items[0]?.id ?? null)
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
    action()
  }

  function handleSelectStudent(studentId) {
    if (studentId === selectedStudentId && !creatingGroup && !selectedGroupId) return
    requestNavigation(() => {
      setSelectedStudentId(studentId)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setScopeLocked(true)
    })
  }

  function handleSelectGroup(groupId) {
    if (groupId === selectedGroupId && !creatingGroup) return
    requestNavigation(() => {
      setSelectedGroupId(groupId)
      setSelectedStudentId(null)
      setCreatingGroup(false)
      setScopeLocked(true)
    })
  }

  function handleStartCreateGroup() {
    requestNavigation(() => {
      setCreatingGroup(true)
      setSelectedGroupId(null)
      setSelectedStudentId(null)
      setScopeLocked(true)
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
      <CssBaseline />
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.primary',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            InterventionReadyOG
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
            {catalogStatus}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user?.signInDetails?.loginId ?? user?.username}
          </Typography>
          <Button startIcon={<LogoutIcon />} onClick={signOut} color="inherit">
            Sign out
          </Button>
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
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1">Students</Typography>
          <IconButton
            color="primary"
            size="small"
            aria-label="Add student"
            onClick={openCreateStudent}
          >
            <AddIcon />
          </IconButton>
        </Box>
        <Divider />
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
          <List dense sx={{ overflow: 'auto', flex: '1 1 50%' }}>
            {students.map((student) => {
              const name = studentDisplayName(student)
              return (
                <ListItem
                  key={student.id}
                  disablePadding
                  secondaryAction={
                    <Tooltip title={`Delete ${name}`}>
                      <IconButton
                        edge="end"
                        size="small"
                        aria-label={`Delete ${name}`}
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
                    selected={!creatingGroup && !selectedGroupId && student.id === selectedStudentId}
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
        <Divider />
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1">Groups</Typography>
          <IconButton
            color="primary"
            size="small"
            aria-label="Add group"
            onClick={handleStartCreateGroup}
          >
            <AddIcon />
          </IconButton>
        </Box>
        <Divider />
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
          <List dense sx={{ overflow: 'auto', flex: '1 1 50%' }}>
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
                    selected={!creatingGroup && group.id === selectedGroupId}
                    onClick={() => handleSelectGroup(group.id)}
                  >
                    <GroupsIcon fontSize="small" sx={{ mr: 1.25, color: 'text.secondary' }} />
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
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {error ? (
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff4f0' }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        ) : null}

        {!selectedStudent && !creatingGroup && !selectedGroup ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Select a student, choose a group, or click Groups + to create one.
            </Typography>
          </Paper>
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
              <Tab label="Concepts" />
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
                setError={setError}
                students={students}
                groups={groups}
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
            ) : mainTab === TAB_CONCEPTS ? (
              <ConceptsCatalogPanel
                concepts={concepts}
                wordsByConceptId={wordsByConceptId}
                loadingCatalog={loadingCatalog}
                setError={setError}
                onConceptUpdated={handleConceptUpdated}
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
  return (
    <ThemeProvider theme={theme}>
      <Authenticator loginMechanisms={['email']}>
        {({ signOut, user }) => <AppShell user={user} signOut={signOut} />}
      </Authenticator>
    </ThemeProvider>
  )
}
