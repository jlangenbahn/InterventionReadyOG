/**
 * Student Lesson Plan tab: list, create, print, score, share, and publish templates.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ViewListIcon from '@mui/icons-material/ViewList'
import GradingIcon from '@mui/icons-material/Grading'
import EditIcon from '@mui/icons-material/Edit'
import ShareIcon from '@mui/icons-material/Share'
import PublicIcon from '@mui/icons-material/Public'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import LessonPlanTemplate from './LessonPlanTemplate'
import CreateLessonStepper from './CreateLessonStepper'
import CreateWordListModal from '../content/CreateWordListModal'
import CreateMultiWordModal from '../content/CreateMultiWordModal'
import DataEntryPanel from './DataEntryPanel'
import ShareLessonDialog from './ShareLessonDialog'
import ConfirmDeleteDialog from '../shared/ConfirmDeleteDialog'
import {
  fetchStudentLessonPlan,
  fetchStudentLessons,
  nextLessonNumber,
  resolvedLessonNumber,
  parseScopeAndSequence,
  formatLessonDisplayName,
  defaultLessonPlanName,
  getLessonPlan,
  getLessonScores,
  resolveSentenceFocusId,
  resolvePassageFocusId,
  resolveListWords,
  saveStudentLesson,
  copyLessonToStudents,
  studentDisplayName,
  buildLessonScoreMaterials,
  formatScoreTally,
  tallyScores,
} from '../../lib/fetchStudentLessonPlan'
import { deleteLesson, deletePassage, deleteSentence } from '../../lib/crudRecords'
import {
  applyLessonTemplate,
  deleteLessonTemplate,
  listLessonTemplates,
  publishLessonTemplate,
  templateIsOwnedBy,
} from '../../lib/lessonTemplates'
import PublishLessonTemplateDialog from './PublishLessonTemplateDialog'
import HelpTip from '../shared/HelpTip'
import { BRAND, globalLessonGridSx, gradeBandFromPercent, gradeRowSx } from '../../theme'
import { LESSON_PLAN_PRINT_PAGE_STYLE } from '../../lib/lessonPlanPrint'
import { sampleWordFromBank } from '../../lib/generateLessonText'

const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']

const EMPTY_LIST_SLOTS = {
  newConcept: null,
  review1: null,
  review2: null,
  review3: null,
}

const EMPTY_SENTENCE_SLOTS = {
  sentence1: null,
  sentence2: null,
  sentence3: null,
  sentence4: null,
  sentence5: null,
  sentence6: null,
}

const EMPTY_PASSAGE_SLOTS = {
  passage1: null,
  passage2: null,
}

const REVIEW_SLOT_KEYS = ['review1', 'review2', 'review3']
const SENTENCE_SLOT_KEYS = ['sentence1', 'sentence2', 'sentence3', 'sentence4', 'sentence5', 'sentence6']
const PASSAGE_SLOT_KEYS = ['passage1', 'passage2']

function idsFromSlots(slots, keys) {
  return keys.map((key) => slots?.[key]).filter(Boolean)
}

function slotsFromIds(keys, ids) {
  const next = {}
  keys.forEach((key, index) => {
    next[key] = ids[index] ?? null
  })
  return next
}

function buildWordLookup(wordsByConceptId) {
  const lookup = new Map()
  if (!wordsByConceptId) return lookup
  for (const rows of wordsByConceptId.values()) {
    for (const row of rows ?? []) {
      const word = row?.word
      if (!word) continue
      if (row.wordId) lookup.set(row.wordId, word)
      if (row.id) lookup.set(row.id, word)
    }
  }
  return lookup
}

function toPlainListRow(list, wordLookup, conceptById) {
  const words = resolveListWords(list, wordLookup)
  return {
    id: list.id,
    name: list.name || 'Untitled list',
    concept: conceptById.get(list.conceptID)?.concept || 'Unknown concept',
    conceptID: list.conceptID || null,
    wordCount: words.length,
    words,
  }
}

function conceptLabel(concept) {
  const raw = concept?.concept ?? concept?.name ?? ''
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'Untitled concept'
}

function todayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toIsoDate(value) {
  if (!value) return todayIso()
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return todayIso()
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return todayIso()
  return toIsoDate(parsed)
}

function formatLessonDate(value) {
  if (!value) return ''
  const iso = toIsoDate(value)
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return ''
  return `${month}/${day}/${year}`
}

function recordWordCount(record) {
  if (!record) return 0
  return Array.isArray(record.words) ? record.words.filter(Boolean).length : 0
}

function preferFilledRecord(live, snap, score) {
  const liveScore = live ? score(live) : 0
  const snapScore = snap ? score(snap) : 0
  if (live && liveScore > 0) return live
  if (snap && snapScore > 0) return snap
  return live || snap || null
}

function snapshotHasContent(snaps) {
  if (!snaps) return false
  const lists = Object.values(snaps.lists ?? {})
  if (lists.some((list) => recordWordCount(list) > 0)) return true
  if (Array.isArray(snaps.sentences) && snaps.sentences.some((item) => item?.text)) return true
  const passages = Array.isArray(snaps.passages)
    ? snaps.passages
    : snaps.passage
      ? [snaps.passage]
      : []
  return passages.some((item) => item?.text)
}

function snapshotList(list) {
  if (!list) return null
  return {
    id: list.id,
    name: list.name || 'Untitled list',
    concept: list.concept || '',
    conceptID: list.conceptID || null,
    words: Array.isArray(list.words) ? list.words.slice() : [],
  }
}

function snapshotSentence(sentence) {
  if (!sentence) return null
  return {
    id: sentence.id,
    text: sentence.text || '',
    wordCount: sentence.wordCount ?? 0,
    conceptID: sentence.conceptID || sentence.focusConceptId || null,
    focusConcept: sentence.focusConcept || '',
  }
}

function snapshotPassage(passage) {
  if (!passage) return null
  return {
    id: passage.id,
    title: passage.title || 'Untitled passage',
    text: passage.text || '',
    concept: passage.concept || passage.focusConcept || '',
    conceptID: passage.conceptID || passage.focusConceptId || null,
    focusConcept: passage.focusConcept || passage.concept || '',
    wordCount: passage.wordCount ?? 0,
  }
}

function snapshotEncodingConcept(concept) {
  if (!concept?.id) return null
  return {
    id: concept.id,
    concept: concept.concept || concept.name || '',
    sampleWord: concept.sampleWord || '',
  }
}

const SAVED_LESSON_COLUMNS = [
  {
    field: 'lessonNumber',
    headerName: '#',
    type: 'number',
    width: 56,
    minWidth: 56,
    align: 'left',
    headerAlign: 'left',
    disableColumnMenu: true,
  },
  {
    field: 'lessonDateLabel',
    headerName: 'Date',
    width: 96,
    minWidth: 96,
    disableColumnMenu: true,
  },
  { field: 'name', headerName: 'Lesson', flex: 1.2, minWidth: 120 },
  { field: 'newConcept', headerName: 'New concept', flex: 1, minWidth: 110 },
  { field: 'scoreLabel', headerName: 'Score', width: 108, minWidth: 108 },
]

const LESSON_MODE_VIEW = 0
const LESSON_MODE_GRADE = 1
const LESSON_MODE_CREATE = 2

export default function LessonPlanPanel({
  student,
  concepts = [],
  studentLists = [],
  loadingLists = false,
  wordsByConceptId,
  loadingCatalog = false,
  onReloadLists,
  instructor,
  username,
  setError,
  students = [],
  groups = [],
  leaveGuardRef,
  openLessonId = null,
}) {
  const printRef = useRef(null)
  const lastGeneratedNameRef = useRef('')
  const studentIdRef = useRef(student?.id)
  studentIdRef.current = student?.id
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState(null)
  const [listSlots, setListSlots] = useState(EMPTY_LIST_SLOTS)
  const [sentenceSlots, setSentenceSlots] = useState(EMPTY_SENTENCE_SLOTS)
  const [passageSlots, setPassageSlots] = useState(EMPTY_PASSAGE_SLOTS)
  const [lessonDate, setLessonDate] = useState(todayIso)
  const [loadedLesson, setLoadedLesson] = useState(null)
  const [snapshots, setSnapshots] = useState(null)
  const [savedLessons, setSavedLessons] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeStep, setActiveStep] = useState(0)
  const [lessonMode, setLessonMode] = useState(LESSON_MODE_VIEW)
  const [selectedNewConceptId, setSelectedNewConceptId] = useState(null)
  const [selectedReviewConceptIds, setSelectedReviewConceptIds] = useState([])
  const [selectedWhatSpellsConceptIds, setSelectedWhatSpellsConceptIds] = useState([])
  const [selectedSosConceptIds, setSelectedSosConceptIds] = useState([])
  const [lessonNotes, setLessonNotes] = useState('')
  const [lessonName, setLessonName] = useState('')
  const [shareLesson, setShareLesson] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [publishLesson, setPublishLesson] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [lessonToDelete, setLessonToDelete] = useState(null)
  const [deletingLesson, setDeletingLesson] = useState(false)
  const [listModalConcept, setListModalConcept] = useState(null)
  const [multiWordModal, setMultiWordModal] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [leaveCreate, setLeaveCreate] = useState(null)
  const [catalogItemToDelete, setCatalogItemToDelete] = useState(null)
  const [deletingCatalogItem, setDeletingCatalogItem] = useState(false)
  const [showGlobalLessons, setShowGlobalLessons] = useState(false)
  const [globalTemplates, setGlobalTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [applyingTemplateId, setApplyingTemplateId] = useState(null)
  const [templateToDelete, setTemplateToDelete] = useState(null)
  const [deletingTemplate, setDeletingTemplate] = useState(false)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Lesson Plan – ${studentDisplayName(student)}`,
    pageStyle: LESSON_PLAN_PRINT_PAGE_STYLE,
  })

  const load = useCallback(async () => {
    if (!student?.id) {
      setPayload(null)
      return
    }
    const requestStudentId = student.id
    setLoading(true)
    try {
      const data = await fetchStudentLessonPlan(requestStudentId)
      if (studentIdRef.current !== requestStudentId) return
      setPayload(data)
      setError('')
    } catch (err) {
      if (studentIdRef.current !== requestStudentId) return
      setError(err instanceof Error ? err.message : 'Failed to load lesson plan')
    } finally {
      if (studentIdRef.current === requestStudentId) setLoading(false)
    }
  }, [student?.id, setError])

  const loadSavedLessons = useCallback(async () => {
    if (!student?.id) {
      setSavedLessons([])
      return []
    }
    const requestStudentId = student.id
    setLoadingLessons(true)
    try {
      const lessons = await fetchStudentLessons(requestStudentId)
      if (studentIdRef.current !== requestStudentId) return []
      setSavedLessons(lessons)
      return lessons
    } catch (err) {
      if (studentIdRef.current !== requestStudentId) return []
      setError(err instanceof Error ? err.message : 'Failed to load saved lesson plans')
      return []
    } finally {
      if (studentIdRef.current === requestStudentId) setLoadingLessons(false)
    }
  }, [student?.id, setError])

  const loadGlobalTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const items = await listLessonTemplates()
      setGlobalTemplates(items)
      setError('')
      return items
    } catch (err) {
      setGlobalTemplates([])
      setError(err instanceof Error ? err.message : 'Failed to load global lessons')
      return []
    } finally {
      setLoadingTemplates(false)
    }
  }, [setError])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadSavedLessons()
  }, [loadSavedLessons])

  useEffect(() => {
    if (!showGlobalLessons) return
    void loadGlobalTemplates()
  }, [showGlobalLessons, loadGlobalTemplates])

  useEffect(() => {
    setPayload(null)
    setSavedLessons([])
    setListSlots({ ...EMPTY_LIST_SLOTS })
    setSentenceSlots({ ...EMPTY_SENTENCE_SLOTS })
    setPassageSlots({ ...EMPTY_PASSAGE_SLOTS })
    setLoadedLesson(null)
    setSnapshots(null)
    setLessonDate(todayIso())
    setNotice('')
    setActiveStep(0)
    setLessonMode(LESSON_MODE_VIEW)
    setSelectedNewConceptId(null)
    setSelectedReviewConceptIds([])
    setSelectedWhatSpellsConceptIds([])
    setSelectedSosConceptIds([])
    setLessonNotes('')
    setLessonName('')
    lastGeneratedNameRef.current = ''
    setShareLesson(null)
    setLessonToDelete(null)
    setListModalConcept(null)
    setMultiWordModal(null)
    setPreviewLoading(false)
    setLeaveCreate(null)
    setCatalogItemToDelete(null)
    setShowGlobalLessons(false)
    setSelectedTemplateId(null)
    setTemplateToDelete(null)
  }, [student?.id])

  const wordLookup = useMemo(() => buildWordLookup(wordsByConceptId), [wordsByConceptId])

  const conceptById = useMemo(
    () => new Map((concepts ?? []).map((concept) => [concept.id, concept])),
    [concepts],
  )

  const conceptOptions = useMemo(() => {
    const inventory = parseScopeAndSequence(
      student?.scopeAndSequence ?? payload?.student?.scopeAndSequence,
    )
    const byConceptId = new Map((inventory ?? []).map((entry) => [entry.conceptId, entry]))
    return (concepts ?? [])
      .filter((concept) => concept?.id)
      .map((concept) => {
        const entry = byConceptId.get(concept.id)
        const masteryStatus = MASTERY_STATUSES.includes(entry?.masteryStatus)
          ? entry.masteryStatus
          : 'unknown'
        return {
          id: concept.id,
          concept: conceptLabel(concept),
          label: conceptLabel(concept),
          category: concept.category || '',
          subcategory: concept.subcategory || '',
          level: concept.level || '',
          masteryStatus,
          inScope: entry?.inScope === true,
          sequence: Number.isFinite(Number(entry?.sequence)) ? Number(entry.sequence) : null,
          sampleWord: sampleWordFromBank(wordsByConceptId, concept.id),
        }
      })
      .sort((a, b) => {
        if (a.inScope !== b.inScope) return a.inScope ? -1 : 1
        const seqA = a.sequence ?? Number.POSITIVE_INFINITY
        const seqB = b.sequence ?? Number.POSITIVE_INFINITY
        if (seqA !== seqB) return seqA - seqB
        return a.concept.localeCompare(b.concept)
      })
  }, [concepts, student?.scopeAndSequence, payload?.student?.scopeAndSequence, wordsByConceptId])

  const lists = useMemo(
    () =>
      (studentLists ?? [])
        .filter((list) => list?.id)
        .map((list) => toPlainListRow(list, wordLookup, conceptById)),
    [studentLists, wordLookup, conceptById],
  )

  const sentences = useMemo(
    () =>
      (payload?.sentences ?? [])
        .filter((sentence) => sentence?.id)
        .map((sentence) => {
          const focusConceptId = resolveSentenceFocusId(sentence)
          return {
            id: sentence.id,
            text: sentence.text || '',
            wordCount: sentence.wordCount ?? 0,
            conceptID: focusConceptId,
            focusConceptId,
            focusConcept: conceptById.get(focusConceptId)?.concept || '',
          }
        }),
    [payload?.sentences, conceptById],
  )

  const passages = useMemo(
    () =>
      (payload?.passages ?? [])
        .filter((passage) => passage?.id)
        .map((passage) => {
          const focusConceptId = resolvePassageFocusId(passage)
          return {
            id: passage.id,
            title: passage.title || 'Untitled passage',
            text: passage.text || '',
            concept: conceptById.get(focusConceptId)?.concept || '',
            conceptID: focusConceptId,
            focusConceptId,
            focusConcept: conceptById.get(focusConceptId)?.concept || '',
            wordCount: passage.wordCount ?? 0,
          }
        }),
    [payload?.passages, conceptById],
  )

  const listsById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])
  const sentencesById = useMemo(
    () => new Map(sentences.map((sentence) => [sentence.id, sentence])),
    [sentences],
  )
  const passagesById = useMemo(
    () => new Map(passages.map((passage) => [passage.id, passage])),
    [passages],
  )

  const newConceptLists = useMemo(
    () =>
      selectedNewConceptId
        ? lists.filter((list) => list.conceptID === selectedNewConceptId)
        : [],
    [lists, selectedNewConceptId],
  )

  const reviewConceptLists = useMemo(() => {
    const allowed = new Set(selectedReviewConceptIds)
    if (!allowed.size) return []
    return lists.filter((list) => allowed.has(list.conceptID))
  }, [lists, selectedReviewConceptIds])

  const focusConceptIds = useMemo(() => {
    const ids = [selectedNewConceptId, ...selectedReviewConceptIds].filter(Boolean)
    return [...new Set(ids)]
  }, [selectedNewConceptId, selectedReviewConceptIds])

  const lessonConceptsForAndrea = useMemo(() => {
    const rows = []
    const newConcept = conceptOptions.find((item) => item.id === selectedNewConceptId)
    if (newConcept) rows.push({ ...newConcept, role: 'new' })
    for (const id of selectedReviewConceptIds) {
      const review = conceptOptions.find((item) => item.id === id)
      if (review) rows.push({ ...review, role: 'review' })
    }
    return rows
  }, [conceptOptions, selectedNewConceptId, selectedReviewConceptIds])

  const lessonSentences = useMemo(() => {
    if (!focusConceptIds.length) return []
    const allowed = new Set(focusConceptIds)
    return sentences.filter((sentence) => allowed.has(sentence.focusConceptId))
  }, [sentences, focusConceptIds])

  const lessonPassages = useMemo(() => {
    if (!focusConceptIds.length) return []
    const allowed = new Set(focusConceptIds)
    return passages.filter((passage) => allowed.has(passage.focusConceptId))
  }, [passages, focusConceptIds])

  const studentLessons = useMemo(
    () =>
      (savedLessons ?? []).filter((lesson) => !lesson.studentID || lesson.studentID === student?.id),
    [savedLessons, student?.id],
  )

  const savedLessonRows = useMemo(
    () =>
      [...studentLessons]
        .sort((a, b) => {
          const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''))
          if (byDate) return byDate
          return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
        })
        .map((lesson) => {
          const data = getLessonPlan(lesson)
          const newConcept =
            data?.snapshots?.lists?.newConcept?.concept
            || data?.snapshots?.lists?.newConcept?.name
            || ''
          const customName = data?.name || lesson.name || ''
          const materials = buildLessonScoreMaterials(lesson)
          const tally = tallyScores(materials.allKeys, getLessonScores(lesson))
          const scorePercent = tally.scored ? Math.round((tally.accuracy ?? 0) * 100) : null
          return {
            id: lesson.id,
            lessonNumber: lesson.lessonNumber ?? '',
            date: lesson.date,
            createdAt: lesson.createdAt,
            lessonDateLabel: formatLessonDate(lesson.date) || '—',
            newConcept: newConcept || '—',
            name: formatLessonDisplayName(customName, newConcept, lesson.lessonNumber) || '—',
            scoreLabel: formatScoreTally(tally),
            scorePercent,
            gradeBand: gradeBandFromPercent(scorePercent),
          }
        }),
    [studentLessons],
  )

  const lessonSelectionModel = useMemo(
    () => ({
      type: 'include',
      ids: new Set(loadedLesson?.id ? [loadedLesson.id] : []),
    }),
    [loadedLesson?.id],
  )

  const lessonActionColumn = useMemo(
    () => ({
      field: 'actions',
      headerName: '',
      width: 148,
      minWidth: 148,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      resizable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0}>
          <IconButton
            size="small"
            aria-label={`Edit ${params.row.name || 'lesson'}`}
            onClick={(event) => {
              event.stopPropagation()
              const lesson = studentLessons.find((item) => item.id === params.id)
              if (lesson) {
                applyLesson(lesson)
                setLessonMode(LESSON_MODE_CREATE)
              }
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Share ${params.row.name || 'lesson'} with other students`}
            onClick={(event) => {
              event.stopPropagation()
              const lesson = studentLessons.find((item) => item.id === params.id)
              if (lesson) setShareLesson(lesson)
            }}
          >
            <ShareIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Publish ${params.row.name || 'lesson'} as a public template`}
            onClick={(event) => {
              event.stopPropagation()
              const lesson = studentLessons.find((item) => item.id === params.id)
              if (lesson) setPublishLesson(lesson)
            }}
          >
            <PublicIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Delete ${params.row.name || 'lesson'}`}
            onClick={(event) => {
              event.stopPropagation()
              setLessonToDelete(params.row)
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    }),
    [studentLessons],
  )

  const viewColumns = useMemo(
    () => [...SAVED_LESSON_COLUMNS, lessonActionColumn],
    [lessonActionColumn],
  )

  const globalLessonRows = useMemo(
    () =>
      globalTemplates.map((item) => ({
        id: item.id,
        name: item.name || 'Untitled lesson',
        newConcept: item.conceptName || '—',
        reviews: (item.reviewConceptNames ?? []).filter(Boolean).join(', ') || '—',
        mine: templateIsOwnedBy(item, username),
      })),
    [globalTemplates, username],
  )

  const globalSelectionModel = useMemo(
    () => ({
      type: 'include',
      ids: new Set(selectedTemplateId ? [selectedTemplateId] : []),
    }),
    [selectedTemplateId],
  )

  const globalColumns = useMemo(
    () => [
      { field: 'name', headerName: 'Lesson', flex: 1.2, minWidth: 120 },
      { field: 'newConcept', headerName: 'New concept', flex: 1, minWidth: 110 },
      { field: 'reviews', headerName: 'Review concepts', flex: 1, minWidth: 140 },
      {
        field: 'actions',
        headerName: '',
        width: 148,
        minWidth: 148,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        resizable: false,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button
              size="small"
              variant="contained"
              disabled={!student?.id || applyingTemplateId === params.id}
              onClick={(event) => {
                event.stopPropagation()
                void applyGlobalLesson(params.id)
              }}
            >
              {applyingTemplateId === params.id ? 'Importing…' : 'Import'}
            </Button>
            {params.row.mine ? (
              <IconButton
                size="small"
                aria-label={`Delete ${params.row.name || 'global lesson'}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setTemplateToDelete(params.row)
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Stack>
        ),
      },
    ],
    [student?.id, applyingTemplateId],
  )

  function listForSlot(key) {
    const id = listSlots[key]
    if (!id) return null
    const live = listsById.get(id)
    const snap = snapshots?.lists?.[key]
    const snapMatch = snap?.id === id ? snap : null
    return preferFilledRecord(live, snapMatch, recordWordCount)
  }

  function sentenceForSlot(key) {
    const id = sentenceSlots[key]
    if (!id) return null
    const live = sentencesById.get(id)
    const snaps = snapshots?.sentences
    const snap = Array.isArray(snaps)
      ? snaps.find((item) => item?.id === id)
      : snaps?.[key]
    const snapMatch = snap?.id === id ? snap : null
    return preferFilledRecord(live, snapMatch, (item) => (item?.text ? 1 : 0))
  }

  function passageForSlot(key) {
    const id = passageSlots[key]
    if (!id) return null
    const live = passagesById.get(id)
    const snap = snapshots?.passage
    const snaps = snapshots?.passages
    const fromArray = Array.isArray(snaps) ? snaps.find((item) => item?.id === id) : null
    const snapMatch =
      snap?.id === id ? snap : fromArray?.id === id ? fromArray : null
    return preferFilledRecord(live, snapMatch, (item) => (item?.text ? 1 : 0))
  }

  const reviewLists = REVIEW_SLOT_KEYS.map((key) => listForSlot(key))
  const newConceptList = listForSlot('newConcept')
  const selectedSentences = SENTENCE_SLOT_KEYS.map((key) => sentenceForSlot(key))
  const selectedPassages = PASSAGE_SLOT_KEYS.map((key) => passageForSlot(key))
  const selectedPassage = selectedPassages[0] ?? null
  const whatSpellsConcepts = selectedWhatSpellsConceptIds
    .map((id) => {
      const live = conceptOptions.find((item) => item.id === id)
      const snap = (snapshots?.whatSpells ?? []).find((item) => item?.id === id)
      return live || snap || null
    })
    .filter(Boolean)
  const sosConcepts = selectedSosConceptIds
    .map((id) => {
      const live = conceptOptions.find((item) => item.id === id)
      const snap = (snapshots?.sos ?? []).find((item) => item?.id === id)
      return live || snap || null
    })
    .filter(Boolean)

  const newConceptIds = listSlots.newConcept ? [listSlots.newConcept] : []
  const reviewIds = idsFromSlots(listSlots, REVIEW_SLOT_KEYS)
  const sentenceIds = idsFromSlots(sentenceSlots, SENTENCE_SLOT_KEYS)
  const passageIds = idsFromSlots(passageSlots, PASSAGE_SLOT_KEYS)

  const lessonNumber = loadedLesson
    ? resolvedLessonNumber(loadedLesson, studentLessons)
    : lessonMode === LESSON_MODE_CREATE
      ? nextLessonNumber(studentLessons)
      : ''
  const dateLabel = formatLessonDate(lessonDate)
  const generatedLessonName = defaultLessonPlanName(
    lessonNumber,
    conceptById.get(selectedNewConceptId)?.concept || newConceptList?.concept || '',
  )
  const lessonDisplayName = formatLessonDisplayName(
    lessonName,
    conceptById.get(selectedNewConceptId)?.concept || newConceptList?.concept || '',
    lessonNumber,
  )
  const canCreate =
    Boolean(lessonDate)
    && Boolean(selectedNewConceptId)
    && selectedReviewConceptIds.length > 0
    && Boolean(newConceptList)

  const createIsDirty = useMemo(() => {
    if (lessonMode !== LESSON_MODE_CREATE) return false
    if (loadedLesson) return true
    const name = String(lessonName ?? '').trim()
    const nameIsCustom = Boolean(name) && name !== generatedLessonName
    return Boolean(
      nameIsCustom
      || String(lessonNotes ?? '').trim()
      || selectedNewConceptId
      || selectedReviewConceptIds.length
      || selectedWhatSpellsConceptIds.length
      || selectedSosConceptIds.length
      || Object.values(listSlots).some(Boolean)
      || Object.values(sentenceSlots).some(Boolean)
      || Object.values(passageSlots).some(Boolean)
      || activeStep > 0
      || lessonDate !== todayIso(),
    )
  }, [
    lessonMode,
    loadedLesson,
    lessonName,
    generatedLessonName,
    lessonNotes,
    selectedNewConceptId,
    selectedReviewConceptIds,
    selectedWhatSpellsConceptIds,
    selectedSosConceptIds,
    listSlots,
    sentenceSlots,
    passageSlots,
    activeStep,
    lessonDate,
  ])

  useEffect(() => {
    setLessonName((current) => {
      const trimmed = String(current ?? '').trim()
      if (!trimmed || trimmed === lastGeneratedNameRef.current) {
        lastGeneratedNameRef.current = generatedLessonName
        return generatedLessonName
      }
      return current
    })
  }, [generatedLessonName])

  useLayoutEffect(() => {
    if (snapshotHasContent(snapshots) || !loadedLesson) {
      setPreviewLoading(false)
      return
    }
    if (loading || loadingLists || loadingCatalog) return
    setPreviewLoading(false)
  }, [loadedLesson, snapshots, loading, loadingLists, loadingCatalog])

  useEffect(() => {
    if (!createIsDirty) return undefined
    function onBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [createIsDirty])

  useEffect(() => () => {
    if (leaveGuardRef) leaveGuardRef.current = null
  }, [leaveGuardRef])

  function handleSelectedNewConceptChange(conceptId) {
    setSelectedNewConceptId(conceptId)
    setSelectedReviewConceptIds((prev) => prev.filter((id) => id !== conceptId))
    setListSlots((prev) => {
      if (!conceptId) return { ...prev, newConcept: null }
      const current =
        listsById.get(prev.newConcept)
        || (snapshots?.lists?.newConcept?.id === prev.newConcept ? snapshots.lists.newConcept : null)
      if (current && current.conceptID !== conceptId) {
        return { ...prev, newConcept: null }
      }
      return prev
    })
    const nextFocus = [conceptId, ...selectedReviewConceptIds.filter((id) => id !== conceptId)].filter(Boolean)
    pruneFocusSlots(nextFocus)
  }

  function handleSelectedReviewConceptsChange(conceptIds) {
    const nextIds = (conceptIds ?? []).filter((id) => id && id !== selectedNewConceptId).slice(0, 3)
    setSelectedReviewConceptIds(nextIds)
    const allowed = new Set(nextIds)
    setListSlots((prev) => {
      const kept = REVIEW_SLOT_KEYS.map((key) => {
        const listId = prev[key]
        if (!listId) return null
        const list = listsById.get(listId) || (snapshots?.lists?.[key]?.id === listId ? snapshots.lists[key] : null)
        return list && allowed.has(list.conceptID) ? listId : null
      }).filter(Boolean)
      return { ...prev, ...slotsFromIds(REVIEW_SLOT_KEYS, kept) }
    })
    pruneFocusSlots([selectedNewConceptId, ...nextIds])
  }

  function pruneFocusSlots(nextFocusIds) {
    const allowed = new Set((nextFocusIds ?? []).filter(Boolean))
    setSentenceSlots((prev) => {
      const kept = SENTENCE_SLOT_KEYS.map((key) => {
        const id = prev[key]
        if (!id) return null
        const sentence = sentencesById.get(id)
        return sentence && allowed.has(sentence.focusConceptId) ? id : null
      }).filter(Boolean)
      return slotsFromIds(SENTENCE_SLOT_KEYS, kept)
    })
    setPassageSlots((prev) => {
      const kept = PASSAGE_SLOT_KEYS.map((key) => {
        const id = prev[key]
        if (!id) return null
        const passage = passagesById.get(id)
        return passage && allowed.has(passage.focusConceptId) ? id : null
      }).filter(Boolean)
      return slotsFromIds(PASSAGE_SLOT_KEYS, kept)
    })
  }

  function handleNewConceptChange(ids) {
    const nextId = (ids ?? []).slice(0, 1)[0] ?? null
    const remainingReviews = idsFromSlots(listSlots, REVIEW_SLOT_KEYS).filter((id) => id !== nextId)
    setListSlots({
      newConcept: nextId,
      ...slotsFromIds(REVIEW_SLOT_KEYS, remainingReviews),
    })
  }

  function handleReviewChange(ids) {
    setListSlots((prev) => ({
      ...prev,
      ...slotsFromIds(REVIEW_SLOT_KEYS, (ids ?? []).slice(0, REVIEW_SLOT_KEYS.length)),
    }))
  }

  function handleSentenceChange(ids) {
    setSentenceSlots(slotsFromIds(SENTENCE_SLOT_KEYS, (ids ?? []).slice(0, SENTENCE_SLOT_KEYS.length)))
  }

  function handlePassageChange(ids) {
    setPassageSlots(slotsFromIds(PASSAGE_SLOT_KEYS, (ids ?? []).slice(0, PASSAGE_SLOT_KEYS.length)))
  }

  async function handleListCreated(created) {
    const createdId = created?.id
    const conceptId = created?.conceptID
    if (createdId) {
      if (conceptId && conceptId === selectedNewConceptId) {
        handleNewConceptChange([createdId])
      } else {
        setListSlots((prev) => {
          const current = idsFromSlots(prev, REVIEW_SLOT_KEYS)
          if (current.includes(createdId) || current.length >= 3) return prev
          return { ...prev, ...slotsFromIds(REVIEW_SLOT_KEYS, [...current, createdId]) }
        })
      }
    }
    setNotice('List created. It is now available in this step.')
    if (onReloadLists) await onReloadLists()
  }

  async function handleMultiWordCreated({ kind, id } = {}) {
    if (id) {
      if (kind === 'passage') {
        setPassageSlots((prev) => {
          const current = idsFromSlots(prev, PASSAGE_SLOT_KEYS)
          if (current.includes(id) || current.length >= 2) return prev
          return slotsFromIds(PASSAGE_SLOT_KEYS, [...current, id])
        })
      } else {
        setSentenceSlots((prev) => {
          const current = idsFromSlots(prev, SENTENCE_SLOT_KEYS)
          if (current.includes(id) || current.length >= 6) return prev
          return slotsFromIds(SENTENCE_SLOT_KEYS, [...current, id])
        })
      }
    }
    setNotice(kind === 'passage' ? 'Passage created. It is now available in this step.' : 'Sentence created. It is now available in this step.')
    await load()
  }

  function startNewLesson() {
    setListSlots({ ...EMPTY_LIST_SLOTS })
    setSentenceSlots({ ...EMPTY_SENTENCE_SLOTS })
    setPassageSlots({ ...EMPTY_PASSAGE_SLOTS })
    setLoadedLesson(null)
    setSnapshots(null)
    setLessonDate(todayIso())
    setNotice('')
    setError('')
    setActiveStep(0)
    setSelectedNewConceptId(null)
    setSelectedReviewConceptIds([])
    setSelectedWhatSpellsConceptIds([])
    setSelectedSosConceptIds([])
    setLessonNotes('')
    setLessonName('')
    lastGeneratedNameRef.current = ''
    setPreviewLoading(false)
  }

  function applyLesson(lesson, { previewOnly = false } = {}) {
    if (lesson?.studentID && student?.id && lesson.studentID !== student.id) return
    setPreviewLoading(true)
    const data = getLessonPlan(lesson)
    const nextListSlots = {
      ...EMPTY_LIST_SLOTS,
      ...(data.slots?.listSlots ?? {}),
    }
    const nextSentenceSlots = {
      ...EMPTY_SENTENCE_SLOTS,
      ...(data.slots?.sentenceSlots ?? {}),
    }
    const nextPassageSlots = {
      ...EMPTY_PASSAGE_SLOTS,
      ...(data.slots?.passageSlots ?? {}),
    }
    if (!nextListSlots.newConcept && data.snapshots?.lists?.newConcept?.id) {
      nextListSlots.newConcept = data.snapshots.lists.newConcept.id
    }
    ;['review1', 'review2', 'review3'].forEach((key) => {
      if (!nextListSlots[key] && data.snapshots?.lists?.[key]?.id) {
        nextListSlots[key] = data.snapshots.lists[key].id
      }
    })
    const passageSnaps = Array.isArray(data.snapshots?.passages)
      ? data.snapshots.passages
      : data.snapshots?.passage
        ? [data.snapshots.passage]
        : []
    PASSAGE_SLOT_KEYS.forEach((key, index) => {
      if (!nextPassageSlots[key] && passageSnaps[index]?.id) {
        nextPassageSlots[key] = passageSnaps[index].id
      }
    })
    const sentenceSnaps = Array.isArray(data.snapshots?.sentences) ? data.snapshots.sentences : []
    SENTENCE_SLOT_KEYS.forEach((key, index) => {
      if (!nextSentenceSlots[key] && sentenceSnaps[index]?.id) {
        nextSentenceSlots[key] = sentenceSnaps[index].id
      }
    })

    setListSlots(nextListSlots)
    setSentenceSlots(nextSentenceSlots)
    setPassageSlots(nextPassageSlots)
    setSnapshots(data.snapshots ?? null)
    setLoadedLesson(previewOnly ? null : lesson)
    setLessonDate(previewOnly ? todayIso() : toIsoDate(lesson?.date))
    setNotice('')
    setError('')
    setActiveStep(0)

    const inferredNewConceptId =
      data.conceptSlots?.newConceptId
      || data.snapshots?.lists?.newConcept?.conceptID
      || null
    const inferredReviewConceptIds = [
      ...(Array.isArray(data.conceptSlots?.reviewConceptIds) ? data.conceptSlots.reviewConceptIds : []),
      data.snapshots?.lists?.review1?.conceptID,
      data.snapshots?.lists?.review2?.conceptID,
      data.snapshots?.lists?.review3?.conceptID,
    ].filter(Boolean)
    const uniqueReviewIds = []
    const seen = new Set()
    for (const id of inferredReviewConceptIds) {
      if (id === inferredNewConceptId || seen.has(id)) continue
      seen.add(id)
      uniqueReviewIds.push(id)
      if (uniqueReviewIds.length >= 3) break
    }
    setSelectedNewConceptId(inferredNewConceptId)
    setSelectedReviewConceptIds(uniqueReviewIds)
    const inferredWhatSpells =
      Array.isArray(data.conceptSlots?.whatSpellsConceptIds) && data.conceptSlots.whatSpellsConceptIds.length
        ? data.conceptSlots.whatSpellsConceptIds.filter(Boolean)
        : (data.snapshots?.whatSpells ?? []).map((item) => item?.id).filter(Boolean)
    const inferredSos =
      Array.isArray(data.conceptSlots?.sosConceptIds) && data.conceptSlots.sosConceptIds.length
        ? data.conceptSlots.sosConceptIds.filter(Boolean)
        : (data.snapshots?.sos ?? []).map((item) => item?.id).filter(Boolean)
    setSelectedWhatSpellsConceptIds(inferredWhatSpells)
    setSelectedSosConceptIds(inferredSos)
    setLessonNotes(data.notes ?? lesson?.comments ?? '')
    const loadedName = data.name || lesson?.name || ''
    const loadedConcept =
      data?.snapshots?.lists?.newConcept?.concept
      || data?.snapshots?.lists?.newConcept?.name
      || conceptById.get(inferredNewConceptId)?.concept
      || ''
    lastGeneratedNameRef.current = defaultLessonPlanName(
      resolvedLessonNumber(lesson, studentLessons),
      loadedConcept,
    )
    setLessonName(loadedName)
  }

  useEffect(() => {
    if (!openLessonId || !student?.id) return
    if (loadedLesson?.id === openLessonId) return
    const lesson = studentLessons.find((item) => item.id === openLessonId)
    if (!lesson) return
    applyLesson(lesson)
    setLessonMode(LESSON_MODE_VIEW)
  }, [openLessonId, student?.id, studentLessons, loadedLesson?.id])

  function handleStartCreate() {
    startNewLesson()
    setShowGlobalLessons(false)
    setSelectedTemplateId(null)
    setLessonMode(LESSON_MODE_CREATE)
  }

  function abandonCreate(nextMode = LESSON_MODE_VIEW) {
    if (loadedLesson) applyLesson(loadedLesson)
    else startNewLesson()
    setLessonMode(nextMode)
  }

  function requestLeaveCreate({ nextMode = LESSON_MODE_VIEW, then } = {}) {
    const finish = () => {
      abandonCreate(nextMode)
      then?.()
    }
    if (!createIsDirty) {
      finish()
      return
    }
    setLeaveCreate({ onConfirm: finish })
  }

  if (leaveGuardRef) {
    leaveGuardRef.current = {
      isDirty: () => createIsDirty,
      requestLeave: (then) => requestLeaveCreate({ then }),
    }
  }

  async function handleSave() {
    const conceptId =
      selectedNewConceptId
      || newConceptList?.conceptID
      || reviewLists.find((list) => list?.conceptID)?.conceptID
      || selectedPassages.find((item) => item?.conceptID)?.conceptID
      || null
    if (!conceptId) {
      setError('Assign at least one list before saving so the lesson has a concept.')
      return
    }
    if (!selectedNewConceptId || selectedReviewConceptIds.length === 0) {
      setError('Select a new concept and at least one review concept before saving.')
      return
    }

    const resolvedName = lessonName.trim() || generatedLessonName || null

    const lessonData = {
      slots: { listSlots, sentenceSlots, passageSlots },
      conceptSlots: {
        newConceptId: selectedNewConceptId,
        reviewConceptIds: selectedReviewConceptIds,
        whatSpellsConceptIds: selectedWhatSpellsConceptIds,
        sosConceptIds: selectedSosConceptIds,
      },
      notes: lessonNotes,
      name: resolvedName,
      snapshots: {
        lists: {
          newConcept: snapshotList(newConceptList),
          review1: snapshotList(reviewLists[0]),
          review2: snapshotList(reviewLists[1]),
          review3: snapshotList(reviewLists[2]),
        },
        sentences: selectedSentences.map(snapshotSentence).filter(Boolean),
        passages: selectedPassages.map(snapshotPassage).filter(Boolean),
        passage: snapshotPassage(selectedPassage),
        whatSpells: selectedWhatSpellsConceptIds
          .map((id) => snapshotEncodingConcept(conceptOptions.find((item) => item.id === id)))
          .filter(Boolean),
        sos: selectedSosConceptIds
          .map((id) => snapshotEncodingConcept(conceptOptions.find((item) => item.id === id)))
          .filter(Boolean),
      },
      instructor,
    }

    const wasUpdate = Boolean(loadedLesson?.id)
    setSaving(true)
    try {
      const saved = await saveStudentLesson({
        id: loadedLesson?.id,
        studentID: student.id,
        date: lessonDate,
        lessonNumber,
        conceptId,
        lessonData,
        scores: loadedLesson ? getLessonScores(loadedLesson) : {},
        comments: lessonNotes.trim() || null,
        name: resolvedName,
      })
      const lessons = await loadSavedLessons()
      const refreshed = (lessons ?? []).find((item) => item.id === saved.id)
      const nextLesson = refreshed ?? { ...saved, createdAt: saved.createdAt ?? loadedLesson?.createdAt }
      if (refreshed) {
        applyLesson(refreshed)
      } else {
        setLoadedLesson(nextLesson)
        setSnapshots(lessonData.snapshots)
      }
      setNotice(wasUpdate ? 'Lesson plan updated.' : 'Lesson plan saved.')
      setError('')
      if (!wasUpdate) {
        setShowGlobalLessons(false)
        setLessonMode(LESSON_MODE_VIEW)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lesson plan')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish({ name, summary }) {
    if (!publishLesson) return
    setPublishing(true)
    try {
      await publishLessonTemplate({
        lesson: publishLesson,
        name,
        summary,
        concepts,
      })
      setNotice('Published as a public template. Other users can browse it under Lessons → Global Lessons.')
      setPublishLesson(null)
      setError('')
      if (showGlobalLessons) await loadGlobalTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish lesson template')
    } finally {
      setPublishing(false)
    }
  }

  async function handleTemplateApplied(saved) {
    const lessons = await loadSavedLessons()
    const refreshed = (lessons ?? []).find((item) => item.id === saved?.id) ?? saved
    if (refreshed?.id) applyLesson(refreshed)
    setShowGlobalLessons(false)
    setSelectedTemplateId(null)
    setLessonMode(LESSON_MODE_VIEW)
    setNotice('Global lesson imported as a new lesson plan.')
  }

  async function applyGlobalLesson(templateId) {
    const template = globalTemplates.find((item) => item.id === templateId)
    if (!template) return
    if (!student?.id) {
      setError('Select a student before applying a global lesson.')
      return
    }
    setApplyingTemplateId(templateId)
    try {
      const saved = await applyLessonTemplate({ template, studentId: student.id })
      setError('')
      await handleTemplateApplied(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import global lesson')
    } finally {
      setApplyingTemplateId(null)
    }
  }

  function previewGlobalLesson(templateId) {
    const template = globalTemplates.find((item) => item.id === templateId)
    if (!template) return
    setSelectedTemplateId(templateId)
    applyLesson(template, { previewOnly: true })
  }

  async function handleConfirmDeleteTemplate() {
    if (!templateToDelete?.id) return
    setDeletingTemplate(true)
    try {
      await deleteLessonTemplate(templateToDelete.id)
      if (selectedTemplateId === templateToDelete.id) setSelectedTemplateId(null)
      setTemplateToDelete(null)
      await loadGlobalTemplates()
      setError('')
      setNotice('Global lesson deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete global lesson')
    } finally {
      setDeletingTemplate(false)
    }
  }

  async function handleShare(targetStudentIds) {
    if (!shareLesson) return
    setSharing(true)
    try {
      const copied = await copyLessonToStudents(shareLesson, targetStudentIds)
      setNotice(`Copied this lesson to ${copied.length} student${copied.length === 1 ? '' : 's'}.`)
      setShareLesson(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share lesson plan')
    } finally {
      setSharing(false)
    }
  }

  async function handleConfirmDeleteLesson() {
    const row = lessonToDelete
    if (!row?.id) return
    setDeletingLesson(true)
    try {
      await deleteLesson(row.id)
      if (loadedLesson?.id === row.id) startNewLesson()
      if (shareLesson?.id === row.id) setShareLesson(null)
      setLessonToDelete(null)
      setNotice('Lesson plan deleted.')
      setError('')
      await loadSavedLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lesson plan')
    } finally {
      setDeletingLesson(false)
    }
  }

  async function handleConfirmDeleteCatalogItem() {
    const item = catalogItemToDelete
    if (!item?.id) return
    setDeletingCatalogItem(true)
    try {
      if (item.kind === 'passage') {
        await deletePassage(item.id)
        setPassageSlots((prev) => {
          const next = { ...prev }
          for (const key of PASSAGE_SLOT_KEYS) {
            if (next[key] === item.id) next[key] = null
          }
          return next
        })
      } else {
        await deleteSentence(item.id)
        setSentenceSlots((prev) => {
          const next = { ...prev }
          for (const key of SENTENCE_SLOT_KEYS) {
            if (next[key] === item.id) next[key] = null
          }
          return next
        })
      }
      setCatalogItemToDelete(null)
      setNotice(item.kind === 'passage' ? 'Passage deleted.' : 'Sentence deleted.')
      setError('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${item.kind}`)
    } finally {
      setDeletingCatalogItem(false)
    }
  }

  if (!student) {
    return (
      <Typography color="text.secondary">Select a student to preview their lesson plan.</Typography>
    )
  }

  const viewingGlobal = showGlobalLessons && lessonMode === LESSON_MODE_VIEW

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gridTemplateAreas: { xs: '"preview" "work"', md: '"work preview"' },
        gap: 2,
        alignItems: 'start',
        '@media print': { display: 'block' },
      }}
    >
      <Box sx={{ gridArea: 'work', minWidth: 0, '@media print': { display: 'none' } }}>
        <Paper sx={{ p: 2 }}>
          {(notice || loading || loadingLists || loadingLessons || loadingTemplates || saving) ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {notice ? <Chip size="small" color="success" label={notice} /> : null}
              {loading || loadingLists || loadingLessons || loadingTemplates || saving ? <CircularProgress size={16} /> : null}
            </Stack>
          ) : null}

          {lessonMode === LESSON_MODE_CREATE ? (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
              sx={{
                mb: 2,
                pb: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => requestLeaveCreate()}
              >
                Back to Lessons
              </Button>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="subtitle1">
                  {loadedLesson ? 'Edit lesson' : 'Create lesson'}
                </Typography>
                <HelpTip title="Walk through each step to choose materials, then create the lesson. The preview on the right updates as you go." />
              </Stack>
            </Stack>
          ) : (
            <Tabs
              value={lessonMode}
              onChange={(_event, value) => setLessonMode(value)}
              variant="fullWidth"
              sx={{ mb: 2 }}
            >
              <Tab icon={<ViewListIcon />} iconPosition="start" label="Lessons" />
              <Tab
                icon={<GradingIcon />}
                iconPosition="start"
                label={
                  <Tooltip title="Click a plan to score it on the right.">
                    <span>Grade</span>
                  </Tooltip>
                }
              />
            </Tabs>
          )}

          {lessonMode === LESSON_MODE_CREATE ? (
            <>
              <CreateLessonStepper
                activeStep={activeStep}
                onStepChange={setActiveStep}
                lessonDate={lessonDate}
                onLessonDateChange={setLessonDate}
                conceptOptions={conceptOptions}
                selectedNewConceptId={selectedNewConceptId}
                selectedReviewConceptIds={selectedReviewConceptIds}
                selectedWhatSpellsConceptIds={selectedWhatSpellsConceptIds}
                selectedSosConceptIds={selectedSosConceptIds}
                onSelectedNewConceptChange={handleSelectedNewConceptChange}
                onSelectedReviewConceptsChange={handleSelectedReviewConceptsChange}
                onSelectedWhatSpellsChange={setSelectedWhatSpellsConceptIds}
                onSelectedSosChange={setSelectedSosConceptIds}
                lessonNotes={lessonNotes}
                onLessonNotesChange={setLessonNotes}
                lessonName={lessonName}
                onLessonNameChange={setLessonName}
                lessonNumber={lessonNumber}
                loadingCatalog={loadingCatalog}
                newConceptLists={newConceptLists}
                reviewConceptLists={reviewConceptLists}
                sentences={lessonSentences}
                passages={lessonPassages}
                loading={loading}
                loadingLists={loadingLists}
                newConceptIds={newConceptIds}
                reviewIds={reviewIds}
                sentenceIds={sentenceIds}
                passageIds={passageIds}
                onNewConceptChange={handleNewConceptChange}
                onReviewChange={handleReviewChange}
                onSentencesChange={handleSentenceChange}
                onPassagesChange={handlePassageChange}
                onCreate={handleSave}
                creating={saving}
                createLabel={loadedLesson ? 'Update lesson plan' : 'Create lesson plan'}
                canCreate={canCreate}
                onCreateList={(concept) => setListModalConcept(concept)}
                onCreateSentence={(concept) => setMultiWordModal({ kind: 'sentence', concept })}
                onCreatePassage={(concept) => setMultiWordModal({ kind: 'passage', concept })}
                onDeleteSentence={(item) => setCatalogItemToDelete({ ...item, kind: 'sentence' })}
                onDeletePassage={(item) => setCatalogItemToDelete({ ...item, kind: 'passage' })}
              />
            </>
          ) : (
            <>
              {lessonMode === LESSON_MODE_VIEW ? (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mb: 1.5, width: '100%' }}
                >
                  <Tooltip title="Create a new lesson plan for this student.">
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleStartCreate}
                      sx={{ flexShrink: 0 }}
                    >
                      Create lesson
                    </Button>
                  </Tooltip>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={showGlobalLessons ? 'global' : 'mine'}
                    onChange={(_event, value) => {
                      if (!value) return
                      setShowGlobalLessons(value === 'global')
                    }}
                    sx={{
                      ml: 'auto',
                      flexShrink: 0,
                      '& .MuiToggleButton-root': {
                        px: 1.75,
                        fontWeight: 700,
                      },
                    }}
                  >
                    <ToggleButton
                      value="mine"
                      aria-label="My lessons"
                      sx={{
                        '&.Mui-selected, &.Mui-selected:hover': {
                          bgcolor: `${BRAND.navy} !important`,
                          color: '#ffffff !important',
                          borderColor: `${BRAND.navy} !important`,
                        },
                      }}
                    >
                      <Tooltip title="Viewing this student’s lessons. Click a plan to preview it.">
                        <Box component="span">My lessons</Box>
                      </Tooltip>
                    </ToggleButton>
                    <ToggleButton
                      value="global"
                      aria-label="Global lessons"
                      sx={{
                        '&.Mui-selected, &.Mui-selected:hover': {
                          bgcolor: `${BRAND.gold} !important`,
                          color: `${BRAND.navyDark} !important`,
                          borderColor: `${BRAND.goldDark} !important`,
                        },
                      }}
                    >
                      <Tooltip title="Viewing global lessons. Import copies one onto this student.">
                        <Box component="span">Global lessons</Box>
                      </Tooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
              ) : null}
              <Box
                sx={{
                  height: { xs: 360, md: 'calc(100vh - 320px)' },
                  minHeight: 280,
                  width: '100%',
                  borderRadius: 1,
                  border: 1,
                  borderColor: viewingGlobal ? BRAND.goldDark : 'divider',
                  bgcolor: viewingGlobal ? BRAND.goldBg : 'background.paper',
                  overflow: 'hidden',
                }}
              >
                <DataGridPro
                  key={viewingGlobal ? 'global' : 'student'}
                  rows={viewingGlobal ? globalLessonRows : savedLessonRows}
                  columns={viewingGlobal ? globalColumns : viewColumns}
                  getRowId={(row) => row.id}
                  onRowClick={(params) => {
                    if (viewingGlobal) {
                      previewGlobalLesson(params.id)
                      return
                    }
                    const lesson = studentLessons.find((item) => item.id === params.id)
                    if (lesson) applyLesson(lesson)
                  }}
                  rowSelectionModel={viewingGlobal ? globalSelectionModel : lessonSelectionModel}
                  getRowClassName={(params) => {
                    const selectedId = viewingGlobal ? selectedTemplateId : loadedLesson?.id
                    const selected = params.id === selectedId ? 'Mui-selected' : ''
                    const grade = !viewingGlobal && params.row.gradeBand
                      ? `grade-row-${params.row.gradeBand}`
                      : ''
                    return [grade, selected].filter(Boolean).join(' ')
                  }}
                  loading={viewingGlobal ? loadingTemplates : loadingLessons}
                  pagination
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    sorting: viewingGlobal
                      ? { sortModel: [{ field: 'name', sort: 'asc' }] }
                      : { sortModel: [{ field: 'lessonDateLabel', sort: 'desc' }] },
                    pinnedColumns: { right: ['actions'] },
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
                    border: 0,
                    bgcolor: 'transparent',
                    '& .MuiDataGrid-overlayWrapper': { bgcolor: 'transparent' },
                    ...(viewingGlobal ? globalLessonGridSx : gradeRowSx),
                  }}
                  localeText={{
                    noRowsLabel:
                      lessonMode === LESSON_MODE_GRADE
                        ? 'No saved lesson plans yet. Create one on Lessons, then grade it here.'
                        : showGlobalLessons
                          ? 'No global lessons yet. Publish one from a saved plan.'
                          : 'No saved lesson plans yet. Click Create lesson to make one.',
                  }}
                />
              </Box>
            </>
          )}
        </Paper>
      </Box>

      <Box
        sx={{
          gridArea: 'preview',
          position: { md: 'sticky' },
          top: { md: 88 },
          maxHeight: { md: 'calc(100vh - 104px)' },
          overflow: { md: 'auto' },
          bgcolor: lessonMode === LESSON_MODE_GRADE ? 'transparent' : 'background.default',
          py: lessonMode === LESSON_MODE_GRADE ? 0 : 1.5,
          px: lessonMode === LESSON_MODE_GRADE ? 0 : { xs: 1, sm: 1.5 },
          borderRadius: 1,
          '@media print': {
            position: 'static',
            maxHeight: 'none',
            overflow: 'visible',
            bgcolor: 'transparent',
            p: 0,
          },
        }}
      >
        {lessonMode === LESSON_MODE_GRADE ? (
          <DataEntryPanel
            student={student}
            lesson={loadedLesson}
            savedLessons={studentLessons}
            setError={setError}
            onLessonsChanged={loadSavedLessons}
            onLessonUpdated={(next) => {
              if (next) setLoadedLesson(next)
            }}
          />
        ) : (
          <>
            <Stack
              direction="row"
              spacing={1}
              justifyContent="flex-end"
              sx={{ mb: 1, '@media print': { display: 'none' } }}
            >
              {showGlobalLessons && selectedTemplateId && lessonMode === LESSON_MODE_VIEW ? (
                <Button
                  variant="contained"
                  disabled={applyingTemplateId === selectedTemplateId}
                  onClick={() => void applyGlobalLesson(selectedTemplateId)}
                >
                  {applyingTemplateId === selectedTemplateId ? 'Importing…' : 'Import'}
                </Button>
              ) : null}
              {loadedLesson && lessonMode === LESSON_MODE_VIEW && !showGlobalLessons ? (
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setLessonMode(LESSON_MODE_CREATE)}
                >
                  Edit
                </Button>
              ) : null}
              {loadedLesson && !showGlobalLessons ? (
                <Button
                  color="error"
                  variant="outlined"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() =>
                    setLessonToDelete({
                      id: loadedLesson.id,
                      name: lessonDisplayName || 'this lesson',
                    })
                  }
                  disabled={deletingLesson}
                >
                  Delete
                </Button>
              ) : null}
              {loadedLesson && !showGlobalLessons ? (
                <Button
                  variant="outlined"
                  startIcon={<PublicIcon />}
                  onClick={() => setPublishLesson(loadedLesson)}
                >
                  Publish template
                </Button>
              ) : null}
              <Button
                variant="contained"
                startIcon={<PrintIcon />}
                onClick={handlePrint}
                disabled={loading || previewLoading}
              >
                Print Lesson Plan
              </Button>
            </Stack>
            <Box sx={{ position: 'relative', minHeight: previewLoading ? 360 : 0 }}>
              {previewLoading ? (
                <Stack
                  spacing={1.5}
                  alignItems="center"
                  justifyContent="center"
                  sx={{
                    minHeight: 360,
                    py: 6,
                    '@media print': { display: 'none' },
                  }}
                >
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary">
                    Loading lesson plan…
                  </Typography>
                </Stack>
              ) : (
                <LessonPlanTemplate
                  ref={printRef}
                  student={payload?.student ?? student}
                  reviewLists={reviewLists}
                  newConceptList={newConceptList}
                  sentences={selectedSentences}
                  passages={selectedPassages}
                  passage={selectedPassage}
                  whatSpellsConcepts={whatSpellsConcepts}
                  sosConcepts={sosConcepts}
                  date={dateLabel}
                  lessonNumber={lessonNumber}
                  lessonName={lessonDisplayName}
                  instructor={instructor}
                  soapNotes={lessonNotes}
                />
              )}
            </Box>
          </>
        )}
      </Box>
      <ShareLessonDialog
        open={Boolean(shareLesson)}
        lesson={shareLesson}
        students={students}
        groups={groups}
        currentStudentId={student.id}
        sharing={sharing}
        onClose={() => setShareLesson(null)}
        onShare={(ids) => void handleShare(ids)}
      />
      <PublishLessonTemplateDialog
        open={Boolean(publishLesson)}
        lesson={publishLesson}
        publishing={publishing}
        onClose={() => !publishing && setPublishLesson(null)}
        onPublish={(payload) => void handlePublish(payload)}
      />
      {listModalConcept ? (
        <CreateWordListModal
          open
          student={student}
          concept={listModalConcept}
          concepts={concepts}
          words={wordsByConceptId?.get(listModalConcept.id) ?? []}
          studentLists={studentLists}
          wordsByConceptId={wordsByConceptId}
          setError={setError}
          onClose={() => setListModalConcept(null)}
          onCreated={(created) => void handleListCreated(created)}
        />
      ) : null}
      {multiWordModal ? (
        <CreateMultiWordModal
          open
          kind={multiWordModal.kind}
          student={student}
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          focusConcept={multiWordModal.concept}
          lessonConcepts={lessonConceptsForAndrea}
          lists={lists}
          setError={setError}
          onClose={() => setMultiWordModal(null)}
          onCreated={(payload) => void handleMultiWordCreated(payload)}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={Boolean(lessonToDelete)}
        title="Are you sure?"
        description={
          lessonToDelete
            ? `Delete “${lessonToDelete.name || 'this lesson'}”? This permanently removes the lesson plan and its scores. Lists, sentences, and passages stay in the catalog.`
            : ''
        }
        confirmLabel="Delete lesson"
        deleting={deletingLesson}
        onClose={() => !deletingLesson && setLessonToDelete(null)}
        onConfirm={() => void handleConfirmDeleteLesson()}
      />
      <Dialog
        open={Boolean(leaveCreate)}
        onClose={() => setLeaveCreate(null)}
        aria-labelledby="leave-create-title"
      >
        <DialogTitle id="leave-create-title">Are you sure?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have an unsaved lesson plan. If you leave now, this work will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveCreate(null)} autoFocus>
            Stay
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const finish = leaveCreate?.onConfirm
              setLeaveCreate(null)
              finish?.()
            }}
          >
            Leave without saving
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDeleteDialog
        open={Boolean(catalogItemToDelete)}
        title={catalogItemToDelete?.kind === 'passage' ? 'Delete this passage?' : 'Delete this sentence?'}
        description={
          catalogItemToDelete
            ? `Delete ${
                catalogItemToDelete.kind === 'passage'
                  ? `“${catalogItemToDelete.title || 'this passage'}”`
                  : 'this sentence'
              }? This cannot be undone.`
            : ''
        }
        confirmLabel={catalogItemToDelete?.kind === 'passage' ? 'Delete passage' : 'Delete sentence'}
        deleting={deletingCatalogItem}
        onClose={() => !deletingCatalogItem && setCatalogItemToDelete(null)}
        onConfirm={() => void handleConfirmDeleteCatalogItem()}
      />
      <ConfirmDeleteDialog
        open={Boolean(templateToDelete)}
        title="Delete this global lesson?"
        description={
          templateToDelete
            ? `Delete “${templateToDelete.name}”? Student lesson plans that already used it are not affected.`
            : ''
        }
        confirmLabel="Delete global lesson"
        deleting={deletingTemplate}
        onClose={() => !deletingTemplate && setTemplateToDelete(null)}
        onConfirm={() => void handleConfirmDeleteTemplate()}
      />
    </Box>
  )
}
