import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import AddIcon from '@mui/icons-material/Add'
import ViewListIcon from '@mui/icons-material/ViewList'
import GradingIcon from '@mui/icons-material/Grading'
import EditIcon from '@mui/icons-material/Edit'
import ShareIcon from '@mui/icons-material/Share'
import PublicIcon from '@mui/icons-material/Public'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import LessonPlanTemplate from './LessonPlanTemplate'
import CreateLessonStepper from './CreateLessonStepper'
import CreateWordListModal from './CreateWordListModal'
import CreateMultiWordModal from './CreateMultiWordModal'
import DataEntryPanel from './DataEntryPanel'
import ShareLessonDialog from './ShareLessonDialog'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import {
  fetchStudentLessonPlan,
  fetchStudentLessons,
  nextLessonNumber,
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
} from '../lib/fetchStudentLessonPlan'
import { deleteLesson } from '../lib/crudRecords'
import { publishLessonTemplate } from '../lib/lessonTemplates'
import PublishLessonTemplateDialog from './PublishLessonTemplateDialog'
import LessonTemplateGallery from './LessonTemplateGallery'

const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']

const PRINT_PAGE_STYLE = `
  @page { size: 8.5in 11in; margin: 0.5in; }
  html, body {
    background: transparent !important;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .lesson-plan-print-root {
    box-shadow: none !important;
    padding: 0 !important;
    max-width: 100% !important;
    background: transparent !important;
  }
  .lesson-plan-page {
    box-shadow: none !important;
    padding: 0 !important;
    max-width: 100% !important;
    border-radius: 0 !important;
  }
  .lesson-plan-page-2,
  .lesson-plan-page-3,
  .lesson-plan-page-4 {
    break-before: page;
    page-break-before: always;
  }
  .lesson-plan-reader-page {
    background: #ffffff !important;
    color: #333333 !important;
    font-family: "Century Gothic", "Comic Sans MS", Andika, sans-serif !important;
    font-size: 24px !important;
    font-weight: 400 !important;
    font-style: normal !important;
    line-height: 1.6 !important;
    letter-spacing: 0.04em !important;
    text-align: left !important;
    text-transform: none !important;
    text-decoration: none !important;
  }
  .lesson-plan-page:not(.lesson-plan-reader-page) {
    font-family: "Century Gothic", "Comic Sans MS", Andika, sans-serif !important;
    font-size: 11px !important;
    letter-spacing: -0.02em !important;
    line-height: 1.25 !important;
    color: #1a2332 !important;
  }
  .lesson-plan-screen-only {
    display: none !important;
  }
`

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
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day))
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

const SAVED_LESSON_COLUMNS = [
  {
    field: 'lessonNumber',
    headerName: 'Lesson #',
    type: 'number',
    width: 90,
    align: 'left',
    headerAlign: 'left',
  },
  { field: 'lessonDateLabel', headerName: 'Lesson date', width: 130 },
  { field: 'name', headerName: 'Lesson', flex: 1.2, minWidth: 180 },
  { field: 'newConcept', headerName: 'New concept', flex: 1, minWidth: 140 },
]

const GRADE_LESSON_COLUMNS = [
  ...SAVED_LESSON_COLUMNS,
  { field: 'scoreLabel', headerName: 'Score', width: 130 },
]

const LESSON_MODE_VIEW = 0
const LESSON_MODE_GRADE = 1
const LESSON_MODE_CREATE = 2
const LESSON_MODE_TEMPLATES = 3

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
}) {
  const printRef = useRef(null)
  const lastGeneratedNameRef = useRef('')
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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Lesson Plan – ${studentDisplayName(student)}`,
    pageStyle: PRINT_PAGE_STYLE,
  })

  const load = useCallback(async () => {
    if (!student?.id) {
      setPayload(null)
      return
    }
    setLoading(true)
    try {
      const data = await fetchStudentLessonPlan(student.id)
      setPayload(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lesson plan')
    } finally {
      setLoading(false)
    }
  }, [student?.id, setError])

  const loadSavedLessons = useCallback(async () => {
    if (!student?.id) {
      setSavedLessons([])
      return []
    }
    setLoadingLessons(true)
    try {
      const lessons = await fetchStudentLessons(student.id)
      setSavedLessons(lessons)
      return lessons
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved lesson plans')
      return []
    } finally {
      setLoadingLessons(false)
    }
  }, [student?.id, setError])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadSavedLessons()
  }, [loadSavedLessons])

  useEffect(() => {
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
    setLessonNotes('')
    setLessonName('')
    lastGeneratedNameRef.current = ''
    setShareLesson(null)
    setLessonToDelete(null)
    setListModalConcept(null)
    setMultiWordModal(null)
    setPreviewLoading(false)
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
        }
      })
      .sort((a, b) => {
        if (a.inScope !== b.inScope) return a.inScope ? -1 : 1
        const seqA = a.sequence ?? Number.POSITIVE_INFINITY
        const seqB = b.sequence ?? Number.POSITIVE_INFINITY
        if (seqA !== seqB) return seqA - seqB
        return a.concept.localeCompare(b.concept)
      })
  }, [concepts, student?.scopeAndSequence, payload?.student?.scopeAndSequence])

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

  const savedLessonRows = useMemo(
    () =>
      [...savedLessons]
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
          const scoreLabel = formatScoreTally(tallyScores(materials.allKeys, getLessonScores(lesson)))
          return {
            id: lesson.id,
            lessonNumber: lesson.lessonNumber ?? '',
            date: lesson.date,
            createdAt: lesson.createdAt,
            lessonDateLabel: formatLessonDate(lesson.date) || '—',
            newConcept: newConcept || '—',
            name: formatLessonDisplayName(customName, newConcept, lesson.lessonNumber) || '—',
            scoreLabel,
          }
        }),
    [savedLessons],
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
      width: 168,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Stack direction="row" spacing={0}>
          <IconButton
            size="small"
            aria-label={`Edit ${params.row.name || 'lesson'}`}
            onClick={(event) => {
              event.stopPropagation()
              const lesson = savedLessons.find((item) => item.id === params.id)
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
              const lesson = savedLessons.find((item) => item.id === params.id)
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
              const lesson = savedLessons.find((item) => item.id === params.id)
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
    [savedLessons],
  )

  const viewColumns = useMemo(
    () => [...SAVED_LESSON_COLUMNS, lessonActionColumn],
    [lessonActionColumn],
  )

  const gradeColumns = useMemo(
    () => [...GRADE_LESSON_COLUMNS, lessonActionColumn],
    [lessonActionColumn],
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

  const newConceptIds = listSlots.newConcept ? [listSlots.newConcept] : []
  const reviewIds = idsFromSlots(listSlots, REVIEW_SLOT_KEYS)
  const sentenceIds = idsFromSlots(sentenceSlots, SENTENCE_SLOT_KEYS)
  const passageIds = idsFromSlots(passageSlots, PASSAGE_SLOT_KEYS)

  const lessonNumber = loadedLesson?.lessonNumber ?? nextLessonNumber(savedLessons)
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
    const nextId = ids[0] ?? null
    const remainingReviews = idsFromSlots(listSlots, REVIEW_SLOT_KEYS).filter((id) => id !== nextId)
    setListSlots({
      newConcept: nextId,
      ...slotsFromIds(REVIEW_SLOT_KEYS, remainingReviews),
    })
  }

  function handleReviewChange(ids) {
    setListSlots((prev) => ({
      ...prev,
      ...slotsFromIds(REVIEW_SLOT_KEYS, ids),
    }))
  }

  function handleSentenceChange(ids) {
    setSentenceSlots(slotsFromIds(SENTENCE_SLOT_KEYS, ids))
  }

  function handlePassageChange(ids) {
    setPassageSlots(slotsFromIds(PASSAGE_SLOT_KEYS, ids))
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
    setLessonNotes('')
    setLessonName('')
    lastGeneratedNameRef.current = ''
    setPreviewLoading(false)
  }

  function applyLesson(lesson, { previewOnly = false } = {}) {
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
    setLessonNotes(data.notes ?? lesson?.comments ?? '')
    const loadedName = data.name || lesson?.name || ''
    const loadedConcept =
      data?.snapshots?.lists?.newConcept?.concept
      || data?.snapshots?.lists?.newConcept?.name
      || conceptById.get(inferredNewConceptId)?.concept
      || ''
    lastGeneratedNameRef.current = defaultLessonPlanName(lesson?.lessonNumber, loadedConcept)
    setLessonName(loadedName)
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
      setNotice('Published as a public template. Other users can browse it under Lesson Plan → Global Template.')
      setPublishLesson(null)
      setError('')
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
    setLessonMode(LESSON_MODE_VIEW)
    setNotice('Template applied as a new lesson plan.')
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

  if (!student) {
    return (
      <Typography color="text.secondary">Select a student to preview their lesson plan.</Typography>
    )
  }

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
          {(notice || loading || loadingLists || loadingLessons || saving) ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {notice ? <Chip size="small" color="success" label={notice} /> : null}
              {loading || loadingLists || loadingLessons || saving ? <CircularProgress size={16} /> : null}
            </Stack>
          ) : null}

          <Tabs
            value={lessonMode}
            onChange={(_event, value) => {
              setLessonMode(value)
              if (value === LESSON_MODE_CREATE) startNewLesson()
            }}
            variant="fullWidth"
            sx={{
              mb: 2,
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': { minHeight: 48, minWidth: 0, px: { xs: 0.5, sm: 1 } },
            }}
          >
            <Tab icon={<ViewListIcon />} iconPosition="start" label="View" />
            <Tab icon={<GradingIcon />} iconPosition="start" label="Grade" />
            <Tab icon={<AddIcon />} iconPosition="start" label="Create" />
            <Tab icon={<PublicIcon />} iconPosition="start" label="Global Template" />
          </Tabs>

          {lessonMode === LESSON_MODE_CREATE ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Walk through each step to choose materials, then create the lesson. The preview on
                the right updates as you go.
              </Typography>
              <CreateLessonStepper
                activeStep={activeStep}
                onStepChange={setActiveStep}
                lessonDate={lessonDate}
                onLessonDateChange={setLessonDate}
                conceptOptions={conceptOptions}
                selectedNewConceptId={selectedNewConceptId}
                selectedReviewConceptIds={selectedReviewConceptIds}
                onSelectedNewConceptChange={handleSelectedNewConceptChange}
                onSelectedReviewConceptsChange={handleSelectedReviewConceptsChange}
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
              />
            </>
          ) : lessonMode === LESSON_MODE_TEMPLATES ? (
            <LessonTemplateGallery
              student={student}
              concepts={concepts}
              username={username}
              setError={setError}
              onSelect={(template) => applyLesson(template, { previewOnly: true })}
              onApplied={(saved) => void handleTemplateApplied(saved)}
            />
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {lessonMode === LESSON_MODE_GRADE
                  ? 'Select a saved plan to score lists, sentences, and passages on the right. Lesson scores stay at the bottom of that panel.'
                  : 'Select a saved plan to preview it on the right. Edit opens it so you can change materials. Share copies a plan onto your other students. Publish posts a student-free template for every user. Delete removes it from this student.'}
              </Typography>
              <Box sx={{ height: { xs: 360, md: 'calc(100vh - 320px)' }, minHeight: 280, width: '100%' }}>
                <DataGridPro
                  rows={savedLessonRows}
                  columns={
                    lessonMode === LESSON_MODE_GRADE
                      ? gradeColumns
                      : viewColumns
                  }
                  getRowId={(row) => row.id}
                  onRowClick={(params) => {
                    const lesson = savedLessons.find((item) => item.id === params.id)
                    if (lesson) applyLesson(lesson)
                  }}
                  rowSelectionModel={lessonSelectionModel}
                  getRowClassName={(params) => (params.id === loadedLesson?.id ? 'Mui-selected' : '')}
                  loading={loadingLessons}
                  pagination
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    sorting: { sortModel: [{ field: 'lessonDateLabel', sort: 'desc' }] },
                  }}
                  slots={{ toolbar: GridToolbar }}
                  slotProps={{
                    toolbar: {
                      showQuickFilter: true,
                      quickFilterProps: { debounceMs: 300 },
                    },
                  }}
                  density="compact"
                  localeText={{
                    noRowsLabel:
                      lessonMode === LESSON_MODE_GRADE
                        ? 'No saved lesson plans yet. Switch to Create to make one, then grade it here.'
                        : 'No saved lesson plans yet. Switch to Create to make one.',
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
            savedLessons={savedLessons}
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
              {loadedLesson && lessonMode === LESSON_MODE_VIEW ? (
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setLessonMode(LESSON_MODE_CREATE)}
                >
                  Edit
                </Button>
              ) : null}
              {loadedLesson && lessonMode !== LESSON_MODE_TEMPLATES ? (
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
              {loadedLesson && lessonMode !== LESSON_MODE_TEMPLATES ? (
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
          words={wordsByConceptId?.get(listModalConcept.id) ?? []}
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
    </Box>
  )
}
