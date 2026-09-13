/**
 * Content-page data operations: audit, spell check, dictionary writes, and findings.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ImportContactsIcon from '@mui/icons-material/ImportContacts'
import NotesIcon from '@mui/icons-material/Notes'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import { DataGrid } from '@mui/x-data-grid'
import DictionaryWordTooltip from './DictionaryWordTooltip'
import ConceptChip from '../content/ConceptTooltip'
import {
  addCatalogWords,
  approveDataQualityFinding,
  approveDataQualityFindings,
  conceptOgCoverage,
  conceptsMissingOgDescription,
  DESCRIPTION_BATCH_SIZE,
  fetchDataQualityFindings,
  generateConceptDescriptions,
  generateDictionaryDefinitions,
  rejectDataQualityFinding,
  rejectDataQualityFindings,
  runDataQualityAudit,
  runSpellCheck,
} from '../../lib/dataQuality'
import {
  COVERAGE_FILTER,
  DICTIONARY_BATCH_LIMIT,
  DICTIONARY_WRITE_LIMIT,
  SPELL_CHECK_BATCH_LIMIT,
  dictionaryCoverage,
  realCatalogWordIds,
  wordsMissingDictionaryData,
} from '../../lib/dictionaryData'
import { assignedConcepts, tagCoverage, TAG_FILTER, uniqueCatalogWords, wordLabelById, wordTagCountById } from '../../lib/wordConcepts'
import { matchesCatalogFilter, TEXT_FILTER, wordsContainingSpace } from '../../lib/catalogFilters'

const VIEW_OPEN = 'open'
const VIEW_HISTORY = 'history'
const CATALOG_FILTER_LABELS = {
  [COVERAGE_FILTER.WITH_DEFINITIONS]: 'with definitions',
  [COVERAGE_FILTER.MISSING_DEFINITIONS]: 'without definitions',
  [COVERAGE_FILTER.INVALID_WORDS]: 'not valid words',
  [TAG_FILTER.UNTAGGED]: 'untagged',
  [TAG_FILTER.ONE_TAG]: 'with 1 tag',
  [TAG_FILTER.TWO_TAGS]: 'with 2 tags',
  [TEXT_FILTER.CONTAINS_SPACE]: 'that contain a space',
}
const AUDIT_SIZES = [
  { value: 10, label: 'Small (10)' },
  { value: 25, label: 'Medium (25)' },
  { value: 100, label: 'Large (100)' },
]
const ADD_WORD_SIZES = AUDIT_SIZES

function emptySelection() {
  return { type: 'include', ids: new Set() }
}

function selectedRowIds(model, allIds) {
  if (!model) return []
  if (model.type === 'exclude') {
    const excluded = model.ids ?? new Set()
    return allIds.filter((id) => !excluded.has(id))
  }
  return [...(model.ids ?? [])]
}

function formatConfidence(value) {
  if (value == null || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (number >= 0 && number <= 1) return `${Math.round(number * 100)}%`
  return number.toFixed(2)
}

function statusOf(row) {
  return String(row?.status || '').toUpperCase()
}

function matchesIssueView(row, view) {
  const status = statusOf(row)
  if (view === VIEW_HISTORY) return status === 'APPROVED' || status === 'REJECTED'
  return status === 'OPEN'
}

function openRows(rows, selectedIds) {
  return rows.filter((row) => selectedIds.includes(row.id) && statusOf(row) === 'OPEN')
}

function pickRandomIds(words, size) {
  const ids = (words ?? []).map((word) => word?.id).filter(Boolean)
  const next = ids.slice()
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = next[i]
    next[i] = next[j]
    next[j] = current
  }
  return next.slice(0, size)
}

function chunkIds(ids, size) {
  const batches = []
  for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size))
  return batches
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function IssueViewToggle({ value, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_event, next) => {
        if (next) onChange(next)
      }}
      aria-label="Issue view"
    >
      <ToggleButton value={VIEW_OPEN}>Open Issues</ToggleButton>
      <ToggleButton value={VIEW_HISTORY}>History</ToggleButton>
    </ToggleButtonGroup>
  )
}

function FindingsToolbar({
  selectedCount,
  onApproveSelected,
  onRejectSelected,
  busy,
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
      <Button
        size="small"
        variant="contained"
        disabled={selectedCount < 1 || busy}
        onClick={onApproveSelected}
      >
        {busy ? 'Working…' : `Approve Selected${selectedCount ? ` (${selectedCount})` : ''}`}
      </Button>
      <Button
        size="small"
        color="error"
        variant="outlined"
        disabled={selectedCount < 1 || busy}
        onClick={onRejectSelected}
      >
        Reject Selected
      </Button>
    </Stack>
  )
}

export default function DataQualityPanel({
  scope = 'words',
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  onCatalogReload,
  setError,
  coverageFilter = null,
  onCoverageFilterChange,
}) {
  const [findings, setFindings] = useState([])
  const [loading, setLoading] = useState(true)
  const [auditing, setAuditing] = useState(false)
  const [auditSize, setAuditSize] = useState(25)
  const [addingWords, setAddingWords] = useState(false)
  const [addWordSize, setAddWordSize] = useState(25)
  const [spellChecking, setSpellChecking] = useState(false)
  const [spellProgress, setSpellProgress] = useState(null)
  const [writingDefinitions, setWritingDefinitions] = useState(false)
  const [dictionaryProgress, setDictionaryProgress] = useState(null)
  const [generatingDescriptions, setGeneratingDescriptions] = useState(false)
  const [descriptionProgress, setDescriptionProgress] = useState(null)
  const [rowBusyId, setRowBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectionModel, setSelectionModel] = useState(emptySelection)
  const [wordIssueView, setWordIssueView] = useState(VIEW_OPEN)

  const conceptById = useMemo(
    () => new Map((concepts ?? []).map((concept) => [concept.id, concept])),
    [concepts],
  )
  const wordsById = useMemo(
    () => wordLabelById(wordsByConceptId, catalogWords),
    [wordsByConceptId, catalogWords],
  )
  const catalogWordById = useMemo(() => {
    const map = new Map()
    for (const word of catalogWords ?? []) {
      if (word?.id) map.set(word.id, word)
    }
    return map
  }, [catalogWords])

  const coverage = useMemo(() => dictionaryCoverage(catalogWords), [catalogWords])
  const uniqueWords = useMemo(
    () => uniqueCatalogWords(catalogWords, wordsByConceptId),
    [catalogWords, wordsByConceptId],
  )
  const tagCounts = useMemo(() => wordTagCountById(wordsByConceptId), [wordsByConceptId])
  const tags = useMemo(() => tagCoverage(uniqueWords, wordsByConceptId), [uniqueWords, wordsByConceptId])
  const spaceCount = useMemo(() => wordsContainingSpace(uniqueWords).length, [uniqueWords])
  const filteredWords = useMemo(() => {
    if (!coverageFilter) return uniqueWords
    return uniqueWords.filter((word) =>
      matchesCatalogFilter(word, coverageFilter, tagCounts.get(word.id) ?? 0),
    )
  }, [coverageFilter, uniqueWords, tagCounts])
  const ogCoverage = useMemo(() => conceptOgCoverage(concepts), [concepts])

  function toggleCoverageFilter(next) {
    onCoverageFilterChange?.(coverageFilter === next ? null : next)
  }

  const loadFindings = useCallback(async () => {
    setLoading(true)
    try {
      const items = await fetchDataQualityFindings()
      setFindings(items)
      setError('')
    } catch (err) {
      setFindings([])
      setError(err instanceof Error ? err.message : 'Failed to load data quality findings')
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => {
    setNotice('')
  }, [scope])

  useEffect(() => {
    if (scope !== 'words') return
    void loadFindings()
  }, [loadFindings, scope])

  const rows = useMemo(
    () =>
      (findings ?? [])
        .filter((item) => item?.id)
        .map((item) => ({
          id: item.id,
          wordId: item.wordId,
          word: wordsById.get(item.wordId) || item.wordId || '—',
          recommendedConceptId: item.recommendedConceptId,
          concept:
            conceptById.get(item.recommendedConceptId)?.concept ||
            item.recommendedConceptId ||
            '—',
          suggestedSpelling: item.suggestedSpelling || '',
          actionType: item.actionType || '',
          reason: item.reason || '',
          status: item.status || 'OPEN',
          confidence: item.confidence,
          finding: item,
        })),
    [findings, wordsById, conceptById],
  )

  const wordRows = useMemo(
    () => rows.filter((row) => matchesIssueView(row, wordIssueView)),
    [rows, wordIssueView],
  )

  const selectedIds = useMemo(
    () => selectedRowIds(selectionModel, wordRows.map((row) => row.id)),
    [selectionModel, wordRows],
  )
  const selectedOpen = useMemo(() => openRows(wordRows, selectedIds), [wordRows, selectedIds])

  const handleApproveOne = useCallback(
    async (finding) => {
      if (!finding?.id) return
      setRowBusyId(finding.id)
      try {
        await approveDataQualityFinding(finding, wordsByConceptId)
        setNotice('Finding approved.')
        setError('')
        setSelectionModel((current) => {
          const ids = new Set(current?.ids ?? [])
          ids.delete(finding.id)
          return { type: current?.type || 'include', ids }
        })
        await onCatalogReload?.()
        await loadFindings()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to approve finding')
      } finally {
        setRowBusyId(null)
      }
    },
    [wordsByConceptId, onCatalogReload, loadFindings, setError],
  )

  const handleRejectOne = useCallback(
    async (finding) => {
      if (!finding?.id) return
      setRowBusyId(finding.id)
      try {
        await rejectDataQualityFinding(finding)
        setNotice('Finding rejected.')
        setError('')
        setSelectionModel((current) => {
          const ids = new Set(current?.ids ?? [])
          ids.delete(finding.id)
          return { type: current?.type || 'include', ids }
        })
        await loadFindings()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject finding')
      } finally {
        setRowBusyId(null)
      }
    },
    [loadFindings, setError],
  )

  const findingColumns = useMemo(
    () => [
      {
        field: 'word',
        headerName: 'Word',
        flex: 0.8,
        minWidth: 120,
        renderCell: (params) => {
          const catalogWord = catalogWordById.get(params.row.wordId)
          const tagged = assignedConcepts(params.row.wordId, wordsByConceptId, concepts)
          return (
            <DictionaryWordTooltip
              word={params.row.word}
              dictionaryData={catalogWord?.dictionaryData}
              taggedConcepts={tagged}
            >
              {params.row.word}
            </DictionaryWordTooltip>
          )
        },
      },
      { field: 'concept', headerName: 'Recommended concept', flex: 1, minWidth: 140,
        renderCell: (params) => {
          const full = conceptById.get(params.row.recommendedConceptId)
          if (!full) return params.row.concept
          return <ConceptChip concept={full} />
        },
      },
      { field: 'suggestedSpelling', headerName: 'Suggested spelling', flex: 0.8, minWidth: 140 },
      { field: 'actionType', headerName: 'Action', width: 120 },
      {
        field: 'reason',
        headerName: 'Reason',
        flex: 1.4,
        minWidth: 180,
        cellClassName: 'reason-cell',
        renderCell: (params) => (
          <Box
            sx={{
              py: 0.75,
              pr: 1,
              width: '100%',
              minWidth: 0,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              lineHeight: 1.35,
            }}
          >
            {params.value || '—'}
          </Box>
        ),
      },
      {
        field: 'confidence',
        headerName: 'Confidence',
        type: 'number',
        width: 120,
        valueFormatter: (value) => formatConfidence(value),
      },
      { field: 'status', headerName: 'Status', width: 120 },
      {
        field: 'actions',
        headerName: '',
        width: 210,
        minWidth: 210,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => {
          const open = String(params.row.status || '').toUpperCase() === 'OPEN'
          if (!open) return null
          const busy = rowBusyId === params.row.id || bulkBusy
          return (
            <Stack direction="row" spacing={0.75} onClick={(event) => event.stopPropagation()}>
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => void handleApproveOne(params.row.finding)}
              >
                {rowBusyId === params.row.id ? '…' : 'Approve'}
              </Button>
              <Button
                size="small"
                color="error"
                variant="outlined"
                disabled={busy}
                onClick={() => void handleRejectOne(params.row.finding)}
              >
                Reject
              </Button>
            </Stack>
          )
        },
      },
    ],
    [rowBusyId, bulkBusy, handleApproveOne, handleRejectOne, catalogWordById, wordsByConceptId, concepts, conceptById],
  )

  async function handleRunAudit() {
    if (coverageFilter && !filteredWords.length) {
      setNotice(`No words ${CATALOG_FILTER_LABELS[coverageFilter]} were available to audit.`)
      return
    }
    setAuditing(true)
    try {
      const wordIds = coverageFilter ? pickRandomIds(filteredWords, auditSize) : []
      const result = await runDataQualityAudit(auditSize, wordIds)
      setNotice(result.message || 'Audit finished.')
      setError('')
      await loadFindings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run audit')
    } finally {
      setAuditing(false)
    }
  }

  async function handleAddWords() {
    setAddingWords(true)
    try {
      let added = 0
      let lastMessage = 'Added catalog words.'
      for (let attempt = 0; attempt < 3 && added < 1; attempt += 1) {
        const result = await addCatalogWords(addWordSize)
        added = Number(result.createdCount ?? 0)
        lastMessage = result.message || lastMessage
        if (added > 0) break
      }
      setNotice(lastMessage)
      setError('')
      await onCatalogReload?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add catalog words')
      await onCatalogReload?.()
    } finally {
      setAddingWords(false)
    }
  }

  async function handleRunSpellCheck() {
    const ids = realCatalogWordIds(catalogWords)
    if (!ids.length) {
      setNotice('No real catalog words were available to spell-check.')
      return
    }
    const batches = chunkIds(ids, SPELL_CHECK_BATCH_LIMIT)
    setSpellChecking(true)
    setSpellProgress({ processed: 0, total: ids.length, created: 0 })
    let created = 0
    try {
      for (let index = 0; index < batches.length; index += 1) {
        const result = await runSpellCheck(batches[index])
        created += Number(result.createdCount ?? 0)
        setSpellProgress({
          processed: Math.min((index + 1) * SPELL_CHECK_BATCH_LIMIT, ids.length),
          total: ids.length,
          created,
        })
        if (index < batches.length - 1) await wait(150)
      }
      setNotice(
        created
          ? `Checked ${ids.length} words and created ${created} spelling finding${created === 1 ? '' : 's'}.`
          : `Checked ${ids.length} words. No high-confidence misspellings were found.`,
      )
      setError('')
      await loadFindings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run spell check')
      await loadFindings()
    } finally {
      setSpellChecking(false)
      setSpellProgress(null)
    }
  }

  async function handleWriteDictionaryDefinitions() {
    const batch = wordsMissingDictionaryData(catalogWords).slice(0, DICTIONARY_WRITE_LIMIT)
    if (!batch.length) {
      setNotice('No catalog words still need dictionary data.')
      return
    }
    const total = batch.length
    const batches = chunkIds(batch.map((word) => word.id), DICTIONARY_BATCH_LIMIT)
    setWritingDefinitions(true)
    setDictionaryProgress({ processed: 0, total })
    let written = 0
    try {
      for (let index = 0; index < batches.length; index += 1) {
        const result = await generateDictionaryDefinitions(batches[index])
        written += Number(result.createdCount ?? 0)
        setDictionaryProgress({
          processed: Math.min((index + 1) * DICTIONARY_BATCH_LIMIT, total),
          total,
        })
        if (index < batches.length - 1) await wait(150)
      }
      await onCatalogReload?.()
      setNotice(`Wrote dictionary definitions for ${written} of ${total} word${total === 1 ? '' : 's'}.`)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to write dictionary definitions')
      await onCatalogReload?.()
    } finally {
      setWritingDefinitions(false)
      setDictionaryProgress(null)
    }
  }

  async function handleApproveSelected() {
    const selected = selectedOpen.map((row) => row.finding ?? row).filter((item) => item?.id)
    if (!selected.length) return
    setBulkBusy(true)
    try {
      const count = await approveDataQualityFindings(selected, wordsByConceptId)
      setNotice(`Approved ${count} finding${count === 1 ? '' : 's'}.`)
      setError('')
      setSelectionModel(emptySelection())
      await onCatalogReload?.()
      await loadFindings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve selected findings')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleRejectSelected() {
    const selected = selectedOpen.map((row) => row.finding ?? row).filter((item) => item?.id)
    if (!selected.length) return
    setBulkBusy(true)
    try {
      const count = await rejectDataQualityFindings(selected)
      setNotice(`Rejected ${count} finding${count === 1 ? '' : 's'}.`)
      setError('')
      setSelectionModel(emptySelection())
      await loadFindings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject selected findings')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleGenerateOgDescriptions() {
    const missing = conceptsMissingOgDescription(concepts)
    if (!missing.length) {
      setNotice('All catalog concepts already have OG descriptions.')
      return
    }
    const batches = chunkIds(missing.map((concept) => concept.id), DESCRIPTION_BATCH_SIZE)
    setGeneratingDescriptions(true)
    setDescriptionProgress({ processed: 0, total: missing.length })
    let written = 0
    try {
      for (let index = 0; index < batches.length; index += 1) {
        const result = await generateConceptDescriptions(batches[index])
        written += Number(result.createdCount ?? 0)
        setDescriptionProgress({
          processed: Math.min((index + 1) * DESCRIPTION_BATCH_SIZE, missing.length),
          total: missing.length,
        })
        if (index < batches.length - 1) await wait(150)
      }
      await onCatalogReload?.()
      setNotice(
        `Wrote OG descriptions for ${written} of ${missing.length} concept${missing.length === 1 ? '' : 's'}.`,
      )
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate OG descriptions')
      await onCatalogReload?.()
    } finally {
      setGeneratingDescriptions(false)
      setDescriptionProgress(null)
    }
  }

  const running = auditing || addingWords || spellChecking || writingDefinitions || generatingDescriptions
  const dictionaryProgressValue =
    dictionaryProgress?.total > 0
      ? Math.round((dictionaryProgress.processed / dictionaryProgress.total) * 100)
      : 0
  const spellProgressValue =
    spellProgress?.total > 0
      ? Math.round((spellProgress.processed / spellProgress.total) * 100)
      : 0
  const descriptionProgressValue =
    descriptionProgress?.total > 0
      ? Math.round((descriptionProgress.processed / descriptionProgress.total) * 100)
      : 0

  if (scope === 'none') {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Data operations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          No data operations currently.
        </Typography>
      </Paper>
    )
  }

  if (scope === 'concepts') {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Data operations
            </Typography>
            {notice ? <Chip size="small" color="success" label={notice} /> : null}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label={`${ogCoverage.withDescriptions} with OG descriptions`}
            />
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`${ogCoverage.missingDescriptions} without OG descriptions`}
            />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              startIcon={
                generatingDescriptions ? <CircularProgress size={16} color="inherit" /> : <NotesIcon />
              }
              onClick={() => void handleGenerateOgDescriptions()}
              disabled={running}
            >
              {generatingDescriptions ? 'Writing descriptions…' : 'Generate OG Descriptions'}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Generates OG rule descriptions for catalog concepts that are still missing one, in batches
            of {DESCRIPTION_BATCH_SIZE}. Existing descriptions are left unchanged.
          </Typography>

          {descriptionProgress ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.75 }}>
                Processed {descriptionProgress.processed} of {descriptionProgress.total} concepts
              </Typography>
              <LinearProgress
                variant={descriptionProgress.processed === 0 ? 'indeterminate' : 'determinate'}
                value={descriptionProgressValue}
              />
            </Box>
          ) : null}
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Data operations
          </Typography>
          {notice ? <Chip size="small" color="success" label={notice} /> : null}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            clickable
            size="small"
            color="success"
            variant={coverageFilter === COVERAGE_FILTER.WITH_DEFINITIONS ? 'filled' : 'outlined'}
            label={`${coverage.withDefinitions} with definitions`}
            aria-pressed={coverageFilter === COVERAGE_FILTER.WITH_DEFINITIONS}
            onClick={() => toggleCoverageFilter(COVERAGE_FILTER.WITH_DEFINITIONS)}
          />
          <Chip
            clickable
            size="small"
            color="warning"
            variant={coverageFilter === COVERAGE_FILTER.MISSING_DEFINITIONS ? 'filled' : 'outlined'}
            label={`${coverage.missingDefinitions} without definitions`}
            aria-pressed={coverageFilter === COVERAGE_FILTER.MISSING_DEFINITIONS}
            onClick={() => toggleCoverageFilter(COVERAGE_FILTER.MISSING_DEFINITIONS)}
          />
          <Chip
            clickable
            size="small"
            variant={coverageFilter === COVERAGE_FILTER.INVALID_WORDS ? 'filled' : 'outlined'}
            label={`${coverage.invalidWords} not valid words`}
            aria-pressed={coverageFilter === COVERAGE_FILTER.INVALID_WORDS}
            onClick={() => toggleCoverageFilter(COVERAGE_FILTER.INVALID_WORDS)}
          />
          <Chip
            clickable
            size="small"
            color="error"
            variant={coverageFilter === TEXT_FILTER.CONTAINS_SPACE ? 'filled' : 'outlined'}
            label={`${spaceCount} contain a space`}
            aria-pressed={coverageFilter === TEXT_FILTER.CONTAINS_SPACE}
            onClick={() => toggleCoverageFilter(TEXT_FILTER.CONTAINS_SPACE)}
          />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            clickable
            size="small"
            color="warning"
            variant={coverageFilter === TAG_FILTER.UNTAGGED ? 'filled' : 'outlined'}
            label={`${tags.untagged} untagged`}
            aria-pressed={coverageFilter === TAG_FILTER.UNTAGGED}
            onClick={() => toggleCoverageFilter(TAG_FILTER.UNTAGGED)}
          />
          <Chip
            clickable
            size="small"
            variant={coverageFilter === TAG_FILTER.ONE_TAG ? 'filled' : 'outlined'}
            label={`${tags.oneTag} with 1 tag`}
            aria-pressed={coverageFilter === TAG_FILTER.ONE_TAG}
            onClick={() => toggleCoverageFilter(TAG_FILTER.ONE_TAG)}
          />
          <Chip
            clickable
            size="small"
            variant={coverageFilter === TAG_FILTER.TWO_TAGS ? 'filled' : 'outlined'}
            label={`${tags.twoTags} with 2 tags`}
            aria-pressed={coverageFilter === TAG_FILTER.TWO_TAGS}
            onClick={() => toggleCoverageFilter(TAG_FILTER.TWO_TAGS)}
          />
        </Stack>
        {coverageFilter === TEXT_FILTER.CONTAINS_SPACE ? (
          <Typography variant="body2" color="error">
            Catalog entries with a space are almost certainly errors. Review them in the grid below,
            then fix or remove them.
          </Typography>
        ) : coverageFilter ? (
          <Typography variant="body2" color="text.secondary">
            Catalog is filtered to words {CATALOG_FILTER_LABELS[coverageFilter]}. Click the chip again
            to show all words.
          </Typography>
        ) : null}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="add-word-size-label">Add words</InputLabel>
            <Select
              labelId="add-word-size-label"
              label="Add words"
              value={addWordSize}
              onChange={(event) => setAddWordSize(Number(event.target.value))}
              disabled={running}
            >
              {ADD_WORD_SIZES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={addingWords ? <CircularProgress size={16} color="inherit" /> : <PlaylistAddIcon />}
            onClick={() => void handleAddWords()}
            disabled={running}
          >
            {addingWords ? 'Adding words…' : 'Add Words'}
          </Button>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="audit-size-label">Audit size</InputLabel>
            <Select
              labelId="audit-size-label"
              label="Audit size"
              value={auditSize}
              onChange={(event) => setAuditSize(Number(event.target.value))}
              disabled={running}
            >
              {AUDIT_SIZES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            onClick={() => void handleRunAudit()}
            disabled={running || Boolean(coverageFilter && !filteredWords.length)}
          >
            {auditing
              ? 'Running audit…'
              : coverageFilter
                ? `Run Audit (${CATALOG_FILTER_LABELS[coverageFilter]})`
                : 'Run Audit'}
          </Button>
          <Button variant="outlined" onClick={() => void handleRunSpellCheck()} disabled={running}>
            {spellChecking ? 'Checking spelling…' : 'Run Spell Check'}
          </Button>
          <Button
            variant="outlined"
            startIcon={
              writingDefinitions ? <CircularProgress size={16} color="inherit" /> : <ImportContactsIcon />
            }
            onClick={() => void handleWriteDictionaryDefinitions()}
            disabled={running}
          >
            {writingDefinitions ? 'Writing definitions…' : 'Write Dictionary Definitions'}
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Catalog flow: Add Words (the model sees every word already in the database, then writes
          10, 25, or 100 net-new real words) → Write Dictionary Definitions → Run Audit to suggest
          concept tags. Select a chip first to audit only that subset (untagged, 1 tag, 2 tags,
          words with a space, and the definition chips). Spell check reviews every real word in
          batches of {SPELL_CHECK_BATCH_LIMIT}. Dictionary writes up to {DICTIONARY_WRITE_LIMIT}{' '}
          words still missing a definition, in batches of {DICTIONARY_BATCH_LIMIT}. Approve applies
          ADD/REMOVE tags or the suggested spelling; Reject only closes the finding.
        </Typography>

        {dictionaryProgress ? (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.75 }}>
              Processed {dictionaryProgress.processed} of {dictionaryProgress.total} words
            </Typography>
            <LinearProgress
              variant={dictionaryProgress.processed === 0 ? 'indeterminate' : 'determinate'}
              value={dictionaryProgressValue}
            />
          </Box>
        ) : null}

        {spellProgress ? (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.75 }}>
              Checked {spellProgress.processed} of {spellProgress.total} words
              {spellProgress.created
                ? ` · ${spellProgress.created} finding${spellProgress.created === 1 ? '' : 's'} so far`
                : ''}
            </Typography>
            <LinearProgress
              variant={spellProgress.processed === 0 ? 'indeterminate' : 'determinate'}
              value={spellProgressValue}
            />
          </Box>
        ) : null}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <IssueViewToggle
            value={wordIssueView}
            onChange={(next) => {
              setWordIssueView(next)
              setSelectionModel(emptySelection())
            }}
          />
        </Stack>

        <FindingsToolbar
          selectedCount={selectedOpen.length}
          onApproveSelected={() => void handleApproveSelected()}
          onRejectSelected={() => void handleRejectSelected()}
          busy={bulkBusy}
        />

        <Box sx={{ height: 360, minHeight: 280, width: '100%' }}>
          <DataGrid
            rows={wordRows}
            columns={findingColumns}
            checkboxSelection
            disableRowSelectionOnClick
            getRowHeight={() => 'auto'}
            rowSelectionModel={selectionModel}
            onRowSelectionModelChange={setSelectionModel}
            isRowSelectable={(params) => statusOf(params.row) === 'OPEN'}
            loading={loading}
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'confidence', sort: 'desc' }] },
            }}
            density="compact"
            sx={{
              '& .MuiDataGrid-cell': {
                alignItems: 'flex-start',
                overflow: 'visible',
                py: 0.5,
              },
              '& .MuiDataGrid-cell.reason-cell': {
                overflow: 'hidden',
                whiteSpace: 'normal',
              },
            }}
            localeText={{
              noRowsLabel:
                wordIssueView === VIEW_HISTORY
                  ? 'No approved or rejected findings yet.'
                  : 'No open findings. Run Audit or Spell Check to generate suggestions.',
            }}
          />
        </Box>
      </Stack>
    </Paper>
  )
}
