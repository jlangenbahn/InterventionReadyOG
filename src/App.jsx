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
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import SearchIcon from '@mui/icons-material/Search'

const client = generateClient()
const DRAWER_WIDTH = 300

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

async function listAll(model, options = {}) {
  const items = []
  let nextToken
  do {
    const { data, errors, nextToken: token } = await model.list({
      limit: 200,
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

function AppShell({ user, signOut }) {
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [concepts, setConcepts] = useState([])
  const [selectedConceptId, setSelectedConceptId] = useState(null)
  const [conceptWords, setConceptWords] = useState([])
  const [conceptQuery, setConceptQuery] = useState('')
  const [wordQuery, setWordQuery] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [loadingConcepts, setLoadingConcepts] = useState(true)
  const [loadingWords, setLoadingWords] = useState(false)
  const [error, setError] = useState('')
  const [studentDialogOpen, setStudentDialogOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    customID: '',
    comments: '',
  })
  const [savingStudent, setSavingStudent] = useState(false)

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

  const filteredWords = useMemo(() => {
    const q = wordQuery.trim().toLowerCase()
    if (!q) return conceptWords
    return conceptWords.filter((w) => String(w.word ?? '').toLowerCase().includes(q))
  }, [conceptWords, wordQuery])

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

  const loadConcepts = useCallback(async () => {
    setLoadingConcepts(true)
    try {
      const items = await listAll(client.models.Concept)
      items.sort((a, b) => String(a.concept ?? '').localeCompare(String(b.concept ?? '')))
      setConcepts(items)
      setSelectedConceptId((current) => current ?? items[0]?.id ?? null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load concepts')
    } finally {
      setLoadingConcepts(false)
    }
  }, [])

  const loadWordsForConcept = useCallback(async (conceptId) => {
    if (!conceptId) {
      setConceptWords([])
      return
    }
    setLoadingWords(true)
    try {
      const links = await listAll(client.models.ConceptWord, {
        filter: { conceptId: { eq: conceptId } },
        selectionSet: ['id', 'wordId', 'word.id', 'word.word', 'word.isNonsenseWord'],
      })
      const words = links
        .map((link) => link.word)
        .filter(Boolean)
      words.sort((a, b) => String(a.word ?? '').localeCompare(String(b.word ?? '')))
      setConceptWords(words)
      setError('')
    } catch (err) {
      setConceptWords([])
      setError(err instanceof Error ? err.message : 'Failed to load concept words')
    } finally {
      setLoadingWords(false)
    }
  }, [])

  useEffect(() => {
    loadStudents()
    loadConcepts()
  }, [loadStudents, loadConcepts])

  useEffect(() => {
    loadWordsForConcept(selectedConceptId)
  }, [selectedConceptId, loadWordsForConcept])

  async function handleCreateStudent(event) {
    event.preventDefault()
    if (!newStudent.firstName.trim() && !newStudent.lastName.trim()) return
    setSavingStudent(true)
    try {
      const { data, errors } = await client.models.Student.create({
        firstName: newStudent.firstName.trim() || null,
        lastName: newStudent.lastName.trim() || null,
        customID: newStudent.customID.trim() || null,
        comments: newStudent.comments.trim() || null,
      })
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join(', '))
      }
      setStudentDialogOpen(false)
      setNewStudent({ firstName: '', lastName: '', customID: '', comments: '' })
      await loadStudents()
      if (data?.id) setSelectedStudentId(data.id)
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
              const name =
                [student.firstName, student.lastName].filter(Boolean).join(' ') ||
                'Unnamed student'
              return (
                <ListItemButton
                  key={student.id}
                  selected={student.id === selectedStudentId}
                  onClick={() => setSelectedStudentId(student.id)}
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
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
              sx={{ mb: 1.5 }}
            />
            {loadingConcepts ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <List dense sx={{ overflow: 'auto', maxHeight: '70vh' }}>
                {filteredConcepts.map((concept) => (
                  <ListItemButton
                    key={concept.id}
                    selected={concept.id === selectedConceptId}
                    onClick={() => setSelectedConceptId(concept.id)}
                  >
                    <ListItemText
                      primary={concept.concept}
                      secondary={[concept.level && `Level ${concept.level}`, concept.category, concept.subcategory]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>

          <Paper sx={{ flex: 1.4, p: 2, minHeight: 420 }}>
            {!selectedConcept ? (
              <Typography color="text.secondary">Select a concept to see tagged words.</Typography>
            ) : (
              <>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
                  <Typography variant="h6">{selectedConcept.concept}</Typography>
                  {selectedConcept.level ? <Chip size="small" label={`Level ${selectedConcept.level}`} /> : null}
                  {selectedConcept.category ? <Chip size="small" variant="outlined" label={selectedConcept.category} /> : null}
                </Stack>
                {selectedConcept.subcategory ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {selectedConcept.subcategory}
                  </Typography>
                ) : null}

                <TextField
                  size="small"
                  fullWidth
                  placeholder="Filter words for this concept…"
                  value={wordQuery}
                  onChange={(e) => setWordQuery(e.target.value)}
                  sx={{ mb: 2 }}
                />

                {loadingWords ? (
                  <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {filteredWords.length} word{filteredWords.length === 1 ? '' : 's'} tagged via
                      ConceptWord
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {filteredWords.map((word) => (
                        <Chip key={word.id} label={word.word || '(blank)'} variant="outlined" />
                      ))}
                      {filteredWords.length === 0 ? (
                        <Typography color="text.secondary">No words mapped to this concept.</Typography>
                      ) : null}
                    </Box>
                  </>
                )}
              </>
            )}
          </Paper>
        </Stack>
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
