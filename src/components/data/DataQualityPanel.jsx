/**
 * Shared catalog audit queue: tag audit, spell check, OG descriptions, approve/reject.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CategoryIcon from '@mui/icons-material/Category'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import ImportContactsIcon from '@mui/icons-material/ImportContacts'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import HelpTip from '../shared/HelpTip'
import DictionaryWordTooltip, { DictionaryEntryCard } from './DictionaryWordTooltip'
import { client } from '../../lib/amplifyClient'
import {
  approveDataQualityFinding,
  approveDataQualityFindings,
  fetchDataQualityFindings,
  fetchWordDictionaryEntries,
  generateConceptDescriptions,
  generateDictionaryDefinitions,
  rejectDataQualityFinding,
  rejectDataQualityFindings,
  runDataQualityAudit,
  runSpellCheck,
} from '../../lib/dataQuality'
import { DICTIONARY_BATCH_LIMIT, parseDictionaryData, wordsMissingDictionaryData } from '../../lib/dictionaryData'
import { assignedConcepts, wordLabelById } from '../../lib/wordConcepts'

const TAB_WORDS = 'words'
const TAB_CONCEPTS = 'concepts'
const TAB_DEFINITIONS = 'definitions'
const VIEW_OPEN = 'open'
const VIEW_HISTORY = 'history'
const DESCRIPTION_BATCH_SIZE = 25

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

function chunkIds(ids, size) {
  const batches = []
  for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size))
  return batches
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
  ...toolbarProps
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        width: '100%',
        px: 1,
        py: 0.75,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <GridToolbar {...toolbarProps} />
      </Box>
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
    </Box>
  )
}

export default function DataQualityPanel({
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  onCatalogReload,
  onConceptUpdated,
  setError,
}) {
  const [tab, setTab] = useState(TAB_WORDS)
  const [findings, setFindings] = useState([])
  const [loading, setLoading] = useState(true)
  const [auditing, setAuditing] = useState(false)
  const [spellChecking, setSpellChecking] = useState(false)
  const [writingDefinitions, setWritingDefinitions] = useState(false)
  const [dictionaryProgress, setDictionaryProgress] = useState(null)
  const [generatedDefinitions, setGeneratedDefinitions] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(null)
  const [rowBusyId, setRowBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectionModel, setSelectionModel] = useState(emptySelection)
  const [savingConceptId, setSavingConceptId] = useState(null)
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
    void loadFindings()
  }, [loadFindings])

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

  const conceptRows = useMemo(
    () =>
      (concepts ?? [])
        .filter((concept) => concept?.id)
        .map((concept) => ({
          id: concept.id,
          concept: concept.concept || 'Untitled concept',
          category: concept.category || '',
          subcategory: concept.subcategory || '',
          level: concept.level || '',
          ogDescription: concept.ogDescription || '',
        })),
    [concepts],
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
      { field: 'concept', headerName: 'Recommended concept', flex: 1, minWidth: 140 },
      { field: 'suggestedSpelling', headerName: 'Suggested spelling', flex: 0.8, minWidth: 140 },
      { field: 'actionType', headerName: 'Action', width: 120 },
      { field: 'reason', headerName: 'Reason', flex: 1.4, minWidth: 180 },
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
    [rowBusyId, bulkBusy, handleApproveOne, handleRejectOne, catalogWordById, wordsByConceptId, concepts],
  )

  const conceptColumns = useMemo(
    () => [
      { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 160 },
      { field: 'category', headerName: 'Category', flex: 0.8, minWidth: 120 },
      { field: 'subcategory', headerName: 'Subcategory', flex: 0.8, minWidth: 120 },
      { field: 'level', headerName: 'Level', width: 90 },
      {
        field: 'ogDescription',
        headerName: 'OG description',
        flex: 1,
        minWidth: 400,
        editable: true,
      },
    ],
    [],
  )

  async function handleRunAudit() {
    setAuditing(true)
    try {
      const result = await runDataQualityAudit()
      setNotice(result.message || 'Audit finished.')
      setError('')
      await loadFindings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run audit')
    } finally {
      setAuditing(false)
    }
  }

  async function handleRunSpellCheck() {
    setSpellChecking(true)
    try {
      const result = await runSpellCheck()
      setNotice(result.message || 'Spell check finished.')
      setError('')
      await loadFindings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run spell check')
    } finally {
      setSpellChecking(false)
    }
  }

  async function handleWriteDictionaryDefinitions() {
    const batch = wordsMissingDictionaryData(catalogWords).slice(0, DICTIONARY_BATCH_LIMIT)
    if (!batch.length) {
      setNotice('No catalog words still need dictionary data.')
      return
    }
    const total = batch.length
    const batchIds = batch.map((word) => word.id)
    setWritingDefinitions(true)
    setDictionaryProgress({ processed: 0, total })
    setNotice(`Processed 0 of ${total} words`)
    try {
      const result = await generateDictionaryDefinitions(batchIds)
      const processed = Number(result.createdCount ?? 0)
      setDictionaryProgress({ processed, total })
      setNotice(result.message || `Processed ${processed} of ${total} words`)
      setError('')
      const mutationEntries = (result.entries ?? []).filter((item) => item?.id)
      const fetched = mutationEntries.length
        ? mutationEntries
        : await fetchWordDictionaryEntries(batchIds)
      setGeneratedDefinitions(
        fetched.map((item) => ({
          id: item.id,
          word: item.word || wordsById.get(item.id) || item.id,
          dictionaryData: parseDictionaryData(item.dictionaryData),
        })),
      )
      await onCatalogReload?.()
      setTab(TAB_DEFINITIONS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to write dictionary definitions')
    } finally {
      setWritingDefinitions(false)
      setDictionaryProgress(null)
    }
  }

  async function handleGenerateDescriptions() {
    const ids = (concepts ?? []).map((concept) => concept?.id).filter(Boolean)
    if (!ids.length) {
      setNotice('No catalog concepts were available to describe.')
      return
    }
    const batches = chunkIds(ids, DESCRIPTION_BATCH_SIZE)
    setGenerating(true)
    setGenerateProgress({
      batch: 1,
      batchCount: batches.length,
      processed: 0,
      total: ids.length,
    })
    let written = 0
    try {
      for (let index = 0; index < batches.length; index += 1) {
        const processed = Math.min(index * DESCRIPTION_BATCH_SIZE, ids.length)
        setGenerateProgress({
          batch: index + 1,
          batchCount: batches.length,
          processed,
          total: ids.length,
        })
        const result = await generateConceptDescriptions(batches[index])
        written += Number(result.createdCount ?? 0)
        setGenerateProgress({
          batch: index + 1,
          batchCount: batches.length,
          processed: Math.min((index + 1) * DESCRIPTION_BATCH_SIZE, ids.length),
          total: ids.length,
        })
      }
      setNotice(`Wrote OG descriptions for ${written} concept${written === 1 ? '' : 's'}.`)
      setError('')
      await onCatalogReload?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate OG descriptions')
      await onCatalogReload?.()
    } finally {
      setGenerating(false)
      setGenerateProgress(null)
    }
  }

  async function handleApproveSelected(selectedFindings) {
    const selected = (selectedFindings ?? selectedOpen).map((row) => row.finding ?? row).filter((item) => item?.id)
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

  async function handleRejectSelected(selectedFindings) {
    const selected = (selectedFindings ?? selectedOpen).map((row) => row.finding ?? row).filter((item) => item?.id)
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

  async function handleConceptRowUpdate(newRow, oldRow) {
    const next = String(newRow.ogDescription ?? '').trim()
    const previous = String(oldRow.ogDescription ?? '').trim()
    if (next === previous) return { ...oldRow, ogDescription: previous }
    if (!client.models.Concept) {
      throw new Error('The concept catalog is still deploying. Wait for Amplify to finish, then try again.')
    }
    setSavingConceptId(newRow.id)
    try {
      const { data, errors } = await client.models.Concept.update({
        id: newRow.id,
        ogDescription: next,
      })
      if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
      const saved = data?.ogDescription ?? next
      onConceptUpdated?.({
        id: newRow.id,
        ogDescription: saved,
      })
      setNotice('OG description saved.')
      setError('')
      return { ...newRow, ogDescription: saved }
    } finally {
      setSavingConceptId(null)
    }
  }

  const running = auditing || spellChecking

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <FactCheckOutlinedIcon color="action" />
        <Typography variant="h5">Data Quality</Typography>
        <HelpTip title="Audit word-concept tags, flag misspellings, write dictionary definitions, and generate Orton-Gillingham rule descriptions. After a dictionary batch, open the Definitions tab to review the LLM output. Approve applies catalog changes; Reject only closes the finding." />
        {notice ? <Chip size="small" color="success" label={notice} /> : null}
      </Stack>
      <Paper variant="outlined" sx={{ px: 1.5, pt: 0.5, mb: 2 }}>
        <Tabs value={tab} onChange={(_event, value) => setTab(value)}>
          <Tab value={TAB_WORDS} icon={<MenuBookIcon />} iconPosition="start" label="Words" />
          <Tab value={TAB_CONCEPTS} icon={<CategoryIcon />} iconPosition="start" label="Concepts" />
          <Tab
            value={TAB_DEFINITIONS}
            icon={<AutoStoriesIcon />}
            iconPosition="start"
            label={
              generatedDefinitions?.length
                ? `Definitions (${generatedDefinitions.length})`
                : 'Definitions'
            }
          />
        </Tabs>
      </Paper>

      {tab === TAB_WORDS && (
        <WordsTabContent
          auditing={auditing}
          spellChecking={spellChecking}
          writingDefinitions={writingDefinitions}
          dictionaryProgress={dictionaryProgress}
          running={running}
          bulkBusy={bulkBusy}
          selectedOpen={selectedOpen}
          wordIssueView={wordIssueView}
          wordRows={wordRows}
          findingColumns={findingColumns}
          selectionModel={selectionModel}
          loading={loading}
          onRunAudit={() => void handleRunAudit()}
          onRunSpellCheck={() => void handleRunSpellCheck()}
          onWriteDictionaryDefinitions={() => void handleWriteDictionaryDefinitions()}
          onApproveSelected={() => void handleApproveSelected(selectedOpen)}
          onRejectSelected={() => void handleRejectSelected(selectedOpen)}
          onIssueViewChange={(next) => {
            setWordIssueView(next)
            setSelectionModel(emptySelection())
          }}
          onSelectionChange={setSelectionModel}
        />
      )}
      {tab === TAB_CONCEPTS && (
        <ConceptsTabContent
          generating={generating}
          generateProgress={generateProgress}
          conceptRows={conceptRows}
          conceptColumns={conceptColumns}
          savingConceptId={savingConceptId}
          onGenerate={() => void handleGenerateDescriptions()}
          onProcessRowUpdate={handleConceptRowUpdate}
          setError={setError}
        />
      )}
      {tab === TAB_DEFINITIONS && (
        <DefinitionsTabContent
          entries={generatedDefinitions}
          wordsByConceptId={wordsByConceptId}
          concepts={concepts}
        />
      )}
    </Box>
  )
}

function WordsTabContent({
  auditing,
  spellChecking,
  writingDefinitions,
  dictionaryProgress,
  running,
  bulkBusy,
  selectedOpen,
  wordIssueView,
  wordRows,
  findingColumns,
  selectionModel,
  loading,
  onRunAudit,
  onRunSpellCheck,
  onWriteDictionaryDefinitions,
  onApproveSelected,
  onRejectSelected,
  onIssueViewChange,
  onSelectionChange,
}) {
  const dictionaryProgressValue =
    dictionaryProgress?.total > 0
      ? Math.round((dictionaryProgress.processed / dictionaryProgress.total) * 100)
      : 0

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={onRunAudit} disabled={running}>
              {auditing ? 'Running audit…' : 'Run Audit'}
            </Button>
            <Button variant="outlined" onClick={onRunSpellCheck} disabled={running}>
              {spellChecking ? 'Checking spelling…' : 'Run Spell Check'}
            </Button>
            <Button
              variant="outlined"
              startIcon={
                writingDefinitions ? <CircularProgress size={16} color="inherit" /> : <ImportContactsIcon />
              }
              onClick={onWriteDictionaryDefinitions}
              disabled={writingDefinitions}
            >
              {writingDefinitions ? 'Writing definitions…' : 'Write Dictionary Definitions'}
            </Button>
            <Button
              variant="outlined"
              disabled={bulkBusy || selectedOpen.length < 1}
              onClick={onApproveSelected}
            >
              {bulkBusy ? 'Working…' : 'Approve Selected'}
            </Button>
            <Button
              color="error"
              variant="outlined"
              disabled={bulkBusy || selectedOpen.length < 1}
              onClick={onRejectSelected}
            >
              Reject Selected
            </Button>
            <Typography variant="body2" color="text.secondary">
              Approve applies ADD/REMOVE tags or the suggested spelling. Reject closes the finding
              without changing the catalog. Dictionary writes at most {DICTIONARY_BATCH_LIMIT}{' '}
              missing entries per run, then opens the Definitions tab for review.
            </Typography>
          </Stack>
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
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <IssueViewToggle value={wordIssueView} onChange={onIssueViewChange} />
        </Stack>
        <Box sx={{ height: { xs: 420, md: 'calc(100vh - 360px)' }, minHeight: 320, width: '100%' }}>
          <DataGrid
            rows={wordRows}
            columns={findingColumns}
            checkboxSelection
            disableRowSelectionOnClick
            rowSelectionModel={selectionModel}
            onRowSelectionModelChange={onSelectionChange}
            isRowSelectable={(params) => statusOf(params.row) === 'OPEN'}
            loading={loading}
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'confidence', sort: 'desc' }] },
            }}
            slots={{ toolbar: FindingsToolbar }}
            slotProps={{
              toolbar: {
                showQuickFilter: true,
                quickFilterProps: { debounceMs: 300 },
                selectedCount: selectedOpen.length,
                onApproveSelected,
                onRejectSelected,
                busy: bulkBusy,
              },
            }}
            density="compact"
            sx={{
              '& .MuiDataGrid-cell': {
                overflow: 'visible',
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
      </Paper>
    </>
  )
}

function ConceptsTabContent({
  generating,
  generateProgress,
  conceptRows,
  conceptColumns,
  savingConceptId,
  onGenerate,
  onProcessRowUpdate,
  setError,
}) {
  const progressValue =
    generateProgress?.total > 0
      ? Math.round((generateProgress.processed / generateProgress.total) * 100)
      : 0

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={onGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate OG Descriptions'}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Generates OG rules in batches of {DESCRIPTION_BATCH_SIZE} and overwrites existing
              descriptions. Double-click a description cell to edit.
            </Typography>
          </Stack>
          {generateProgress ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.75 }}>
                Processing batch {generateProgress.batch} of {generateProgress.batchCount} (
                {generateProgress.processed}/{generateProgress.total})...
              </Typography>
              <LinearProgress variant="determinate" value={progressValue} />
            </Box>
          ) : null}
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ height: { xs: 420, md: 'calc(100vh - 280px)' }, minHeight: 320, width: '100%' }}>
          <DataGrid
            rows={conceptRows}
            columns={conceptColumns}
            disableRowSelectionOnClick
            loading={generating || Boolean(savingConceptId)}
            editMode="cell"
            processRowUpdate={onProcessRowUpdate}
            onProcessRowUpdateError={(err) => {
              setError(err instanceof Error ? err.message : 'Failed to save OG description')
            }}
            getRowHeight={() => 'auto'}
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'concept', sort: 'asc' }] },
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{
              toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } },
            }}
            density="compact"
            localeText={{ noRowsLabel: 'No concepts in the catalog yet.' }}
            sx={{
              '& .MuiDataGrid-cell': {
                py: 1,
                alignItems: 'flex-start',
              },
              '& .MuiDataGrid-cellContent': {
                whiteSpace: 'normal',
                lineHeight: 1.45,
              },
            }}
          />
        </Box>
      </Paper>
    </>
  )
}

function DefinitionsTabContent({ entries, wordsByConceptId, concepts }) {
  if (!entries) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Generated Definitions
        </Typography>
        <Typography color="text.secondary">
          No definitions generated in this session. Run Write Dictionary Definitions on the Words tab
          to review the latest batch here.
        </Typography>
      </Paper>
    )
  }

  if (!entries.length) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Generated Definitions
        </Typography>
        <Typography color="text.secondary">
          The last batch finished, but no dictionary entries were written.
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="h6">Generated Definitions</Typography>
        <Typography variant="body2" color="text.secondary">
          Most recent batch in this session ({entries.length} word{entries.length === 1 ? '' : 's'}).
          Review IPA, syllabication, and definitions before using them in lessons.
        </Typography>
      </Stack>
      <Stack spacing={1.5}>
        {entries.map((entry) => {
          const tagged = assignedConcepts(entry.id, wordsByConceptId, concepts)
          const data = parseDictionaryData(entry.dictionaryData)
          return (
            <Paper key={entry.id} variant="outlined" sx={{ p: 2, bgcolor: '#f7f4ee' }}>
              {data ? (
                <DictionaryEntryCard word={entry.word} data={data} taggedConcepts={tagged} />
              ) : (
                <Stack spacing={0.5}>
                  <Typography sx={{ fontWeight: 700 }}>{entry.word}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    No dictionary data was stored for this word.
                  </Typography>
                </Stack>
              )}
            </Paper>
          )
        })}
      </Stack>
    </Paper>
  )
}
