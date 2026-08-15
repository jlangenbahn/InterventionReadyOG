import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import SaveIcon from '@mui/icons-material/Save'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import {
  SCORE_CORRECT,
  SCORE_INCORRECT,
  SCORE_UNSCORED,
  buildLessonScoreMaterials,
  countConceptExposures,
  fetchStudentLessons,
  formatScoreTally,
  nextScoreState,
  parseLessonData,
  saveStudentLesson,
  studentDisplayName,
  tallyScores,
} from '../lib/fetchStudentLessonPlan'

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
  { field: 'newConcept', headerName: 'New concept', flex: 1, minWidth: 140 },
  { field: 'scoreLabel', headerName: 'Score', width: 130 },
]

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

function scoreButtonSx(state) {
  if (state === SCORE_CORRECT) {
    return {
      bgcolor: '#2e7d32',
      color: '#fff',
      borderColor: '#2e7d32',
      '&:hover': { bgcolor: '#1b5e20' },
    }
  }
  if (state === SCORE_INCORRECT) {
    return {
      bgcolor: '#c62828',
      color: '#fff',
      borderColor: '#c62828',
      '&:hover': { bgcolor: '#b71c1c' },
    }
  }
  return {
    bgcolor: '#fff',
    color: 'text.primary',
    borderColor: 'divider',
    '&:hover': { bgcolor: 'action.hover' },
  }
}

function ScoreWordButton({ word, state, onToggle, fullWidth = false }) {
  return (
    <Button
      size="small"
      variant="outlined"
      fullWidth={fullWidth}
      onClick={onToggle}
      sx={{
        textTransform: 'none',
        minWidth: 0,
        px: 1,
        justifyContent: 'flex-start',
        lineHeight: 1.3,
        fontWeight: 500,
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        ...scoreButtonSx(state),
      }}
    >
      {word}
    </Button>
  )
}

function ScoreStat({ label, tally }) {
  return (
    <Box sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="subtitle2" sx={{ lineHeight: 1.2, textAlign: 'right' }}>
          {formatScoreTally(tally)}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {tally.total ? `${tally.unscored} not scored` : 'No words'}
      </Typography>
    </Box>
  )
}

const EMPTY_TALLY = { correct: 0, incorrect: 0, unscored: 0, total: 0, scored: 0, accuracy: null }

export default function DataEntryPanel({ student, setError }) {
  const [savedLessons, setSavedLessons] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(false)
  const [loadedLesson, setLoadedLesson] = useState(null)
  const [scores, setScores] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

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
    void loadSavedLessons()
  }, [loadSavedLessons])

  useEffect(() => {
    setLoadedLesson(null)
    setScores({})
    setDirty(false)
    setNotice('')
  }, [student?.id])

  const materials = useMemo(
    () => (loadedLesson ? buildLessonScoreMaterials(loadedLesson) : null),
    [loadedLesson],
  )

  const allKeys = materials?.allKeys ?? []
  const totalTally = useMemo(() => tallyScores(allKeys, scores), [allKeys, scores])
  const newConceptKeys = useMemo(
    () => (materials?.lists ?? []).filter((list) => list.section === 'new').flatMap((list) => list.words.map((item) => item.key)),
    [materials],
  )
  const reviewKeys = useMemo(
    () => (materials?.lists ?? []).filter((list) => list.section === 'review').flatMap((list) => list.words.map((item) => item.key)),
    [materials],
  )
  const sentenceKeys = useMemo(
    () => (materials?.sentences ?? []).flatMap((sentence) => sentence.words.map((item) => item.key)),
    [materials],
  )
  const passageKeys = useMemo(
    () => (materials?.passage?.words ?? []).map((item) => item.key),
    [materials],
  )

  const newConceptTally = useMemo(() => tallyScores(newConceptKeys, scores), [newConceptKeys, scores])
  const reviewTally = useMemo(() => tallyScores(reviewKeys, scores), [reviewKeys, scores])
  const sentenceTally = useMemo(() => tallyScores(sentenceKeys, scores), [sentenceKeys, scores])
  const passageTally = useMemo(() => tallyScores(passageKeys, scores), [passageKeys, scores])
  const passageExposure = useMemo(
    () =>
      loadedLesson
        ? countConceptExposures(
            savedLessons,
            loadedLesson,
            materials?.passage?.conceptID,
            materials?.passage?.concept,
          )
        : 0,
    [savedLessons, loadedLesson, materials],
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
          const summary = data?.scoreSummary
          const scoreLabel = summary?.scored
            ? `${summary.correct}/${summary.scored}${summary.accuracy != null ? ` (${Math.round(summary.accuracy * 100)}%)` : ''}`
            : '—'
          return {
            id: lesson.id,
            lessonNumber: lesson.lessonNumber ?? '',
            lessonDateLabel: formatLessonDate(lesson.date) || '—',
            createdDateLabel: formatCreatedDate(lesson.createdAt) || '—',
            newConcept: newConcept || '—',
            scoreLabel,
          }
        }),
    [savedLessons],
  )

  function applyLesson(lesson) {
    const next = buildLessonScoreMaterials(lesson)
    setLoadedLesson(lesson)
    setScores(next.scores ?? {})
    setDirty(false)
    setNotice('')
    setError('')
  }

  async function persistScores(lesson = loadedLesson, nextScores = scores) {
    if (!lesson?.id || !student?.id) return null
    const parsed = parseLessonData(lesson.lessonData)
    const nextMaterials = buildLessonScoreMaterials({
      ...lesson,
      lessonData: JSON.stringify({ ...parsed, scores: nextScores }),
    })
    const summary = tallyScores(nextMaterials.allKeys, nextScores)
    const lessonData = {
      ...parsed,
      scores: nextScores,
      scoreSummary: summary,
    }
    const conceptId =
      lesson.concepts
      || parsed.snapshots?.lists?.newConcept?.conceptID
      || parsed.snapshots?.lists?.review1?.conceptID
      || parsed.snapshots?.lists?.review2?.conceptID
      || parsed.snapshots?.lists?.review3?.conceptID
    const saved = await saveStudentLesson({
      id: lesson.id,
      studentID: student.id,
      date: toIsoDate(lesson.date),
      lessonNumber: lesson.lessonNumber,
      conceptId,
      lessonData,
    })
    const lessons = await loadSavedLessons()
    const refreshed = (lessons ?? []).find((item) => item.id === saved.id)
    return refreshed ?? { ...lesson, ...saved, lessonData: JSON.stringify(lessonData) }
  }

  async function selectLesson(lesson) {
    if (!lesson) return
    if (dirty && loadedLesson?.id && loadedLesson.id !== lesson.id) {
      try {
        await persistScores()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save scores before switching lessons')
        return
      }
    }
    applyLesson(lesson)
  }

  function toggleWord(key) {
    setScores((prev) => ({
      ...prev,
      [key]: nextScoreState(prev[key] || SCORE_UNSCORED),
    }))
    setDirty(true)
    setNotice('')
  }

  function markAllCorrect() {
    const next = {}
    for (const key of allKeys) next[key] = SCORE_CORRECT
    setScores(next)
    setDirty(true)
    setNotice('')
  }

  function clearScores() {
    setScores({})
    setDirty(true)
    setNotice('')
  }

  async function handleSave() {
    if (!loadedLesson) return
    setSaving(true)
    try {
      const refreshed = await persistScores()
      if (refreshed) setLoadedLesson(refreshed)
      setDirty(false)
      setNotice('Scores saved.')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scores')
    } finally {
      setSaving(false)
    }
  }

  if (!student) {
    return (
      <Typography color="text.secondary">Select a student to enter lesson data.</Typography>
    )
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h6">Data Entry</Typography>
          <Chip size="small" label={studentDisplayName(student)} />
          {loadedLesson ? (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`Lesson ${loadedLesson.lessonNumber ?? '—'} · ${formatLessonDate(loadedLesson.date)}`}
            />
          ) : null}
          {dirty ? <Chip size="small" color="warning" label="Unsaved scores" /> : null}
          {notice ? <Chip size="small" color="success" label={notice} /> : null}
          {loadingLessons || saving ? <CircularProgress size={16} /> : null}
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 32%) minmax(0, 1fr)' },
          gap: 2,
          mb: 2,
          alignItems: 'stretch',
        }}
      >
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: { md: 280 } }}>
          <Typography variant="subtitle1">Lesson scores</Typography>
          {loadedLesson ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Totals for the selected lesson. Click a word below to score it.
              </Typography>
              <ScoreStat label="Total" tally={totalTally} />
              <ScoreStat label="New concept" tally={newConceptTally} />
              <ScoreStat label="Review concepts" tally={reviewTally} />
              <ScoreStat label="Sentences" tally={sentenceTally} />
              <ScoreStat label="Passage" tally={passageTally} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" color="text.secondary">
                  Legend
                </Typography>
                <Chip size="small" variant="outlined" label="Not scored" />
                <Chip size="small" sx={{ bgcolor: '#2e7d32', color: '#fff' }} label="Correct" />
                <Chip size="small" sx={{ bgcolor: '#c62828', color: '#fff' }} label="Incorrect" />
              </Stack>
            </>
          ) : (
            <>
              <ScoreStat label="Total" tally={EMPTY_TALLY} />
              <ScoreStat label="New concept" tally={EMPTY_TALLY} />
              <ScoreStat label="Review concepts" tally={EMPTY_TALLY} />
              <ScoreStat label="Sentences" tally={EMPTY_TALLY} />
              <ScoreStat label="Passage" tally={EMPTY_TALLY} />
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Select a saved lesson plan to enter word-level scores.
              </Alert>
            </>
          )}
        </Paper>

        <Paper sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="subtitle1">Saved lesson plans</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Click a row to score that lesson. Click a word to cycle Not scored → Correct → Incorrect.
          </Typography>
          <Box sx={{ height: 280, width: '100%' }}>
            <DataGridPro
              rows={savedLessonRows}
              columns={SAVED_LESSON_COLUMNS}
              getRowId={(row) => row.id}
              onRowClick={(params) => {
                const lesson = savedLessons.find((item) => item.id === params.id)
                if (lesson) void selectLesson(lesson)
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
                noRowsLabel: 'No saved lesson plans yet. Save a plan on the Lesson Plan tab first.',
              }}
            />
          </Box>
        </Paper>
      </Box>

      {loadedLesson ? (
        <>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Lists
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              overflowX: 'auto',
              alignItems: 'flex-start',
              pb: 1,
              mb: 2,
            }}
          >
            {(materials?.lists ?? []).map((column) => {
              const exposure = countConceptExposures(
                savedLessons,
                loadedLesson,
                column.conceptID,
                column.concept,
              )
              const tally = tallyScores(column.words.map((item) => item.key), scores)
              return (
                <Paper
                  key={column.key}
                  variant="outlined"
                  sx={{ width: 176, flexShrink: 0, p: 1.25 }}
                >
                  <Typography variant="subtitle2">{column.label}</Typography>
                  <Typography variant="body2" noWrap title={column.name || 'No list assigned'}>
                    {column.name || 'No list assigned'}
                  </Typography>
                  {column.concept ? (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {column.concept}
                    </Typography>
                  ) : null}
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, mb: 1 }} flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={exposure === 0 ? 'First exposure' : `Exposed ${exposure}×`}
                    />
                    <Chip size="small" variant="outlined" label={formatScoreTally(tally)} />
                  </Stack>
                  <Stack spacing={0.5}>
                    {column.words.length ? (
                      column.words.map((item) => (
                        <ScoreWordButton
                          key={item.key}
                          word={item.word}
                          state={scores[item.key] || SCORE_UNSCORED}
                          onToggle={() => toggleWord(item.key)}
                          fullWidth
                        />
                      ))
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No words
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              )
            })}
          </Box>

          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Sentences
          </Typography>
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {(materials?.sentences ?? []).map((sentence) => (
              <Paper key={sentence.key} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle2">{sentence.label}</Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={formatScoreTally(tallyScores(sentence.words.map((item) => item.key), scores))}
                  />
                </Stack>
                {sentence.words.length ? (
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
                    {sentence.words.map((item) => (
                      <ScoreWordButton
                        key={item.key}
                        word={item.word}
                        state={scores[item.key] || SCORE_UNSCORED}
                        onToggle={() => toggleWord(item.key)}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No sentence assigned
                  </Typography>
                )}
              </Paper>
            ))}
          </Stack>

          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Passage
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2">
                {materials?.passage?.title || materials?.passage?.label || 'Passage'}
              </Typography>
              {materials?.passage?.concept ? (
                <Chip size="small" variant="outlined" label={materials.passage.concept} />
              ) : null}
              {materials?.passage?.concept || materials?.passage?.conceptID ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={passageExposure === 0 ? 'First exposure' : `Exposed ${passageExposure}×`}
                />
              ) : null}
              <Chip
                size="small"
                variant="outlined"
                label={formatScoreTally(tallyScores(passageKeys, scores))}
              />
            </Stack>
            {materials?.passage?.words?.length ? (
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
                {materials.passage.words.map((item) => (
                  <ScoreWordButton
                    key={item.key}
                    word={item.word}
                    state={scores[item.key] || SCORE_UNSCORED}
                    onToggle={() => toggleWord(item.key)}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No passage assigned
              </Typography>
            )}
          </Paper>
        </>
      ) : null}

      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: (theme) => theme.zIndex.snackbar,
          p: 1,
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          maxWidth: 'calc(100vw - 48px)',
        }}
      >
        <Button
          variant="outlined"
          startIcon={<DoneAllIcon />}
          onClick={markAllCorrect}
          disabled={!loadedLesson || !allKeys.length}
        >
          Mark all correct
        </Button>
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={clearScores}
          disabled={!loadedLesson || !allKeys.length}
        >
          Clear scores
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={() => void handleSave()}
          disabled={!loadedLesson || !dirty || saving}
        >
          Save scores
        </Button>
      </Paper>
    </Box>
  )
}
