import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import LessonPlanTemplate from './LessonPlanTemplate'
import MergeSelectionCard from './MergeSelectionCard'
import {
  fetchStudentLessonPlan,
  nextLessonNumber,
  resolveListWords,
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
}

const EMPTY_PASSAGE_SLOTS = {
  passage1: null,
}

const LIST_SLOTS = [
  { key: 'newConcept', tag: '<<NEW_CONCEPT_LIST_WORDS>>', shortLabel: 'New concept' },
  { key: 'review1', tag: '<<REVIEW_LIST_WORDS_1>>', shortLabel: 'Review 1' },
  { key: 'review2', tag: '<<REVIEW_LIST_WORDS_2>>', shortLabel: 'Review 2' },
  { key: 'review3', tag: '<<REVIEW_LIST_WORDS_3>>', shortLabel: 'Review 3' },
]

const SENTENCE_SLOTS = [
  { key: 'sentence1', tag: '<<SENTENCE_1>>', shortLabel: 'Sentence 1' },
  { key: 'sentence2', tag: '<<SENTENCE_2>>', shortLabel: 'Sentence 2' },
]

const PASSAGE_SLOTS = [
  { key: 'passage1', tag: '<<PASSAGE_1>>', shortLabel: 'Passage' },
]

const LIST_COLUMNS = [
  { field: 'name', headerName: 'List', flex: 1.2, minWidth: 90 },
  { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 90 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 70,
    align: 'left',
    headerAlign: 'left',
  },
]

const SENTENCE_COLUMNS = [
  { field: 'text', headerName: 'Sentence', flex: 2, minWidth: 140 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 70,
    align: 'left',
    headerAlign: 'left',
  },
]

const PASSAGE_COLUMNS = [
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 90 },
  { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 90 },
  { field: 'text', headerName: 'Text', flex: 1.4, minWidth: 120 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 70,
    align: 'left',
    headerAlign: 'left',
  },
]

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
    wordCount: words.length,
    words,
  }
}

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

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

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setListSlots({ ...EMPTY_LIST_SLOTS })
    setSentenceSlots({ ...EMPTY_SENTENCE_SLOTS })
    setPassageSlots({ ...EMPTY_PASSAGE_SLOTS })
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

  const reviewLists = [
    listsById.get(listSlots.review1) ?? null,
    listsById.get(listSlots.review2) ?? null,
    listsById.get(listSlots.review3) ?? null,
  ]
  const newConceptList = listsById.get(listSlots.newConcept) ?? null
  const selectedSentences = [
    sentencesById.get(sentenceSlots.sentence1) ?? null,
    sentencesById.get(sentenceSlots.sentence2) ?? null,
  ]
  const selectedPassage = passagesById.get(passageSlots.passage1) ?? null

  const lessonNumber = nextLessonNumber(payload?.lessons)
  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    [],
  )

  const hasAnyMaterials = lists.length || sentences.length || passages.length
  const hasEmptySlots =
    !listSlots.newConcept ||
    !listSlots.review1 ||
    !listSlots.review2 ||
    !listSlots.review3 ||
    !sentenceSlots.sentence1 ||
    !sentenceSlots.sentence2 ||
    !passageSlots.passage1

  function assignList(slotKey, id) {
    setListSlots((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey] === id ? null : id,
    }))
  }

  function assignSentence(slotKey, id) {
    setSentenceSlots((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey] === id ? null : id,
    }))
  }

  function assignPassage(slotKey, id) {
    setPassageSlots((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey] === id ? null : id,
    }))
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
          {loading || loadingLists ? <CircularProgress size={16} /> : null}
        </Stack>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          disabled={loading}
        >
          Print Lesson Plan
        </Button>
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
              passage={selectedPassage}
              date={dateLabel}
              lessonNumber={lessonNumber}
              instructor={instructor}
            />
          </Box>

          <Box sx={{ minWidth: 0, '@media print': { display: 'none' } }}>
            {!hasAnyMaterials ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                No student lists, sentences, or passages are assigned yet. Red placeholders print until
                related records are saved on this student.
              </Alert>
            ) : hasEmptySlots ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Select a row, then click a merge field to place it in the lesson plan. Unassigned
                fields print as red placeholders.
              </Alert>
            ) : null}

            <MergeSelectionCard
              key={`lists-${student.id}`}
              title={`List Selection (${lists.length})`}
              helperText="Select a list, then click a merge field to place its words in the document."
              slots={LIST_SLOTS}
              assignments={listSlots}
              items={lists}
              getItemLabel={(list) => list.name || 'Untitled list'}
              columns={LIST_COLUMNS}
              noRowsLabel="No lists yet. Create lists on the Concepts & Lists tab."
              loading={loading || loadingLists}
              onAssign={assignList}
              onClear={(key) => setListSlots((prev) => ({ ...prev, [key]: null }))}
            />

            <MergeSelectionCard
              key={`sentences-${student.id}`}
              title={`Sentence Selection (${sentences.length})`}
              helperText="Select a sentence, then click a merge field to place it in Dictation."
              slots={SENTENCE_SLOTS}
              assignments={sentenceSlots}
              items={sentences}
              getItemLabel={(sentence) => truncate(sentence.text, 60) || 'Untitled sentence'}
              columns={SENTENCE_COLUMNS}
              noRowsLabel="No sentences yet for this student."
              loading={loading}
              onAssign={assignSentence}
              onClear={(key) => setSentenceSlots((prev) => ({ ...prev, [key]: null }))}
            />

            <MergeSelectionCard
              key={`passages-${student.id}`}
              title={`Passage Selection (${passages.length})`}
              helperText="Select a passage, then click the merge field to place it in Oral Reading."
              slots={PASSAGE_SLOTS}
              assignments={passageSlots}
              items={passages}
              getItemLabel={(passage) => passage.title || truncate(passage.text, 60) || 'Untitled passage'}
              columns={PASSAGE_COLUMNS}
              noRowsLabel="No passages yet for this student."
              loading={loading}
              onAssign={assignPassage}
              onClear={(key) => setPassageSlots((prev) => ({ ...prev, [key]: null }))}
            />
          </Box>
        </Box>
    </Box>
  )
}
