import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ViewListIcon from '@mui/icons-material/ViewList'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import CreateMultiWordPanel from './CreateMultiWordPanel'
import MultiWordPreview from './MultiWordPreview'
import {
  fetchStudentSentencesAndPassages,
  parseListData,
  parseScopeAndSequence,
  resolvePassageFocusId,
  resolveSentenceFocusId,
} from '../lib/fetchStudentLessonPlan'
import { buildWordCatalogIndex, tagMultiWordText } from '../lib/tagMultiWordText'

const MODE_VIEW = 0
const MODE_CREATE = 1
const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']
const MASTERY_ROW_COLORS = {
  unknown: { bg: '#eef6f8', hover: '#e2f0f3', color: '#1a2a2e' },
  new: { bg: '#c5dce1', hover: '#b4d2d8', color: '#1a2a2e' },
  review: { bg: '#7aadb8', hover: '#689faa', color: '#102428' },
  mastered: { bg: '#0f4c5c', hover: '#0c3e4b', color: '#ffffff' },
}

function masteryColors(status) {
  return MASTERY_ROW_COLORS[status] ?? MASTERY_ROW_COLORS.unknown
}

function formatCreatedDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function savedConceptIds(record, dataField) {
  const data = parseListData(record?.[dataField])
  const counts = data.tags?.conceptCounts
  if (!Array.isArray(counts)) return []
  return counts.map((row) => row?.id).filter(Boolean)
}

function ConceptFilterAutocomplete({
  label,
  helperText,
  options,
  value,
  onChange,
  multiple = false,
  required = false,
  disabledIds = [],
}) {
  const disabled = new Set(disabledIds)
  return (
    <Autocomplete
      multiple={multiple}
      fullWidth
      options={options}
      value={value}
      onChange={(_event, next) => onChange(next)}
      groupBy={(option) => (option.inScope ? 'In scope' : 'Not in scope')}
      getOptionLabel={(option) => option?.concept || ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      getOptionDisabled={(option) => disabled.has(option.id)}
      filterSelectedOptions={multiple}
      disableCloseOnSelect={multiple}
      renderTags={(selected, getTagProps) =>
        selected.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index })
          const colors = masteryColors(option.masteryStatus)
          return (
            <Chip
              key={key}
              {...tagProps}
              size="small"
              label={option.concept}
              sx={{
                bgcolor: colors.bg,
                color: colors.color,
                fontWeight: 600,
              }}
            />
          )
        })
      }
      renderOption={(props, option) => {
        const { key, ...optionProps } = props
        const colors = masteryColors(option.masteryStatus)
        return (
          <Box
            component="li"
            key={key}
            {...optionProps}
            sx={{
              bgcolor: `${colors.bg} !important`,
              color: colors.color,
              '&:hover': { bgcolor: `${colors.hover} !important` },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', py: 0.25 }}>
              <Typography variant="body2" sx={{ flex: 1, color: 'inherit' }}>
                {option.concept}
              </Typography>
              <Chip
                size="small"
                label={option.masteryStatus}
                sx={{
                  bgcolor: 'transparent',
                  color: 'inherit',
                  borderColor: 'currentColor',
                  textTransform: 'capitalize',
                }}
                variant="outlined"
              />
            </Stack>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          required={required}
          helperText={helperText}
        />
      )}
    />
  )
}

export default function MultiWordPanel({
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  setError,
}) {
  const [mode, setMode] = useState(MODE_VIEW)
  const [kind, setKind] = useState('sentence')
  const [loading, setLoading] = useState(false)
  const [sentences, setSentences] = useState([])
  const [passages, setPassages] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [focusConceptId, setFocusConceptId] = useState(null)
  const [alsoConceptIds, setAlsoConceptIds] = useState([])
  const [createPreview, setCreatePreview] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!student?.id) {
      setSentences([])
      setPassages([])
      return { sentences: [], passages: [] }
    }
    setLoading(true)
    try {
      const data = await fetchStudentSentencesAndPassages(student.id)
      setSentences(data.sentences ?? [])
      setPassages(data.passages ?? [])
      setError('')
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sentences and passages')
      return { sentences: [], passages: [] }
    } finally {
      setLoading(false)
    }
  }, [student?.id, setError])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setMode(MODE_VIEW)
    setKind('sentence')
    setSelectedId(null)
    setFocusConceptId(null)
    setAlsoConceptIds([])
    setCreatePreview(null)
    setNotice('')
  }, [student?.id])

  const catalogIndex = useMemo(
    () => buildWordCatalogIndex(concepts, wordsByConceptId),
    [concepts, wordsByConceptId],
  )

  const conceptById = useMemo(
    () => new Map((concepts ?? []).map((concept) => [concept.id, concept])),
    [concepts],
  )

  const conceptOptions = useMemo(() => {
    const inventory = parseScopeAndSequence(student?.scopeAndSequence)
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
          concept: concept.concept || 'Untitled concept',
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
  }, [concepts, student?.scopeAndSequence])

  const browseItems = useMemo(() => {
    const source = kind === 'passage' ? passages : sentences
    return source
      .filter((item) => item?.id)
      .map((item) => {
        const dataField = kind === 'passage' ? 'passageData' : 'sentenceData'
        const focusId =
          kind === 'passage' ? resolvePassageFocusId(item) : resolveSentenceFocusId(item)
        const savedIds = savedConceptIds(item, dataField)
        const conceptIds = savedIds.length
          ? savedIds
          : tagMultiWordText(item.text || '', catalogIndex).conceptIds
        const secondaryNames = conceptIds
          .filter((id) => id && id !== focusId)
          .map((id) => conceptById.get(id)?.concept)
          .filter(Boolean)
        return {
          id: item.id,
          kind,
          title: item.title || '',
          text: item.text || '',
          wordCount: item.wordCount ?? 0,
          createdAt: item.createdAt,
          createdLabel: formatCreatedDate(item.createdAt),
          focusConceptId: focusId,
          focusConcept: conceptById.get(focusId)?.concept || '',
          conceptIds,
          secondaryNames,
        }
      })
  }, [kind, passages, sentences, catalogIndex, conceptById])

  const focusValue = conceptOptions.find((item) => item.id === focusConceptId) ?? null
  const alsoValues = alsoConceptIds
    .map((id) => conceptOptions.find((item) => item.id === id))
    .filter(Boolean)

  const filteredRows = useMemo(() => {
    const alsoIds = alsoConceptIds.filter(Boolean)
    return browseItems
      .filter((item) => {
        if (focusConceptId && item.focusConceptId !== focusConceptId) return false
        if (alsoIds.length && !alsoIds.every((id) => item.conceptIds.includes(id))) return false
        return true
      })
      .map((item) => {
        const matchedAlso = alsoIds.filter((id) => item.conceptIds.includes(id))
        return {
          ...item,
          alsoCount: matchedAlso.length,
          alsoLabel: alsoIds.length
            ? matchedAlso.map((id) => conceptById.get(id)?.concept).filter(Boolean).join(', ') || '—'
            : item.secondaryNames.slice(0, 3).join(', ') || '—',
        }
      })
  }, [browseItems, focusConceptId, alsoConceptIds, conceptById])

  const selectedItem =
    filteredRows.find((item) => item.id === selectedId)
    ?? browseItems.find((item) => item.id === selectedId)
    ?? null

  const selectedTagged = useMemo(
    () => (selectedItem ? tagMultiWordText(selectedItem.text || '', catalogIndex) : null),
    [selectedItem, catalogIndex],
  )

  const columns = useMemo(() => {
    const alsoHeader = alsoConceptIds.length ? 'Also includes' : 'Other concepts'
    const base = [
      ...(kind === 'passage'
        ? [
            { field: 'title', headerName: 'Title', flex: 1, minWidth: 110 },
            {
              field: 'text',
              headerName: 'Text',
              flex: 1.4,
              minWidth: 140,
              valueGetter: (value) => truncate(value, 90),
            },
          ]
        : [
            {
              field: 'text',
              headerName: 'Sentence',
              flex: 2,
              minWidth: 160,
              valueGetter: (value) => truncate(value, 120),
            },
          ]),
      { field: 'focusConcept', headerName: 'Focus concept', flex: 1, minWidth: 120 },
      {
        field: 'alsoLabel',
        headerName: alsoHeader,
        flex: 1,
        minWidth: 130,
      },
      {
        field: 'wordCount',
        headerName: 'Words',
        type: 'number',
        width: 80,
        align: 'left',
        headerAlign: 'left',
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        width: 120,
        valueFormatter: (value) => formatCreatedDate(value),
      },
    ]
    if (alsoConceptIds.length) {
      base.splice(kind === 'passage' ? 3 : 2, 0, {
        field: 'alsoCount',
        headerName: 'Match',
        type: 'number',
        width: 80,
        align: 'left',
        headerAlign: 'left',
      })
    }
    return base
  }, [kind, alsoConceptIds.length])

  const preview =
    mode === MODE_CREATE
      ? {
          kind,
          title: createPreview?.title || '',
          text: createPreview?.text || '',
          tagged: createPreview?.tagged,
          focusConceptId: createPreview?.focusConceptId ?? null,
          focusName: createPreview?.focusName || '',
          emptyLabel: 'Type a sentence or passage on the left to see tagging and concept weight.',
        }
      : {
          kind,
          title: selectedItem?.title || '',
          text: selectedItem?.text || '',
          tagged: selectedTagged,
          focusConceptId: selectedItem?.focusConceptId ?? null,
          focusName: selectedItem?.focusConcept || '',
          emptyLabel: 'Select a sentence or passage to see focus, coverage, and concept weight.',
        }

  function handleKindChange(next) {
    if (!next) return
    setKind(next)
    setSelectedId(null)
  }

  function handleFocusChange(next) {
    const nextId = next?.id ?? null
    setFocusConceptId(nextId)
    setAlsoConceptIds((prev) => prev.filter((id) => id !== nextId))
    setSelectedId(null)
  }

  function handleAlsoChange(next) {
    const ids = (next ?? []).map((item) => item.id).filter((id) => id && id !== focusConceptId)
    setAlsoConceptIds(ids)
    setSelectedId(null)
  }

  function handleNew() {
    setMode(MODE_CREATE)
    setNotice('')
  }

  async function handleSaved({ kind: savedKind, id }) {
    setNotice(savedKind === 'passage' ? 'Passage saved.' : 'Sentence saved.')
    const data = await load()
    const list = savedKind === 'passage' ? data.passages : data.sentences
    if (savedKind) setKind(savedKind)
    if (id && (list ?? []).some((item) => item.id === id)) {
      setSelectedId(id)
    }
  }

  if (!student) {
    return (
      <Typography color="text.secondary">
        Select a student to browse or create sentences and passages.
      </Typography>
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
      }}
    >
      <Box sx={{ gridArea: 'work', minWidth: 0 }}>
        <Paper sx={{ p: 2 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 1 }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                variant="outlined"
                label={`${sentences.length} sentences`}
              />
              <Chip size="small" variant="outlined" label={`${passages.length} passages`} />
              {notice ? <Chip size="small" color="success" label={notice} /> : null}
              {loading || loadingCatalog ? <CircularProgress size={16} /> : null}
            </Stack>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleNew}>
              New
            </Button>
          </Stack>

          <Tabs
            value={mode}
            onChange={(_event, value) => setMode(value)}
            variant="fullWidth"
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab icon={<ViewListIcon />} iconPosition="start" label="View multi word" />
            <Tab icon={<AddIcon />} iconPosition="start" label="Create multi word" />
          </Tabs>

          {mode === MODE_VIEW ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Select a saved sentence or passage to preview tagging on the right. Focus concept
                finds an exact focus match. Also includes keeps items that also contain those concepts.
              </Typography>
              <Stack spacing={1.5} sx={{ mb: 1.5 }}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={kind}
                  onChange={(_event, value) => handleKindChange(value)}
                >
                  <ToggleButton value="sentence">Sentences</ToggleButton>
                  <ToggleButton value="passage">Passages</ToggleButton>
                </ToggleButtonGroup>
                <ConceptFilterAutocomplete
                  label="Focus concept"
                  options={conceptOptions}
                  value={focusValue}
                  onChange={handleFocusChange}
                  helperText="Absolutely match this focus concept. Leave empty to browse all."
                />
                <ConceptFilterAutocomplete
                  multiple
                  label="Also includes"
                  options={conceptOptions}
                  value={alsoValues}
                  onChange={handleAlsoChange}
                  disabledIds={focusConceptId ? [focusConceptId] : []}
                  helperText="Optional. Keep items that also include every selected concept."
                />
              </Stack>
              <Box sx={{ height: { xs: 360, md: 'calc(100vh - 420px)' }, minHeight: 280, width: '100%' }}>
                <DataGridPro
                  rows={filteredRows}
                  columns={columns}
                  getRowId={(row) => row.id}
                  onRowClick={(params) => setSelectedId(params.id)}
                  getRowClassName={(params) => (params.id === selectedId ? 'Mui-selected' : '')}
                  loading={loading || loadingCatalog}
                  pagination
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    sorting: { sortModel: [{ field: 'createdAt', sort: 'desc' }] },
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
                    noRowsLabel: focusConceptId
                      ? `No ${kind}s match that focus${alsoConceptIds.length ? ' and also-includes' : ''}. Create one on Create multi word.`
                      : `No saved ${kind}s yet. Switch to Create multi word to make one.`,
                  }}
                />
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Type a sentence or passage. Tagging and concept weight update on the right as you go.
              </Typography>
              <CreateMultiWordPanel
                student={student}
                concepts={concepts}
                wordsByConceptId={wordsByConceptId}
                loadingCatalog={loadingCatalog}
                setError={setError}
                kind={kind}
                onKindChange={handleKindChange}
                onPreviewChange={setCreatePreview}
                onSaved={(payload) => void handleSaved(payload)}
                embedded
              />
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
        }}
      >
        <MultiWordPreview {...preview} />
      </Box>
    </Box>
  )
}
