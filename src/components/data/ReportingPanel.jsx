/**
 * Student analytics dashboard: mastery, accuracy, cadence, and practice gaps.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import SchoolIcon from '@mui/icons-material/School'
import GradingIcon from '@mui/icons-material/Grading'
import { buildWordCatalogIndex } from '../../lib/tagMultiWordText'
import { fetchStudentLessons } from '../../lib/fetchStudentLessonPlan'
import {
  buildStudentAnalytics,
  formatPercent,
} from '../../lib/studentAnalytics'
import { studentDisplayName } from '../../lib/studentDisplay'
import { MASTERY_ROW_COLORS } from '../../theme'

const WORD_COLUMNS = [
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 110 },
  {
    field: 'accuracy',
    headerName: 'Accuracy',
    type: 'number',
    width: 100,
    align: 'left',
    headerAlign: 'left',
    valueFormatter: (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'Unscored'),
  },
  {
    field: 'incorrect',
    headerName: 'Misses',
    type: 'number',
    width: 80,
    align: 'left',
    headerAlign: 'left',
  },
  {
    field: 'encounters',
    headerName: 'Seen',
    type: 'number',
    width: 80,
    align: 'left',
    headerAlign: 'left',
  },
  {
    field: 'lessonCount',
    headerName: 'Lessons',
    type: 'number',
    width: 90,
    align: 'left',
    headerAlign: 'left',
  },
  { field: 'lastSeenLabel', headerName: 'Last seen', width: 110 },
  { field: 'conceptsLabel', headerName: 'Concepts', flex: 1.1, minWidth: 140 },
]

const MASTERY_COLUMNS = [
  { field: 'concept', headerName: 'Concept', flex: 1.4, minWidth: 150 },
  {
    field: 'masteryStatus',
    headerName: 'Mastery',
    width: 110,
    renderCell: (params) => {
      const colors = MASTERY_ROW_COLORS[params.value] ?? MASTERY_ROW_COLORS.unknown
      return (
        <Chip
          size="small"
          label={params.value}
          sx={{
            bgcolor: colors.bg,
            color: colors.color,
            textTransform: 'capitalize',
            fontWeight: 600,
          }}
        />
      )
    },
  },
  {
    field: 'accuracy',
    headerName: 'List accuracy',
    type: 'number',
    width: 120,
    align: 'left',
    headerAlign: 'left',
    valueFormatter: (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—'),
  },
  {
    field: 'lessonCount',
    headerName: 'Lessons',
    type: 'number',
    width: 90,
    align: 'left',
    headerAlign: 'left',
  },
  { field: 'lastSeenLabel', headerName: 'Last taught', width: 110 },
  { field: 'category', headerName: 'Category', flex: 0.9, minWidth: 110 },
  { field: 'level', headerName: 'Level', width: 80 },
]

function KpiCard({ icon, label, value, hint }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: '100%', minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ color: 'primary.main', mt: 0.25, flexShrink: 0 }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h6" noWrap title={String(value)}>
            {value}
          </Typography>
          {hint ? (
            <Typography variant="caption" color="text.secondary" noWrap title={hint}>
              {hint}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  )
}

function MasteryBar({ counts, total }) {
  const segments = [
    { id: 'new', count: counts.new, colors: MASTERY_ROW_COLORS.new },
    { id: 'review', count: counts.review, colors: MASTERY_ROW_COLORS.review },
    { id: 'mastered', count: counts.mastered, colors: MASTERY_ROW_COLORS.mastered },
  ]
  if (!total) {
    return (
      <Typography variant="body2" color="text.secondary">
        Mark concepts in Scope & Sequence to see mastery here.
      </Typography>
    )
  }
  return (
    <Stack spacing={1}>
      <Box
        sx={{
          display: 'flex',
          height: 18,
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'action.hover',
        }}
      >
        {segments.map((segment) => {
          const width = `${Math.max(0, (segment.count / total) * 100)}%`
          if (!segment.count) return null
          return (
            <Box
              key={segment.id}
              title={`${segment.id}: ${segment.count}`}
              sx={{
                width,
                minWidth: segment.count ? 8 : 0,
                bgcolor: segment.colors.bg,
                color: segment.colors.color,
              }}
            />
          )
        })}
      </Box>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {segments.map((segment) => (
          <Chip
            key={segment.id}
            size="small"
            label={`${segment.id} ${segment.count}`}
            sx={{
              bgcolor: segment.colors.bg,
              color: segment.colors.color,
              textTransform: 'capitalize',
              fontWeight: 600,
            }}
          />
        ))}
      </Stack>
    </Stack>
  )
}

function AccuracyTrend({ rows }) {
  const scored = (rows ?? []).filter((row) => row.scored > 0)
  if (!scored.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Score words in a lesson to see accuracy over time.
      </Typography>
    )
  }
  return (
    <Stack spacing={0.75}>
      {scored.slice(-8).map((row) => {
        const pct = Math.round((row.accuracy ?? 0) * 100)
        return (
          <Box key={row.id}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="caption" noWrap title={row.name} sx={{ fontWeight: 600 }}>
                {row.dateLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {pct}% · {row.correct}/{row.scored}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 8,
                borderRadius: 1,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': {
                  bgcolor: pct >= 80 ? 'success.main' : pct >= 60 ? 'warning.main' : 'error.main',
                },
              }}
            />
          </Box>
        )
      })}
    </Stack>
  )
}

function AttentionList({ title, empty, items, getLabel, getHint }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {!items.length ? (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          {items.map((item) => (
            <Stack
              key={item.id || item.word}
              direction="row"
              spacing={1}
              justifyContent="space-between"
              alignItems="baseline"
            >
              <Typography variant="body2" noWrap title={getLabel(item)} sx={{ fontWeight: 600 }}>
                {getLabel(item)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {getHint(item)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  )
}

export default function ReportingPanel({ student, concepts = [], wordsByConceptId, setError }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!student?.id) {
      setLessons([])
      return
    }
    setLoading(true)
    try {
      const items = await fetchStudentLessons(student.id)
      setLessons(items)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reporting data')
    } finally {
      setLoading(false)
    }
  }, [student?.id, setError])

  useEffect(() => {
    void load()
  }, [load])

  const catalogIndex = useMemo(
    () => buildWordCatalogIndex(concepts, wordsByConceptId),
    [concepts, wordsByConceptId],
  )

  const analytics = useMemo(
    () =>
      buildStudentAnalytics({
        student,
        concepts,
        catalogIndex,
        lessons,
      }),
    [student, concepts, catalogIndex, lessons],
  )

  const masteryRows = analytics.mastery.rows
  const wordRows = analytics.wordRows

  if (!student) {
    return <Typography color="text.secondary">Select a student to view reporting.</Typography>
  }

  const name = studentDisplayName(student)
  const accuracyHint = analytics.scoredTotal
    ? `${analytics.totalCorrect} correct · ${analytics.totalIncorrect} missed`
    : 'No word scores yet'
  const masteredHint = analytics.mastery.inScopeCount
    ? `${analytics.mastery.counts.mastered} of ${analytics.mastery.inScopeCount} in scope`
    : 'Nothing in scope yet'

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        minHeight: { md: 'calc(100vh - 220px)' },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle1">
          {name}’s progress
        </Typography>
        {loading ? <CircularProgress size={14} /> : null}
        <Typography variant="body2" color="text.secondary">
          What to teach next, what still trips them up, and how the last lessons went.
        </Typography>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr 1fr',
            md: 'repeat(5, minmax(0, 1fr))',
          },
          gap: 1.25,
        }}
      >
        <KpiCard
          icon={<MenuBookIcon fontSize="small" />}
          label="Lessons"
          value={analytics.lessonCount || '0'}
          hint={analytics.lessonCount ? 'Saved lesson plans' : 'Save a lesson to start history'}
        />
        <KpiCard
          icon={<CalendarMonthIcon fontSize="small" />}
          label="Last lesson"
          value={analytics.lastLessonLabel}
          hint={analytics.lessonCount ? analytics.daysAgoLabel : 'No cadence yet'}
        />
        <KpiCard
          icon={<CheckCircleOutlineIcon fontSize="small" />}
          label="Accuracy"
          value={formatPercent(analytics.overallAccuracy)}
          hint={accuracyHint}
        />
        <KpiCard
          icon={<SchoolIcon fontSize="small" />}
          label="Mastered"
          value={analytics.mastery.inScopeCount ? formatPercent(analytics.mastery.masteredPct) : '—'}
          hint={masteredHint}
        />
        <KpiCard
          icon={<GradingIcon fontSize="small" />}
          label="Words practiced"
          value={analytics.uniqueWords || '0'}
          hint={
            analytics.totalEncounters
              ? `${analytics.totalEncounters} encounters`
              : 'Appears after lessons are saved'
          }
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1.15fr' },
          gap: 1.25,
          flex: 1,
          minHeight: { md: 280 },
        }}
      >
        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0, height: '100%' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Scope mastery
          </Typography>
          <MasteryBar counts={analytics.mastery.counts} total={analytics.mastery.inScopeCount} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, mb: 0.5, fontWeight: 700 }}>
            Next new concepts
          </Typography>
          {analytics.nextNew.length ? (
            <Stack spacing={0.5}>
              {analytics.nextNew.map((row) => (
                <Typography key={row.id} variant="body2" noWrap title={row.concept}>
                  {row.sequence != null ? `${row.sequence}. ` : ''}
                  {row.concept}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No in-scope concepts are marked new.
            </Typography>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Accuracy by lesson
          </Typography>
          <AccuracyTrend rows={analytics.lessonTrend} />
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Needs attention
          </Typography>
          <Stack spacing={1.5}>
            <AttentionList
              title="Words with misses"
              empty="No repeated errors yet. Score lessons to surface hard words."
              items={analytics.needsAttention.errorWords}
              getLabel={(item) => item.word}
              getHint={(item) => `${item.incorrect} misses · ${formatPercent(item.accuracy)}`}
            />
            <AttentionList
              title="New, not yet taught"
              empty={
                analytics.mastery.counts.new
                  ? 'Every new concept has appeared in a lesson.'
                  : 'No in-scope concepts are marked new.'
              }
              items={analytics.needsAttention.untaughtNew}
              getLabel={(item) => item.concept}
              getHint={() => '0 lessons'}
            />
            <AttentionList
              title="Review going stale"
              empty={
                analytics.mastery.counts.review
                  ? 'Review concepts have been taught recently.'
                  : 'No in-scope concepts are marked review.'
              }
              items={analytics.needsAttention.staleReview}
              getLabel={(item) => item.concept}
              getHint={(item) => item.lastSeenLabel}
            />
          </Stack>
        </Paper>
      </Box>

      {analytics.mastery.inScopeCount || analytics.wordRows.length ? (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 1.25,
          flex: 1,
          minHeight: { xs: 520, md: 360 },
        }}
      >
        <Paper variant="outlined" sx={{ p: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" sx={{ px: 1, pt: 0.5, pb: 0.75 }}>
            In-scope concepts
          </Typography>
          <Box sx={{ flex: 1, minHeight: 280, width: '100%' }}>
            <DataGridPro
              rows={masteryRows}
              columns={MASTERY_COLUMNS}
              getRowId={(row) => row.id}
              density="compact"
              hideFooterSelectedRowCount
              pagination
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
                sorting: { sortModel: [{ field: 'masteryStatus', sort: 'asc' }] },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
              localeText={{ noRowsLabel: 'No in-scope concepts yet.' }}
              getRowClassName={(params) => `mastery-row-${params.row.masteryStatus}`}
              sx={{
                border: 0,
                '& .mastery-row-new': { bgcolor: MASTERY_ROW_COLORS.new.bg },
                '& .mastery-row-review': {
                  bgcolor: MASTERY_ROW_COLORS.review.bg,
                  color: MASTERY_ROW_COLORS.review.color,
                },
                '& .mastery-row-mastered': {
                  bgcolor: MASTERY_ROW_COLORS.mastered.bg,
                  color: MASTERY_ROW_COLORS.mastered.color,
                  '& .MuiDataGrid-cell': { color: MASTERY_ROW_COLORS.mastered.color },
                },
              }}
            />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" sx={{ px: 1, pt: 0.5, pb: 0.75 }}>
            Word practice
          </Typography>
          <Box sx={{ flex: 1, minHeight: 280, width: '100%' }}>
            <DataGridPro
              rows={wordRows}
              columns={WORD_COLUMNS}
              getRowId={(row) => row.id}
              loading={loading}
              density="compact"
              hideFooterSelectedRowCount
              pagination
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
                sorting: { sortModel: [{ field: 'incorrect', sort: 'desc' }] },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
              localeText={{ noRowsLabel: 'No word exposures yet. Save lesson plans to build history.' }}
              sx={{ border: 0 }}
            />
          </Box>
        </Paper>
      </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Mark concepts in Scope & Sequence and save scored lesson plans to fill concept and word
            tables here. The cards above stay ready for at-a-glance counts as soon as that data exists.
          </Typography>
        </Paper>
      )}
    </Box>
  )
}
