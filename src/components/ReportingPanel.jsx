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
import { MASTERY_ROW_COLORS } from '../theme'

const MASTERY_STATUSES = ['new', 'review', 'mastered']

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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Word encounters and concept mastery for this student.
      </Typography>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        {loading ? <CircularProgress size={14} /> : null}
        {MASTERY_STATUSES.map((status) => {
          const colors = MASTERY_ROW_COLORS[status]
          return (
            <Chip
              key={status}
              size="small"
              label={`${status} ${masteryInventory.counts[status]}`}
              sx={{
                bgcolor: colors.bg,
                color: colors.color,
                textTransform: 'capitalize',
                fontWeight: 600,
              }}
            />
          )
        })}
        <Chip
          size="small"
          variant="outlined"
          label={`${masteryInventory.inScopeCount} in scope`}
        />
        <Chip size="small" variant="outlined" label={`${wordRows.length} unique words`} />
        <Chip
          size="small"
          variant="outlined"
          label={`${wordRows.reduce((sum, row) => sum + row.encounters, 0)} encounters`}
        />
      </Stack>

      {!lessons.length && !loading ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          Save lesson plans to build word-exposure history.
        </Alert>
      ) : null}

      <Box sx={{ mb: 1.5 }}>
        <ConceptCountChart
          compact
          rows={masteryInventory.chartRows}
          totalTokens={masteryInventory.inScopeCount}
          title="Mastery"
          caption={`${masteryInventory.inScopeCount} in scope`}
          emptyLabel="Mark concepts in Scope & Sequence to see mastery here."
          maxBars={3}
        />
      </Box>

      <Paper variant="outlined" sx={{ p: 1, mb: 1.5, minWidth: 0 }}>
        <Box
          sx={{
            height: { xs: 420, md: 'clamp(420px, calc(100vh - 360px), 640px)' },
            width: '100%',
          }}
        >
          <DataGridPro
            rows={masteryInventory.rows}
            columns={MASTERY_COLUMNS}
            getRowId={(row) => row.id}
            density="compact"
            hideFooterSelectedRowCount
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
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

      <Paper variant="outlined" sx={{ p: 1 }}>
        <Box sx={{ height: { xs: 320, md: 400 }, width: '100%' }}>
          <DataGridPro
            rows={wordRows}
            columns={WORD_COLUMNS}
            getRowId={(row) => row.id}
            loading={loading}
            density="compact"
            hideFooterSelectedRowCount
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
