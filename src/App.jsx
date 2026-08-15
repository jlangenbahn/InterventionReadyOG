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
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import AddIcon from '@mui/icons-material/Add'
import LockIcon from '@mui/icons-material/Lock'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SaveIcon from '@mui/icons-material/Save'
import SearchIcon from '@mui/icons-material/Search'
import LessonPlanPanel from './components/LessonPlanPanel'
import DataEntryPanel from './components/DataEntryPanel'
import { fetchStudentLists } from './lib/fetchStudentLessonPlan'

const client = generateClient()
const DRAWER_WIDTH = 300
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

const wordColumns = [
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
  {
    field: 'isNonsenseWord',
    headerName: 'Nonsense',
    width: 100,
    type: 'boolean',
  },
]

const myListColumns = [
  { field: 'name', headerName: 'List', flex: 1.2, minWidth: 110 },
  { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 110 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 80,
    align: 'left',
    headerAlign: 'left',
  },
]

function emptyWordSelection() {
  return { type: 'include', ids: new Set() }
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

function parseListData(value) {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    if (current && typeof current === 'object' && !Array.isArray(current)) return current
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed) return {}
    try {
      current = JSON.parse(trimmed)
    } catch {
      return {}
    }
  }
  return current && typeof current === 'object' && !Array.isArray(current) ? current : {}
}

function listWordCount(list) {
  const data = parseListData(list?.listData)
  if (Array.isArray(data.conceptWordIds)) return data.conceptWordIds.length
  if (Array.isArray(data.wordIds)) return data.wordIds.length
  if (Array.isArray(list?.words)) return list.words.length
  return 0
}

function wordRowId(row) {
  return row?.conceptWordId || row?.id
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

function ConceptsWordsPanel({
  student,
  concepts,
  selectedConceptId,
  setSelectedConceptId,
  conceptQuery,
  setConceptQuery,
  wordsByConceptId,
  loadingCatalog,
  studentLists = [],
  loadingLists = false,
  onReloadLists,
  setError,
}) {
  const [wordSelection, setWordSelection] = useState(emptyWordSelection)
  const [createListOpen, setCreateListOpen] = useState(false)
  const [listName, setListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const selectedConcept = useMemo(
    () => concepts.find((c) => c.id === selectedConceptId) ?? null,
    [concepts, selectedConceptId],
  )

  const filteredConcepts = useMemo(() => {
    const q = conceptQuery.trim().toLowerCase()
    if (!q) return concepts
    return concepts.filter((item) =>
      [item.concept, item.category, item.subcategory, item.level]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [concepts, conceptQuery])

  const selectedWords = useMemo(() => {
    if (!selectedConceptId) return []
    const words = wordsByConceptId.get(selectedConceptId)
    return words ? words.slice() : []
  }, [wordsByConceptId, selectedConceptId])

  const selectedWordRows = useMemo(() => {
    const ids = wordSelection?.ids
    if (!ids?.size) {
      return wordSelection?.type === 'exclude' ? selectedWords : []
    }
    if (wordSelection.type === 'exclude') {
      return selectedWords.filter((row) => !ids.has(wordRowId(row)))
    }
    return selectedWords.filter((row) => ids.has(wordRowId(row)))
  }, [wordSelection, selectedWords])

  const conceptById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept])),
    [concepts],
  )

  const myListRows = useMemo(
    () =>
      studentLists.map((list) => ({
        id: list.id,
        name: list.name || 'Untitled list',
        concept: conceptById.get(list.conceptID)?.concept || 'Unknown concept',
        wordCount: listWordCount(list),
      })),
    [studentLists, conceptById],
  )

  const loadLists = useCallback(async () => {
    if (onReloadLists) await onReloadLists()
  }, [onReloadLists])

  useEffect(() => {
    setWordSelection(emptyWordSelection())
    setCreateListOpen(false)
  }, [selectedConceptId])

  function openCreateList() {
    if (!selectedConcept || selectedWordRows.length === 0) return
    setListName(selectedConcept.concept || '')
    setCreateListOpen(true)
  }

  async function handleCreateList(event) {
    event.preventDefault()
    const name = listName.trim()
    if (!student?.id || !selectedConcept || !name || selectedWordRows.length === 0) return

    setCreatingList(true)
    try {
      const conceptWordIds = selectedWordRows.map((row) => row.conceptWordId).filter(Boolean)
      const wordIds = selectedWordRows.map((row) => row.wordId || row.id).filter(Boolean)
      const { data, errors } = await client.models.List.create({
        name,
        conceptID: selectedConcept.id,
        studentID: student.id,
        listData: JSON.stringify({
          conceptId: selectedConcept.id,
          conceptWordIds,
          wordIds,
        }),
      })
      if (errors?.length) throw new Error(errors.map((e) => e.message).join(', '))
      if (!data?.id) throw new Error('Failed to create list')

      const linkResults = await Promise.all(
        wordIds.map((wordId) => client.models.WordList.create({ wordId, listId: data.id })),
      )
      const linkErrors = linkResults.flatMap((result) => result.errors ?? [])
      if (linkErrors.length) throw new Error(linkErrors.map((e) => e.message).join(', '))

      setError('')
      setCreateListOpen(false)
      setWordSelection(emptyWordSelection())
      await loadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setCreatingList(false)
    }
  }

  const panelSx = {
    minWidth: 0,
    minHeight: { xs: 320, lg: 0 },
    p: 2,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' },
          gap: 2,
          height: { lg: 'calc(100vh - 220px)' },
          minHeight: 480,
          alignItems: 'stretch',
        }}
      >
        <Paper sx={panelSx}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Concepts
          </Typography>
          <TextField
            size="small"
            placeholder="Filter concepts…"
            value={conceptQuery}
            onChange={(e) => setConceptQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
              ),
            }}
            sx={{ mb: 1.5 }}
          />
          {loadingCatalog ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <List dense sx={{ overflow: 'auto', flex: 1 }}>
              {filteredConcepts.map((concept) => {
                const count = wordsByConceptId.get(concept.id)?.length ?? 0
                return (
                  <ListItemButton
                    key={concept.id}
                    selected={concept.id === selectedConceptId}
                    onClick={() => setSelectedConceptId(concept.id)}
                  >
                    <ListItemText
                      primary={concept.concept}
                      secondary={[
                        concept.level && `Level ${concept.level}`,
                        concept.category,
                        `${count} words`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </ListItemButton>
                )
              })}
            </List>
          )}
        </Paper>

        <Paper sx={panelSx}>
          {!selectedConcept ? (
            <Typography color="text.secondary">Select a concept to see tagged words.</Typography>
          ) : (
            <>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                  {selectedConcept.concept}
                </Typography>
                {selectedConcept.subcategory ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {selectedConcept.subcategory}
                  </Typography>
                ) : null}
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1 }}
                  flexWrap="wrap"
                  useFlexGap
                >
                  {selectedConcept.level ? (
                    <Chip size="small" label={`Level ${selectedConcept.level}`} />
                  ) : null}
                  {selectedConcept.category ? (
                    <Chip size="small" variant="outlined" label={selectedConcept.category} />
                  ) : null}
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    label={`${selectedWords.length} words`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${selectedWordRows.length} selected`}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<PlaylistAddIcon />}
                    disabled={selectedWordRows.length === 0 || creatingList}
                    onClick={openCreateList}
                    sx={{ ml: 'auto' }}
                  >
                    Create list
                  </Button>
                </Stack>
              </Box>

              <Box sx={{ flex: 1, minHeight: 240, width: '100%' }}>
                <DataGridPro
                  key={selectedConceptId}
                  rows={selectedWords}
                  columns={wordColumns}
                  getRowId={wordRowId}
                  checkboxSelection
                  disableRowSelectionExcludeModel
                  disableRowSelectionOnClick
                  hideFooterSelectedRowCount
                  rowSelectionModel={wordSelection}
                  onRowSelectionModelChange={(model) => setWordSelection(model)}
                  pagination
                  pageSizeOptions={[25, 50, 100]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 50 } },
                  }}
                  slots={{ toolbar: GridToolbar }}
                  slotProps={{
                    toolbar: { showQuickFilter: true },
                  }}
                  density="compact"
                />
              </Box>
            </>
          )}
        </Paper>

        <Paper sx={panelSx}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
            <Typography variant="h6">My Lists</Typography>
            <Chip size="small" variant="outlined" label={`${myListRows.length} lists`} />
            {loadingLists ? <CircularProgress size={16} /> : null}
          </Stack>
          <Box sx={{ flex: 1, minHeight: 240, width: '100%' }}>
            <DataGridPro
              rows={myListRows}
              columns={myListColumns}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
              pagination
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: { showQuickFilter: true },
              }}
              density="compact"
              localeText={{
                noRowsLabel: 'No lists yet. Select words and click Create list.',
              }}
            />
          </Box>
        </Paper>
      </Box>

      <Dialog open={createListOpen} onClose={() => !creatingList && setCreateListOpen(false)} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={handleCreateList}>
          <DialogTitle>Create list</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <DialogContentText>
              Save {selectedWordRows.length} word
              {selectedWordRows.length === 1 ? '' : 's'} under {selectedConcept?.concept || 'this concept'} for{' '}
              {studentDisplayName(student)}. The list will store this concept and the selected
              concept-word links.
            </DialogContentText>
            <TextField
              label="List name"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              autoFocus
              required
              disabled={creatingList}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateListOpen(false)} disabled={creatingList}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="success" disabled={creatingList || !listName.trim()}>
              {creatingList ? 'Creating…' : 'Create list'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
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
    }
  }, [locked])

  useEffect(() => {
    draftRef.current = null
    setDraftInventory(null)
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

  const columns = useMemo(() => scopeColumnDefs(locked), [locked])

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
          toggle. Save before leaving this tab or switching students.
        </Alert>
      )}

      <Box sx={{ flex: 1, width: '100%' }}>
        <DataGridPro
          key={student.id}
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
  const [selectedConceptId, setSelectedConceptId] = useState(null)
  const [wordsByConceptId, setWordsByConceptId] = useState(() => new Map())
  const [conceptQuery, setConceptQuery] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogStatus, setCatalogStatus] = useState('Loading concept/word catalog…')
  const [error, setError] = useState('')
  const [studentLists, setStudentLists] = useState([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [studentDialogOpen, setStudentDialogOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    customID: '',
    comments: '',
  })
  const [savingStudent, setSavingStudent] = useState(false)
  const [scopeLocked, setScopeLocked] = useState(true)
  const [navBlock, setNavBlock] = useState(null)
  const scopeSaveRef = useRef(null)

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  )

  const handleScopeUpdated = useCallback((updatedStudent) => {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === updatedStudent.id ? { ...student, ...updatedStudent } : student,
      ),
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

  useEffect(() => {
    setScopeLocked(true)
  }, [selectedStudentId])

  function requestNavigation(action) {
    if (!scopeLocked && mainTab === 0) {
      // Wrap so React does not treat the callback as a state updater.
      setNavBlock({ action })
      return
    }
    action()
  }

  function handleSelectStudent(studentId) {
    if (studentId === selectedStudentId) return
    requestNavigation(() => {
      setSelectedStudentId(studentId)
      setMainTab(0)
      setSelectedConceptId(null)
      setScopeLocked(true)
    })
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

  async function handleCreateStudent(event) {
    event.preventDefault()
    if (!newStudent.firstName.trim() && !newStudent.lastName.trim()) return
    setSavingStudent(true)
    try {
      const inventory = concepts.length ? buildScopeAndSequence(concepts, []) : []
      const { data, errors } = await client.models.Student.create({
        firstName: newStudent.firstName.trim() || null,
        lastName: newStudent.lastName.trim() || null,
        customID: newStudent.customID.trim() || null,
        comments: newStudent.comments.trim() || null,
        scopeAndSequence: inventory.length ? serializeScopeAndSequence(inventory) : null,
      })
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join(', '))
      }
      setStudentDialogOpen(false)
      setNewStudent({ firstName: '', lastName: '', customID: '', comments: '' })
      await loadStudents()
      if (data?.id) {
        setSelectedStudentId(data.id)
        setMainTab(0)
        setScopeLocked(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student')
    } finally {
      setSavingStudent(false)
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
            onClick={() => setStudentDialogOpen(true)}
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              No students yet. Start fresh by adding your first student.
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setStudentDialogOpen(true)}
            >
              Add student
            </Button>
          </Box>
        ) : (
          <List dense sx={{ overflow: 'auto' }}>
            {students.map((student) => {
              const name = studentDisplayName(student)
              return (
                <ListItemButton
                  key={student.id}
                  selected={student.id === selectedStudentId}
                  onClick={() => handleSelectStudent(student.id)}
                >
                  <PersonIcon fontSize="small" sx={{ mr: 1.25, color: 'text.secondary' }} />
                  <ListItemText
                    primary={name}
                    secondary={student.customID ? `ID ${student.customID}` : null}
                  />
                </ListItemButton>
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

        {!selectedStudent ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Select or add a student to open their Scope and Sequence.
            </Typography>
          </Paper>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
              <Typography variant="h5">{studentDisplayName(selectedStudent)}</Typography>
              {selectedStudent.customID ? (
                <Chip size="small" label={`ID ${selectedStudent.customID}`} />
              ) : null}
            </Stack>

            <Tabs
              value={mainTab}
              onChange={handleMainTabChange}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Scope & Sequence" />
              <Tab label="Concepts & Lists" />
              <Tab label="Lesson Plan" />
              <Tab label="Data Entry" />
            </Tabs>

            {mainTab === 0 ? (
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
            ) : mainTab === 1 ? (
              <ConceptsWordsPanel
                student={selectedStudent}
                concepts={concepts}
                selectedConceptId={selectedConceptId}
                setSelectedConceptId={setSelectedConceptId}
                conceptQuery={conceptQuery}
                setConceptQuery={setConceptQuery}
                wordsByConceptId={wordsByConceptId}
                loadingCatalog={loadingCatalog}
                studentLists={studentLists}
                loadingLists={loadingLists}
                onReloadLists={loadStudentLists}
                setError={setError}
              />
            ) : mainTab === 2 ? (
              <LessonPlanPanel
                student={selectedStudent}
                concepts={concepts}
                studentLists={studentLists}
                loadingLists={loadingLists}
                wordsByConceptId={wordsByConceptId}
                instructor={user?.signInDetails?.loginId ?? user?.username ?? ''}
                setError={setError}
              />
            ) : (
              <DataEntryPanel
                student={selectedStudent}
                setError={setError}
              />
            )}
          </>
        )}
      </Box>

      <Dialog open={studentDialogOpen} onClose={() => setStudentDialogOpen(false)} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={handleCreateStudent}>
          <DialogTitle>Add student</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField
              label="First name"
              value={newStudent.firstName}
              onChange={(e) => setNewStudent((s) => ({ ...s, firstName: e.target.value }))}
              autoFocus
            />
            <TextField
              label="Last name"
              value={newStudent.lastName}
              onChange={(e) => setNewStudent((s) => ({ ...s, lastName: e.target.value }))}
            />
            <TextField
              label="Custom ID"
              value={newStudent.customID}
              onChange={(e) => setNewStudent((s) => ({ ...s, customID: e.target.value }))}
            />
            <TextField
              label="Comments"
              value={newStudent.comments}
              onChange={(e) => setNewStudent((s) => ({ ...s, comments: e.target.value }))}
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
