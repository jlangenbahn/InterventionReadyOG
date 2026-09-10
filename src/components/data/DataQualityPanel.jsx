/**
 * Shared catalog audit queue: tag audit, spell check, OG descriptions, approve/reject.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
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
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import HelpTip from '../shared/HelpTip'
import { client } from '../../lib/amplifyClient'
import {
  approveDataQualityFinding,
  approveDataQualityFindings,
  fetchDataQualityFindings,
  generateConceptDescriptions,
  rejectDataQualityFinding,
  rejectDataQualityFindings,
  runDataQualityAudit,
  runSpellCheck,
} from '../../lib/dataQuality'
import { wordLabelById } from '../../lib/wordConcepts'

const TAB_WORDS = 0
const TAB_CONCEPTS = 1
const VIEW_OPEN = 'open'
const VIEW_HISTORY = 'history'

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
  const [generating, setGenerating] = useState(false)
  const [rowBusyId, setRowBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectionModel, setSelectionModel] = useState(emptySelection)
  const [conceptSelectionModel, setConceptSelectionModel] = useState(emptySelection)
  const [savingConceptId, setSavingConceptId] = useState(null)
  const [wordIssueView, setWordIssueView] = useState(VIEW_OPEN)
  const [conceptIssueView, setConceptIssueView] = useState(VIEW_OPEN)

  const conceptById = useMemo(
    () => new Map((concepts ?? []).map((concept) => [concept.id, concept])),
    [concepts],
  )
  const wordsById = useMemo(
    () => wordLabelById(wordsByConceptId, catalogWords),
    [wordsByConceptId, catalogWords],
  )

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

  const conceptFindingRows = useMemo(
    () =>
      rows.filter((row) => {
        const action = String(row.actionType || '').toUpperCase()
        return (action === 'ADD' || action === 'REMOVE') && matchesIssueView(row, conceptIssueView)
      }),
    [rows, conceptIssueView],
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
  const conceptSelectedIds = useMemo(
    () => selectedRowIds(conceptSelectionModel, conceptFindingRows.map((row) => row.id)),
    [conceptSelectionModel, conceptFindingRows],
  )
  const conceptSelectedOpen = useMemo(
    () => openRows(conceptFindingRows, conceptSelectedIds),
    [conceptFindingRows, conceptSelectedIds],
  )

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
      { field: 'word', headerName: 'Word', flex: 0.8, minWidth: 120 },
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
    [rowBusyId, bulkBusy, handleApproveOne, handleRejectOne],
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
        flex: 2.2,
        minWidth: 260,
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

  async function handleGenerateDescriptions() {
    setGenerating(true)
    try {
      const result = await generateConceptDescriptions()
      setNotice(result.message || 'OG descriptions updated.')
      setError('')
      await onCatalogReload?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate OG descriptions')
    } finally {
      setGenerating(false)
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
      setConceptSelectionModel(emptySelection())
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
      setConceptSelectionModel(emptySelection())
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
        <HelpTip title="Audit word-concept tags, flag misspellings, and generate Orton-Gillingham rule descriptions. Approve applies catalog changes; Reject only closes the finding." />
        {notice ? <Chip size="small" color="success" label={notice} /> : null}
      </Stack>
      <Paper variant="outlined" sx={{ px: 1.5, pt: 0.5, mb: 2 }}>
        <Tabs value={tab} onChange={(_event, value) => setTab(value)}>
          <Tab icon={<MenuBookIcon />} iconPosition="start" label="Words" />
          <Tab icon={<CategoryIcon />} iconPosition="start" label="Concepts" />
        </Tabs>
      </Paper>

      {tab === TAB_CONCEPTS ? (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                onClick={() => void handleGenerateDescriptions()}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate OG Descriptions'}
              </Button>
              <Button
                variant="outlined"
                disabled={bulkBusy || conceptSelectedOpen.length < 1}
                onClick={() => void handleApproveSelected(conceptSelectedOpen)}
              >
                {bulkBusy ? 'Working…' : 'Approve Selected'}
              </Button>
              <Button
                color="error"
                variant="outlined"
                disabled={bulkBusy || conceptSelectedOpen.length < 1}
                onClick={() => void handleRejectSelected(conceptSelectedOpen)}
              >
                Reject Selected
              </Button>
              <Typography variant="body2" color="text.secondary">
                Generates OG rules for every concept and overwrites existing descriptions. Tag
                findings below can be approved or rejected. Double-click a description cell to edit.
              </Typography>
            </Stack>
          </Paper>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
              <IssueViewToggle
                value={conceptIssueView}
                onChange={(next) => {
                  setConceptIssueView(next)
                  setConceptSelectionModel(emptySelection())
                }}
              />
            </Stack>
            <Box sx={{ height: { xs: 280, md: 320 }, minHeight: 240, width: '100%' }}>
              <DataGridPro
                rows={conceptFindingRows}
                columns={findingColumns}
                checkboxSelection
                disableRowSelectionExcludeModel
                disableRowSelectionOnClick
                rowSelectionModel={conceptSelectionModel}
                onRowSelectionModelChange={(model) => setConceptSelectionModel(model)}
                isRowSelectable={(params) => statusOf(params.row) === 'OPEN'}
                loading={loading}
                pagination
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                  sorting: { sortModel: [{ field: 'confidence', sort: 'desc' }] },
                  pinnedColumns: { right: ['actions'] },
                }}
                slots={{ toolbar: FindingsToolbar }}
                slotProps={{
                  toolbar: {
                    showQuickFilter: true,
                    quickFilterProps: { debounceMs: 300 },
                    selectedCount: conceptSelectedOpen.length,
                    onApproveSelected: () => void handleApproveSelected(conceptSelectedOpen),
                    onRejectSelected: () => void handleRejectSelected(conceptSelectedOpen),
                    busy: bulkBusy,
                  },
                }}
                density="compact"
                localeText={{
                  noRowsLabel:
                    conceptIssueView === VIEW_HISTORY
                      ? 'No approved or rejected concept-tag findings yet.'
                      : 'No open concept-tag findings. Run Audit on the Words tab to generate suggestions.',
                }}
              />
            </Box>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ height: { xs: 320, md: 'calc(100vh - 560px)' }, minHeight: 240, width: '100%' }}>
              <DataGridPro
                rows={conceptRows}
                columns={conceptColumns}
                disableRowSelectionOnClick
                loading={generating || Boolean(savingConceptId)}
                editMode="cell"
                processRowUpdate={handleConceptRowUpdate}
                onProcessRowUpdateError={(err) => {
                  setError(err instanceof Error ? err.message : 'Failed to save OG description')
                }}
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
              />
            </Box>
          </Paper>
        </>
      ) : (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={() => void handleRunAudit()} disabled={running}>
                {auditing ? 'Running audit…' : 'Run Audit'}
              </Button>
              <Button variant="outlined" onClick={() => void handleRunSpellCheck()} disabled={running}>
                {spellChecking ? 'Checking spelling…' : 'Run Spell Check'}
              </Button>
              <Button
                variant="outlined"
                disabled={bulkBusy || selectedOpen.length < 1}
                onClick={() => void handleApproveSelected(selectedOpen)}
              >
                {bulkBusy ? 'Working…' : 'Approve Selected'}
              </Button>
              <Button
                color="error"
                variant="outlined"
                disabled={bulkBusy || selectedOpen.length < 1}
                onClick={() => void handleRejectSelected(selectedOpen)}
              >
                Reject Selected
              </Button>
              <Typography variant="body2" color="text.secondary">
                Approve applies ADD/REMOVE tags or the suggested spelling. Reject closes the finding
                without changing the catalog.
              </Typography>
            </Stack>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
              <IssueViewToggle
                value={wordIssueView}
                onChange={(next) => {
                  setWordIssueView(next)
                  setSelectionModel(emptySelection())
                }}
              />
            </Stack>
            <Box sx={{ height: { xs: 420, md: 'calc(100vh - 360px)' }, minHeight: 320, width: '100%' }}>
              <DataGridPro
                rows={wordRows}
                columns={findingColumns}
                checkboxSelection
                disableRowSelectionExcludeModel
                disableRowSelectionOnClick
                rowSelectionModel={selectionModel}
                onRowSelectionModelChange={(model) => setSelectionModel(model)}
                isRowSelectable={(params) => statusOf(params.row) === 'OPEN'}
                loading={loading}
                pagination
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                  sorting: { sortModel: [{ field: 'confidence', sort: 'desc' }] },
                  pinnedColumns: { right: ['actions'] },
                }}
                slots={{ toolbar: FindingsToolbar }}
                slotProps={{
                  toolbar: {
                    showQuickFilter: true,
                    quickFilterProps: { debounceMs: 300 },
                    selectedCount: selectedOpen.length,
                    onApproveSelected: () => void handleApproveSelected(selectedOpen),
                    onRejectSelected: () => void handleRejectSelected(selectedOpen),
                    busy: bulkBusy,
                  },
                }}
                density="compact"
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
      )}
    </Box>
  )
}
