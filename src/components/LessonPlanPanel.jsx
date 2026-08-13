import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import LessonPlanTemplate from './LessonPlanTemplate'
import {
  classifyListsForLesson,
  fetchStudentLessonPlan,
  nextLessonNumber,
  parseScopeAndSequence,
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

function withWords(list, wordLookup, kind) {
  return {
    ...list,
    kind,
    words: resolveListWords(list, wordLookup),
  }
}

export default function LessonPlanPanel({ student, wordsByConceptId, instructor, setError }) {
  const printRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState(null)

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

  const wordLookup = useMemo(() => buildWordLookup(wordsByConceptId), [wordsByConceptId])

  const mapped = useMemo(() => {
    if (!payload) {
      return { lists: [], sentences: [], passages: [], lessonNumber: 1 }
    }
    const inventory = parseScopeAndSequence(payload.student?.scopeAndSequence ?? student?.scopeAndSequence)
    const { reviewLists, newConceptList } = classifyListsForLesson(payload.lists, inventory)
    const lists = [
      ...reviewLists.map((list) => withWords(list, wordLookup, 'review')),
      ...(newConceptList ? [withWords(newConceptList, wordLookup, 'new')] : []),
    ]
    return {
      lists,
      sentences: payload.sentences ?? [],
      passages: payload.passages ?? [],
      lessonNumber: nextLessonNumber(payload.lessons),
    }
  }, [payload, student?.scopeAndSequence, wordLookup])

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    [],
  )

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
          {loading ? <CircularProgress size={16} /> : null}
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

      {loading && !payload ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box
          sx={{
            bgcolor: '#f5f5f6',
            py: 2.5,
            px: { xs: 1, sm: 2 },
            borderRadius: 1,
            '@media print': { bgcolor: 'transparent', p: 0 },
          }}
        >
          {!mapped.lists.length && !mapped.sentences.length && !mapped.passages.length ? (
            <Alert severity="info" sx={{ mb: 2, maxWidth: 800, mx: 'auto', '@media print': { display: 'none' } }}>
              No student lists, sentences, or passages are assigned yet. Red placeholders print until
              related records are saved on this student.
            </Alert>
          ) : null}
          <LessonPlanTemplate
            ref={printRef}
            student={payload?.student ?? student}
            lists={mapped.lists}
            sentences={mapped.sentences}
            passages={mapped.passages}
            date={dateLabel}
            lessonNumber={mapped.lessonNumber}
            instructor={instructor}
          />
        </Box>
      )}
    </Box>
  )
}
