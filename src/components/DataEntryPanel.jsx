import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  SCORE_CORRECT,
  SCORE_INCORRECT,
  SCORE_UNSCORED,
  buildLessonScoreMaterials,
  countConceptExposures,
  formatScoreTally,
  getLessonPlan,
  nextScoreState,
  saveStudentLesson,
  tallyScores,
} from '../lib/fetchStudentLessonPlan'

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

function ScoreWordButton({ word, state, onToggle, fullWidth = false, paragraph = false }) {
  if (paragraph) {
    return (
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        sx={{
          display: 'inline',
          appearance: 'none',
          m: 0,
          mr: '0.22em',
          mb: '0.12em',
          px: '0.22em',
          py: 0,
          border: '1px solid',
          borderRadius: '3px',
          font: 'inherit',
          fontSize: '0.78rem',
          fontWeight: 500,
          lineHeight: 1.65,
          letterSpacing: 'inherit',
          textTransform: 'none',
          verticalAlign: 'baseline',
          cursor: 'pointer',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          ...scoreButtonSx(state),
        }}
      >
        {word}
      </Box>
    )
  }
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

export default function DataEntryPanel({
  student,
  lesson = null,
  savedLessons = [],
  setError,
  onLessonsChanged,
  onLessonUpdated,
}) {
  const [scores, setScores] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const scoresRef = useRef(scores)
  const dirtyRef = useRef(dirty)
  const lessonRef = useRef(lesson)

  scoresRef.current = scores
  dirtyRef.current = dirty

  const applyLesson = useCallback((nextLesson) => {
    if (!nextLesson) {
      setScores({})
      setDirty(false)
      setNotice('')
      return
    }
    const next = buildLessonScoreMaterials(nextLesson)
    setScores(next.scores ?? {})
    setDirty(false)
    setNotice('')
    setError('')
  }, [setError])

  const persistScores = useCallback(async (currentLesson = lessonRef.current, nextScores = scoresRef.current) => {
    if (!currentLesson?.id || !student?.id) return null
    const parsed = getLessonPlan(currentLesson)
    const conceptId =
      currentLesson.concepts
      || parsed.snapshots?.lists?.newConcept?.conceptID
      || parsed.conceptSlots?.newConceptId
    const saved = await saveStudentLesson({
      id: currentLesson.id,
      studentID: student.id,
      date: toIsoDate(currentLesson.date),
      lessonNumber: currentLesson.lessonNumber,
      conceptId,
      plan: parsed,
      scores: nextScores,
    })
    const lessons = (await onLessonsChanged?.()) ?? savedLessons
    const refreshed = (lessons ?? []).find((item) => item.id === saved.id)
    return refreshed ?? { ...currentLesson, ...saved, scores: nextScores }
  }, [student?.id, onLessonsChanged, savedLessons])

  const persistRef = useRef(persistScores)
  const applyRef = useRef(applyLesson)
  const onUpdatedRef = useRef(onLessonUpdated)
  const lessonPropRef = useRef(lesson)
  persistRef.current = persistScores
  applyRef.current = applyLesson
  onUpdatedRef.current = onLessonUpdated
  lessonPropRef.current = lesson

  useEffect(() => {
    const previous = lessonRef.current
    const next = lessonPropRef.current
    async function syncLesson() {
      if (dirtyRef.current && previous?.id && previous.id !== next?.id) {
        try {
          const refreshed = await persistRef.current(previous, scoresRef.current)
          if (refreshed && previous.id === refreshed.id) onUpdatedRef.current?.(refreshed)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to save scores before switching lessons')
          return
        }
      }
      applyRef.current(next)
      lessonRef.current = next
    }
    void syncLesson()
  }, [lesson?.id, setError])

  useEffect(() => {
    return () => {
      if (dirtyRef.current && lessonRef.current?.id) {
        void persistRef.current(lessonRef.current, scoresRef.current)
      }
    }
  }, [])

  const materials = useMemo(
    () => (lesson ? buildLessonScoreMaterials({ ...lesson, lessonData: lesson.lessonData }) : null),
    [lesson],
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
    () => (materials?.passages ?? []).flatMap((item) => item.words.map((word) => word.key)),
    [materials],
  )

  const newConceptTally = useMemo(() => tallyScores(newConceptKeys, scores), [newConceptKeys, scores])
  const reviewTally = useMemo(() => tallyScores(reviewKeys, scores), [reviewKeys, scores])
  const sentenceTally = useMemo(() => tallyScores(sentenceKeys, scores), [sentenceKeys, scores])
  const passageTally = useMemo(() => tallyScores(passageKeys, scores), [passageKeys, scores])

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
    if (!lesson) return
    setSaving(true)
    try {
      const refreshed = await persistScores(lesson, scores)
      if (refreshed) {
        lessonRef.current = refreshed
        onLessonUpdated?.(refreshed)
      }
      setDirty(false)
      setNotice('Scores saved.')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scores')
    } finally {
      setSaving(false)
    }
  }

  if (!lesson) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Alert severity="info">
          Select a saved lesson plan on the left to score lists, sentences, and passages.
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Paper sx={{ p: 1.5, position: 'sticky', top: 0, zIndex: 2 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`Lesson ${lesson.lessonNumber ?? '—'} · ${formatLessonDate(lesson.date)}`}
            />
            {dirty ? <Chip size="small" color="warning" label="Unsaved scores" /> : null}
            {notice ? <Chip size="small" color="success" label={notice} /> : null}
            {saving ? <CircularProgress size={16} /> : null}
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DoneAllIcon />}
              onClick={markAllCorrect}
              disabled={!allKeys.length}
            >
              Mark all correct
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RestartAltIcon />}
              onClick={clearScores}
              disabled={!allKeys.length}
            >
              Clear scores
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
            >
              Save scores
            </Button>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary">
            Click a word to cycle Not scored → Correct → Incorrect.
          </Typography>
          <Chip size="small" variant="outlined" label="Not scored" />
          <Chip size="small" sx={{ bgcolor: '#2e7d32', color: '#fff' }} label="Correct" />
          <Chip size="small" sx={{ bgcolor: '#c62828', color: '#fff' }} label="Incorrect" />
        </Stack>
      </Paper>

      <Typography variant="subtitle1">Lists</Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          alignItems: 'flex-start',
          pb: 1,
        }}
      >
        {(materials?.lists ?? []).map((column) => {
          const exposure = countConceptExposures(
            savedLessons,
            lesson,
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

      <Typography variant="subtitle1">Sentences</Typography>
      <Stack spacing={1.5}>
        {(materials?.sentences ?? []).length ? (
          materials.sentences.map((sentence) => (
            <Paper key={sentence.key} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle2">{sentence.label}</Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={formatScoreTally(tallyScores(sentence.words.map((item) => item.key), scores))}
                />
              </Stack>
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
            </Paper>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary">
            No sentence assigned
          </Typography>
        )}
      </Stack>

      <Typography variant="subtitle1">Passages</Typography>
      <Stack spacing={1.5}>
        {(materials?.passages ?? []).length ? (
          materials.passages.map((item) => {
            const exposure = countConceptExposures(
              savedLessons,
              lesson,
              item.conceptID,
              item.concept,
            )
            return (
              <Paper key={item.key} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle2">
                    {item.title || item.label || 'Passage'}
                  </Typography>
                  {item.concept ? (
                    <Chip size="small" variant="outlined" label={item.concept} />
                  ) : null}
                  {item.concept || item.conceptID ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={exposure === 0 ? 'First exposure' : `Exposed ${exposure}×`}
                    />
                  ) : null}
                  <Chip
                    size="small"
                    variant="outlined"
                    label={formatScoreTally(tallyScores(item.words.map((word) => word.key), scores))}
                  />
                </Stack>
                <Box
                  component="p"
                  sx={{
                    m: 0,
                    fontSize: '0.78rem',
                    lineHeight: 1.75,
                    whiteSpace: 'normal',
                  }}
                >
                  {item.words.map((word) => (
                    <ScoreWordButton
                      key={word.key}
                      word={word.word}
                      state={scores[word.key] || SCORE_UNSCORED}
                      onToggle={() => toggleWord(word.key)}
                      paragraph
                    />
                  ))}
                </Box>
              </Paper>
            )
          })
        ) : (
          <Typography variant="body2" color="text.secondary">
            No passage assigned
          </Typography>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1">Lesson scores</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Totals for this lesson after scoring lists, sentences, and passages.
        </Typography>
        <ScoreStat label="Total" tally={totalTally} />
        <ScoreStat label="New concept" tally={newConceptTally} />
        <ScoreStat label="Review concepts" tally={reviewTally} />
        <ScoreStat label="Sentences" tally={sentenceTally} />
        <ScoreStat label="Passages" tally={passageTally} />
      </Paper>
    </Stack>
  )
}
