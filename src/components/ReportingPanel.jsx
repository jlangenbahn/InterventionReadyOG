import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import ConceptCountChart from './ConceptCountChart'
import {
  buildLessonScoreMaterials,
  fetchStudentLessons,
  parseScopeAndSequence,
} from '../lib/fetchStudentLessonPlan'
import { normalizeLookupWord, buildWordCatalogIndex } from '../lib/tagMultiWordText'

const MASTERY_STATUSES = ['new', 'review', 'mastered']
const MASTERY_ROW_COLORS = {
  unknown: { bg: '#eef6f8', color: '#1a2a2e' },
  new: { bg: '#c5dce1', color: '#1a2a2e' },
  review: { bg: '#7aadb8', color: '#102428' },
  mastered: { bg: '#0f4c5c', color: '#ffffff' },
}

const WORD_COLUMNS = [
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
  {
    field: 'encounters',
    headerName: 'Times seen',
    type: 'number',
    width: 120,
    align: 'left',
    headerAlign: 'left',
  },
  {
    field: 'lessonCount',
    headerName: 'Lessons',
    type: 'number',
    width: 100,
    align: 'left',
    headerAlign: 'left',
  },
  { field: 'lastSeenLabel', headerName: 'Last seen', width: 140 },
  { field: 'sources', headerName: 'Sources', width: 140 },
  { field: 'conceptsLabel', headerName: 'Concepts', flex: 1.2, minWidth: 160 },
]

const MASTERY_COLUMNS = [
  { field: 'concept', headerName: 'Concept', flex: 1.4, minWidth: 180 },
  {
    field: 'masteryStatus',
    headerName: 'Mastery',
    width: 120,
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
  { field: 'category', headerName: 'Category', flex: 1, minWidth: 140 },
  { field: 'level', headerName: 'Level', width: 90 },
]

function formatLessonDate(value) {
  if (!value) return ''
  const raw = String(value)
  const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : ''
  if (!iso) return ''
  const [year, month, day] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function StatCard({ label, value, hint, colors }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        flex: '1 1 140px',
        minWidth: 140,
        bgcolor: colors?.bg,
        color: colors?.color,
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.85, textTransform: 'capitalize' }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          {hint}
        </Typography>
      ) : null}
    </Paper>
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

  const wordRows = useMemo(() => {
    const byWord = new Map()
    for (const lesson of lessons ?? []) {
      const materials = buildLessonScoreMaterials(lesson)
      const lessonDate = lesson.date || lesson.createdAt
      const add = (raw, source) => {
        const lookup = normalizeLookupWord(raw)
        if (!lookup) return
        const current = byWord.get(lookup) ?? {
          id: lookup,
          word: String(raw).replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '') || lookup,
          encounters: 0,
          lessonIds: new Set(),
          sources: new Set(),
          lastSeen: '',
        }
        current.encounters += 1
        if (lesson?.id) current.lessonIds.add(lesson.id)
        current.sources.add(source)
        if (String(lessonDate) > String(current.lastSeen)) current.lastSeen = lessonDate
        byWord.set(lookup, current)
      }
      for (const list of materials.lists ?? []) {
        for (const item of list.words ?? []) add(item.word, 'Lists')
      }
      for (const sentence of materials.sentences ?? []) {
        for (const item of sentence.words ?? []) add(item.word, 'Sentences')
      }
      for (const passage of materials.passages ?? []) {
        for (const item of passage.words ?? []) add(item.word, 'Passages')
      }
    }
    return [...byWord.values()]
      .map((row) => ({
        ...row,
        lessonCount: row.lessonIds.size,
        lastSeenLabel: formatLessonDate(row.lastSeen) || '—',
        sources: [...row.sources].join(', ') || '—',
        conceptsLabel: (catalogIndex.get(row.id)?.concepts ?? []).map((item) => item.name).join(', ') || '—',
      }))
      .sort((a, b) => b.encounters - a.encounters || a.word.localeCompare(b.word))
  }, [lessons, catalogIndex])

  const masteryInventory = useMemo(() => {
    const inventory = parseScopeAndSequence(student?.scopeAndSequence)
    const byId = new Map((inventory ?? []).map((entry) => [entry.conceptId, entry]))
    const rows = (concepts ?? [])
      .filter((concept) => concept?.id)
      .map((concept) => {
        const entry = byId.get(concept.id)
        const masteryStatus = ['unknown', 'new', 'review', 'mastered'].includes(entry?.masteryStatus)
          ? entry.masteryStatus
          : 'unknown'
        return {
          id: concept.id,
          concept: concept.concept || 'Untitled concept',
          category: concept.category || '',
          level: concept.level || '',
          inScope: entry?.inScope === true,
          masteryStatus,
        }
      })
    const inScope = rows.filter((row) => row.inScope)
    const counts = { unknown: 0, new: 0, review: 0, mastered: 0 }
    for (const row of inScope) counts[row.masteryStatus] += 1
    const chartRows = MASTERY_STATUSES.map((status) => ({
      id: status,
      name: status.charAt(0).toUpperCase() + status.slice(1),
      count: counts[status],
      percentOfTokens: inScope.length ? counts[status] / inScope.length : 0,
    }))
    return { rows: inScope, counts, chartRows, inScopeCount: inScope.length }
  }, [concepts, student?.scopeAndSequence])

  if (!student) {
    return <Typography color="text.secondary">Select a student to view reporting.</Typography>
  }

  return (
    <Box>
      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Building reports from saved lessons…
          </Typography>
        </Stack>
      ) : null}

      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Concept mastery
      </Typography>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {MASTERY_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={status}
            value={masteryInventory.counts[status]}
            hint={`${masteryInventory.inScopeCount} in-scope concepts`}
            colors={MASTERY_ROW_COLORS[status]}
          />
        ))}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 42%) minmax(0, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <ConceptCountChart
          rows={masteryInventory.chartRows}
          totalTokens={masteryInventory.inScopeCount}
          title="Mastery mix"
          emptyLabel="Mark concepts in Scope & Sequence to see mastery here."
          maxBars={3}
        />
        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            In-scope concepts
          </Typography>
          <Box sx={{ height: 280, width: '100%' }}>
            <DataGridPro
              rows={masteryInventory.rows}
              columns={MASTERY_COLUMNS}
              getRowId={(row) => row.id}
              density="compact"
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
                '& .mastery-row-new': { bgcolor: MASTERY_ROW_COLORS.new.bg },
                '& .mastery-row-review': { bgcolor: MASTERY_ROW_COLORS.review.bg, color: MASTERY_ROW_COLORS.review.color },
                '& .mastery-row-mastered': {
                  bgcolor: MASTERY_ROW_COLORS.mastered.bg,
                  color: MASTERY_ROW_COLORS.mastered.color,
                  '& .MuiDataGrid-cell': { color: MASTERY_ROW_COLORS.mastered.color },
                },
              }}
            />
          </Box>
        </Paper>
      </Box>

      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Words seen
      </Typography>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <StatCard label="Unique words" value={wordRows.length} hint="Across saved lesson plans" />
        <StatCard
          label="Total encounters"
          value={wordRows.reduce((sum, row) => sum + row.encounters, 0)}
          hint={`${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`}
        />
      </Stack>
      {!lessons.length && !loading ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Save and teach lesson plans to build a word-exposure history for this student.
        </Alert>
      ) : null}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Counts include list words, sentence dictation, and passage reading from every saved lesson.
        </Typography>
        <Box sx={{ height: 420, width: '100%' }}>
          <DataGridPro
            rows={wordRows}
            columns={WORD_COLUMNS}
            getRowId={(row) => row.id}
            loading={loading}
            density="compact"
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'encounters', sort: 'desc' }] },
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
            localeText={{ noRowsLabel: 'No word exposures yet.' }}
          />
        </Box>
      </Paper>
    </Box>
  )
}
