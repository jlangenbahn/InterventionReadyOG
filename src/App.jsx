import { useCallback, useEffect, useMemo, useState } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { generateClient } from 'aws-amplify/data'
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
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
  Typography,
  createTheme,
} from '@mui/material'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import AddIcon from '@mui/icons-material/Add'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import SearchIcon from '@mui/icons-material/Search'

const client = generateClient()
const DRAWER_WIDTH = 300
const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']

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
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 160 },
  {
    field: 'isNonsenseWord',
    headerName: 'Nonsense',
    width: 120,
    type: 'boolean',
  },
  { field: 'id', headerName: 'Word ID', flex: 1, minWidth: 220 },
]

const scopeColumns = [
  { field: 'concept', headerName: 'Concept', flex: 1.2, minWidth: 180 },
  { field: 'level', headerName: 'Level', width: 90 },
  { field: 'category', headerName: 'Category', flex: 1, minWidth: 160 },
  { field: 'subcategory', headerName: 'Subcategory', flex: 1, minWidth: 160 },
  {
    field: 'inScope',
    headerName: 'In scope',
    type: 'boolean',
    width: 110,
    editable: true,
  },
  {
    field: 'masteryStatus',
    headerName: 'Mastery status',
    type: 'singleSelect',
    width: 150,
    editable: true,
    valueOptions: MASTERY_STATUSES,
  },
]

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
    if (!word || !link.conceptId) continue
    const bucket = map.get(link.conceptId)
    if (bucket) bucket.push(word)
    else map.set(link.conceptId, [word])
  }
  for (const [, list] of map) {
    list.sort((a, b) => String(a.word ?? '').localeCompare(String(b.word ?? '')))
  }
  return map
}

function normalizeScopeEntry(entry) {
  const mastery = MASTERY_STATUSES.includes(entry?.masteryStatus)
    ? entry.masteryStatus
    : 'unknown'
  return {
    conceptId: entry.conceptId,
    inScope: Boolean(entry?.inScope),
    masteryStatus: mastery,
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
      }
    )
  })
}

function parseScopeAndSequence(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
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
  concepts,
  selectedConceptId,
  setSelectedConceptId,
  conceptQuery,
  setConceptQuery,
  wordsByConceptId,
  loadingCatalog,
}) {
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

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
      <Paper sx={{ flex: 1, minWidth: 280, p: 2, display: 'flex', flexDirection: 'column' }}>
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
          <List dense sx={{ overflow: 'auto', maxHeight: '65vh' }}>
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

      <Paper sx={{ flex: 1.6, p: 2, minHeight: 480, display: 'flex', flexDirection: 'column' }}>
        {!selectedConcept ? (
          <Typography color="text.secondary">Select a concept to see tagged words.</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
              <Typography variant="h6">{selectedConcept.concept}</Typography>
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
            </Stack>
            {selectedConcept.subcategory ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedConcept.subcategory}
              </Typography>
            ) : null}

            <Box sx={{ flex: 1, minHeight: 360, width: '100%' }}>
              <DataGridPro
                key={selectedConceptId}
                rows={selectedWords}
                columns={wordColumns}
                getRowId={(row) => row.id}
                disableRowSelectionOnClick
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
    </Stack>
  )
}

function ScopeAndSequencePanel({
  student,
  concepts,
  loadingCatalog,
  onScopeUpdated,
  setError,
}) {
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    if (!student || !concepts.length) return []
    const inventory = buildScopeAndSequence(
      concepts,
      parseScopeAndSequence(student.scopeAndSequence),
    )
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
        inScope: entry?.inScope ?? false,
        masteryStatus: entry?.masteryStatus ?? 'unknown',
      }
    })
  }, [student, concepts])

  // Persist a full inventory the first time we open Scope and Sequence for a student,
  // and whenever new catalog concepts are missing from the saved inventory.
  useEffect(() => {
    if (!student?.id || loadingCatalog || !concepts.length) return
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
        if (!cancelled && data) onScopeUpdated(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize Scope and Sequence')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [student, concepts, loadingCatalog, onScopeUpdated, setError])

  async function processRowUpdate(newRow, oldRow) {
    if (!student?.id) return oldRow
    setSaving(true)
    try {
      const nextInventory = buildScopeAndSequence(
        concepts,
        parseScopeAndSequence(student.scopeAndSequence),
      ).map((entry) =>
        entry.conceptId === newRow.conceptId
          ? {
              conceptId: newRow.conceptId,
              inScope: Boolean(newRow.inScope),
              masteryStatus: MASTERY_STATUSES.includes(newRow.masteryStatus)
                ? newRow.masteryStatus
                : 'unknown',
            }
          : entry,
      )

      const { data, errors } = await client.models.Student.update({
        id: student.id,
        scopeAndSequence: serializeScopeAndSequence(nextInventory),
      })
      if (errors?.length) throw new Error(errors.map((e) => e.message).join(', '))
      if (data) onScopeUpdated(data)
      setError('')
      return {
        ...newRow,
        inScope: Boolean(newRow.inScope),
        masteryStatus: MASTERY_STATUSES.includes(newRow.masteryStatus)
          ? newRow.masteryStatus
          : 'unknown',
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Scope and Sequence')
      throw err
    } finally {
      setSaving(false)
    }
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
    <Paper sx={{ p: 2, height: 'calc(100vh - 200px)', minHeight: 480, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap">
        <Typography variant="h6">Scope and Sequence</Typography>
        <Chip size="small" label={studentDisplayName(student)} />
        <Chip size="small" variant="outlined" label={`${rows.length} concepts`} />
        {saving ? <Chip size="small" color="primary" label="Saving…" /> : null}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Double-click a cell to edit In scope or Mastery status. Changes save automatically.
      </Typography>
      <Box sx={{ flex: 1, width: '100%' }}>
        <DataGridPro
          key={student.id}
          rows={rows}
          columns={scopeColumns}
          getRowId={(row) => row.conceptId}
          disableRowSelectionOnClick
          pagination
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 50 } },
          }}
          processRowUpdate={processRowUpdate}
          onProcessRowUpdateError={(err) => {
            setError(err instanceof Error ? err.message : 'Failed to update row')
          }}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: true },
          }}
          density="compact"
        />
      </Box>
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
  const [studentDialogOpen, setStudentDialogOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    customID: '',
    comments: '',
  })
  const [savingStudent, setSavingStudent] = useState(false)

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  )

  const handleScopeUpdated = useCallback((updatedStudent) => {
    setStudents((prev) =>
      prev.map((student) => (student.id === updatedStudent.id ? updatedStudent : student)),
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

  function handleSelectStudent(studentId) {
    setSelectedStudentId(studentId)
    setMainTab(0)
    setSelectedConceptId(null)
  }

  async function handleCreateStudent(event) {
    event.preventDefault()
    if (!newStudent.firstName.trim() && !newStudent.lastName.trim()) return
    setSavingStudent(true)
    try {
      const inventory = concepts.length
        ? buildScopeAndSequence(concepts, [])
        : []
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
              onChange={(_event, value) => setMainTab(value)}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Scope and Sequence" />
              <Tab label="Concepts & Words" />
            </Tabs>

            {mainTab === 0 ? (
              <ScopeAndSequencePanel
                student={selectedStudent}
                concepts={concepts}
                loadingCatalog={loadingCatalog}
                onScopeUpdated={handleScopeUpdated}
                setError={setError}
              />
            ) : (
              <ConceptsWordsPanel
                concepts={concepts}
                selectedConceptId={selectedConceptId}
                setSelectedConceptId={setSelectedConceptId}
                conceptQuery={conceptQuery}
                setConceptQuery={setConceptQuery}
                wordsByConceptId={wordsByConceptId}
                loadingCatalog={loadingCatalog}
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
