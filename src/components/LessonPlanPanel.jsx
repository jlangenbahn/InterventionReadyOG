import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import AddIcon from '@mui/icons-material/Add'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import LessonPlanTemplate from './LessonPlanTemplate'
import CreateLessonStepper from './CreateLessonStepper'
import {
  fetchStudentLessonPlan,
  fetchStudentLessons,
  nextLessonNumber,
  parseLessonData,
  resolveListWords,
  saveStudentLesson,
  studentDisplayName,
} from '../lib/fetchStudentLessonPlan'

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
  .lesson-plan-page-2 {
    break-before: page;
    page-break-before: always;
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

function formatCreatedDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return formatLessonDate(value)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
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
  }
}

function snapshotPassage(passage) {
  if (!passage) return null
  return {
    id: passage.id,
    title: passage.title || 'Untitled passage',
    text: passage.text || '',
    concept: passage.concept || '',
    conceptID: passage.conceptID || null,
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
  { field: 'lessonDateLabel', headerName: 'Lesson date', width: 140 },
  { field: 'createdDateLabel', headerName: 'Created', width: 140 },
  { field: 'newConcept', headerName: 'New concept', flex: 1, minWidth: 160 },
]

export default function LessonPlanPanel({
  student,
  concepts = [],
  studentLists = [],
  loadingLists = false,
  wordsByConceptId,
  instructor,
  setError,
}) {
  const printRef = useRef(null)
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
  }, [student?.id])

  const wordLookup = useMemo(() => buildWordLookup(wordsByConceptId), [wordsByConceptId])

  const conceptById = useMemo(
    () => new Map((concepts ?? []).map((concept) => [concept.id, concept])),
    [concepts],
  )

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
        .map((sentence) => ({
          id: sentence.id,
          text: sentence.text || '',
          wordCount: sentence.wordCount ?? 0,
        })),
    [payload?.sentences],
  )

  const passages = useMemo(
    () =>
      (payload?.passages ?? [])
        .filter((passage) => passage?.id)
        .map((passage) => ({
          id: passage.id,
          title: passage.title || 'Untitled passage',
          text: passage.text || '',
          concept: conceptById.get(passage.conceptID)?.concept || '',
          conceptID: passage.conceptID || null,
          wordCount: passage.wordCount ?? 0,
        })),
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

  const savedLessonRows = useMemo(
    () =>
      [...savedLessons]
        .sort((a, b) => {
          const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''))
          if (byDate) return byDate
          return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
        })
        .map((lesson) => {
          const data = parseLessonData(lesson.lessonData)
          const newConcept =
            data?.snapshots?.lists?.newConcept?.name
            || data?.snapshots?.lists?.newConcept?.concept
            || ''
          return {
            id: lesson.id,
            lessonNumber: lesson.lessonNumber ?? '',
            date: lesson.date,
            createdAt: lesson.createdAt,
            lessonDateLabel: formatLessonDate(lesson.date) || '—',
            createdDateLabel: formatCreatedDate(lesson.createdAt) || '—',
            newConcept: newConcept || '—',
          }
        }),
    [savedLessons],
  )

  function listForSlot(key) {
    const id = listSlots[key]
    if (!id) return null
    const live = listsById.get(id)
    if (live) return live
    const snap = snapshots?.lists?.[key]
    return snap?.id === id ? snap : null
  }

  function sentenceForSlot(key) {
    const id = sentenceSlots[key]
    if (!id) return null
    const live = sentencesById.get(id)
    if (live) return live
    const snaps = snapshots?.sentences
    const snap = Array.isArray(snaps)
      ? snaps.find((item) => item?.id === id)
      : snaps?.[key]
    return snap?.id === id ? snap : null
  }

  function passageForSlot(key) {
    const id = passageSlots[key]
    if (!id) return null
    const live = passagesById.get(id)
    if (live) return live
    const snap = snapshots?.passage
    if (snap?.id === id) return snap
    const snaps = snapshots?.passages
    if (Array.isArray(snaps)) {
      const fromArray = snaps.find((item) => item?.id === id)
      return fromArray?.id === id ? fromArray : null
    }
    return null
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
  const canCreate = Boolean(lessonDate) && Boolean(newConceptList)

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

  function handleNew() {
    setListSlots({ ...EMPTY_LIST_SLOTS })
    setSentenceSlots({ ...EMPTY_SENTENCE_SLOTS })
    setPassageSlots({ ...EMPTY_PASSAGE_SLOTS })
    setLoadedLesson(null)
    setSnapshots(null)
    setLessonDate(todayIso())
    setNotice('')
    setError('')
    setActiveStep(0)
  }

  function applyLesson(lesson) {
    const data = parseLessonData(lesson?.lessonData)
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
    setLoadedLesson(lesson)
    setLessonDate(toIsoDate(lesson?.date))
    setNotice('')
    setError('')
    setActiveStep(0)
  }

  async function handleSave() {
    const conceptId =
      newConceptList?.conceptID
      || reviewLists.find((list) => list?.conceptID)?.conceptID
      || selectedPassages.find((item) => item?.conceptID)?.conceptID
      || null
    if (!conceptId) {
      setError('Assign at least one list before saving so the lesson has a concept.')
      return
    }

    const lessonData = {
      slots: { listSlots, sentenceSlots, passageSlots },
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

    setSaving(true)
    try {
      const saved = await saveStudentLesson({
        id: loadedLesson?.id,
        studentID: student.id,
        date: lessonDate,
        lessonNumber,
        conceptId,
        lessonData,
      })
      const lessons = await loadSavedLessons()
      const refreshed = (lessons ?? []).find((item) => item.id === saved.id)
      setLoadedLesson(refreshed ?? { ...saved, createdAt: saved.createdAt ?? loadedLesson?.createdAt })
      setSnapshots(lessonData.snapshots)
      setNotice(loadedLesson?.id ? 'Lesson plan updated.' : 'Lesson plan saved.')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lesson plan')
    } finally {
      setSaving(false)
    }
  }

  if (!student) {
    return (
      <Typography color="text.secondary">Select a student to preview their lesson plan.</Typography>
    )
  }

  return (
    <Box>
      <Paper
        sx={{
          p: 2,
          mb: 2,
          display: 'flex',
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
          '@media print': { display: 'none' },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h6">Lesson Plan</Typography>
          <Chip size="small" label={studentDisplayName(student)} />
          {lists.length ? (
            <Chip size="small" variant="outlined" label={`${lists.length} lists`} />
          ) : null}
          {loadedLesson ? (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`Created ${formatCreatedDate(loadedLesson.createdAt)}`}
            />
          ) : (
            <Chip size="small" variant="outlined" label="Unsaved" />
          )}
          {notice ? <Chip size="small" color="success" label={notice} /> : null}
          {loading || loadingLists || loadingLessons || saving ? <CircularProgress size={16} /> : null}
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleNew} disabled={saving}>
            New
          </Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            disabled={loading}
          >
            Print Lesson Plan
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2, '@media print': { display: 'none' } }}>
        <Typography variant="subtitle1">Saved lesson plans</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Click a row to load that plan into the stepper. Lesson date is when it is taught; Created is when you saved it.
        </Typography>
        <Box sx={{ height: 280, width: '100%' }}>
          <DataGridPro
            rows={savedLessonRows}
            columns={SAVED_LESSON_COLUMNS}
            getRowId={(row) => row.id}
            onRowClick={(params) => {
              const lesson = savedLessons.find((item) => item.id === params.id)
              if (lesson) applyLesson(lesson)
            }}
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
              noRowsLabel: 'No saved lesson plans yet. Finish the stepper and create a lesson.',
            }}
          />
        </Box>
      </Paper>

      <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(420px, 560px) minmax(340px, 1fr)' },
            gap: 2,
            alignItems: 'start',
            '@media print': { display: 'block' },
          }}
        >
          <Box
            sx={{
              position: { lg: 'sticky' },
              top: { lg: 88 },
              maxHeight: { lg: 'calc(100vh - 104px)' },
              overflow: { lg: 'auto' },
              bgcolor: '#f5f5f6',
              py: 1.5,
              px: { xs: 1, sm: 1.5 },
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
              instructor={instructor}
            />
          </Box>

          <Box sx={{ minWidth: 0, '@media print': { display: 'none' } }}>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Create a lesson plan
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Walk through each step to choose materials, then create the lesson. Click New to start
              another plan.
            </Typography>
            <CreateLessonStepper
              activeStep={activeStep}
              onStepChange={setActiveStep}
              lessonDate={lessonDate}
              onLessonDateChange={setLessonDate}
              lists={lists}
              sentences={sentences}
              passages={passages}
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
            />
          </Box>
        </Box>
    </Box>
  )
}
