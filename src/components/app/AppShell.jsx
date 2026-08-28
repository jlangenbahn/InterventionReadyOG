/**
 * Signed-in instructor shell: left nav, student/group CRUD, and main tabs.
 * Unsaved Scope and Sequence (and dirty lesson plans) block navigation until saved.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
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
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import Groups3Icon from '@mui/icons-material/Groups3'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import LessonPlanPanel from '../lesson-plan/LessonPlanPanel'
import DataPanel from '../data/DataPanel'
import ContentPanel from '../content/ContentPanel'
import GroupPanel from '../groups/GroupPanel'
import SchedulePanel from '../schedule/SchedulePanel'
import ScopeAndSequencePanel from '../scope/ScopeAndSequencePanel'
import ResourcesPanel from '../resources/ResourcesPanel'
import ConfirmDeleteDialog from '../shared/ConfirmDeleteDialog'
import NavSectionHeader from './NavSectionHeader'
import { ColorModeToggle } from './colorMode'
import { fetchStudentLists } from '../../lib/fetchStudentLessonPlan'
import { client } from '../../lib/amplifyClient'
import { deleteInstructorGroup, fetchInstructorGroups, saveInstructorGroup } from '../../lib/groups'
import { deleteStudentCascade, updateStudent } from '../../lib/crudRecords'
import { listAll } from '../../lib/paginate'
import { buildScopeAndSequence, serializeScopeAndSequence } from '../../lib/scopeAndSequence'
import {
  normalizeLastInitial,
  studentDisplayName,
  studentNavDisplayName,
} from '../../lib/studentDisplay'
import { BRAND } from '../../theme'
import readyOgLogo from '../../assets/readyog-logo.png'

const DRAWER_WIDTH = 300
const HEADER_BRAND_SIZE = 48
const TAB_LESSON_PLAN = 0
const TAB_SCOPE = 1
const TAB_CONTENT = 2
const TAB_DATA = 3

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

export default function AppShell({ user, signOut }) {
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
  const [viewingResources, setViewingResources] = useState(false)
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
    if (
      studentId === selectedStudentId &&
      !creatingGroup &&
      !selectedGroupId &&
      !viewingSchedule &&
      !viewingResources
    ) {
      return
    }
    requestNavigation(() => {
      setSelectedStudentId(studentId)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setViewingSchedule(false)
      setViewingResources(false)
      setOpenLessonId(null)
      setScopeLocked(true)
    })
  }

  function handleSelectGroup(groupId) {
    if (groupId === selectedGroupId && !creatingGroup && !viewingSchedule && !viewingResources) {
      return
    }
    requestNavigation(() => {
      setSelectedGroupId(groupId)
      setSelectedStudentId(null)
      setCreatingGroup(false)
      setViewingSchedule(false)
      setViewingResources(false)
      setScopeLocked(true)
    })
  }

  function handleStartCreateGroup() {
    requestNavigation(() => {
      setCreatingGroup(true)
      setSelectedGroupId(null)
      setSelectedStudentId(null)
      setViewingSchedule(false)
      setViewingResources(false)
      setScopeLocked(true)
    })
  }

  function handleSelectSchedule() {
    if (viewingSchedule) return
    requestNavigation(() => {
      setViewingSchedule(true)
      setViewingResources(false)
      setSelectedStudentId(null)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setScopeLocked(true)
    })
  }

  function handleStartCreateScheduledLesson() {
    requestNavigation(() => {
      setViewingSchedule(true)
      setViewingResources(false)
      setSelectedStudentId(null)
      setSelectedGroupId(null)
      setCreatingGroup(false)
      setScopeLocked(true)
      setScheduleCreateNonce((current) => current + 1)
    })
  }

  function handleSelectResources() {
    if (viewingResources) return
    requestNavigation(() => {
      setViewingResources(true)
      setViewingSchedule(false)
      setSelectedStudentId(null)
      setSelectedGroupId(null)
      setCreatingGroup(false)
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
          setSelectedGroupId(null)
          setCreatingGroup(false)
          setViewingSchedule(false)
          setViewingResources(false)
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
                          !viewingResources &&
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
                        selected={
                          !creatingGroup &&
                          !viewingSchedule &&
                          !viewingResources &&
                          group.id === selectedGroupId
                        }
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
          <Divider />
          <NavSectionHeader
            title="Resources"
            selected={viewingResources}
            onSelect={handleSelectResources}
            icon={
              <VideoLibraryIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
            }
          />
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

        {!selectedStudent &&
        !creatingGroup &&
        !selectedGroup &&
        !viewingSchedule &&
        !viewingResources ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Select a student, choose a group, open Schedule or Resources, or click + to create one.
            </Typography>
          </Paper>
        ) : viewingResources ? (
          <ResourcesPanel />
        ) : viewingSchedule ? (
          <SchedulePanel
            students={students}
            groups={groups}
            setError={setError}
            createNonce={scheduleCreateNonce}
            instructor={user?.signInDetails?.loginId ?? user?.username ?? ''}
            onOpenStudent={(studentId, lessonId) => {
              requestNavigation(() => {
                setViewingSchedule(false)
                setViewingResources(false)
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

            <Tabs value={mainTab} onChange={handleMainTabChange} sx={{ mb: 2 }}>
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
