/**
 * Shared catalog audit queue: run the placeholder mutation, review findings, approve.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import HelpTip from '../shared/HelpTip'
import {
  approveDataQualityFinding,
  approveDataQualityFindings,
  fetchDataQualityFindings,
  runDataQualityAudit,
} from '../../lib/dataQuality'
import { wordLabelById } from '../../lib/wordConcepts'

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

function FindingsToolbar({ selectedCount, onApproveSelected, approving, ...toolbarProps }) {
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
        disabled={selectedCount < 1 || approving}
        onClick={onApproveSelected}
      >
        {approving ? 'Approving…' : `Approve Selected${selectedCount ? ` (${selectedCount})` : ''}`}
      </Button>
    </Box>
  )
}

export default function DataQualityPanel({
  concepts = [],
  wordsByConceptId,
  onCatalogReload,
  setError,
}) {
  const [findings, setFindings] = useState([])
  const [loading, setLoading] = useState(true)
  const [auditing, setAuditing] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [approvingSelected, setApprovingSelected] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectionModel, setSelectionModel] = useState(emptySelection)

  const conceptById = useMemo(
    () => new Map((concepts ?? []).map((concept) => [concept.id, concept])),
    [concepts],
  )
  const wordsById = useMemo(() => wordLabelById(wordsByConceptId), [wordsByConceptId])

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
          concept: conceptById.get(item.recommendedConceptId)?.concept || item.recommendedConceptId || '—',
          actionType: item.actionType || '',
          reason: item.reason || '',
          status: item.status || 'OPEN',
          confidence: item.confidence,
          finding: item,
        })),
    [findings, wordsById, conceptById],
  )

  const selectedIds = useMemo(
    () => selectedRowIds(selectionModel, rows.map((row) => row.id)),
    [selectionModel, rows],
  )

  const handleApproveOne = useCallback(
    async (finding) => {
      if (!finding?.id) return
      setApprovingId(finding.id)
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
        setApprovingId(null)
      }
    },
    [wordsByConceptId, onCatalogReload, loadFindings, setError],
  )

  const columns = useMemo(
    () => [
      { field: 'word', headerName: 'Word', flex: 0.8, minWidth: 120 },
      { field: 'concept', headerName: 'Recommended concept', flex: 1, minWidth: 160 },
      { field: 'actionType', headerName: 'Action', width: 110 },
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
        width: 120,
        minWidth: 120,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => {
          const open = String(params.row.status || '').toUpperCase() === 'OPEN'
          if (!open) return null
          const busy = approvingId === params.row.id || approvingSelected
          return (
            <Button
              size="small"
              variant="contained"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation()
                void handleApproveOne(params.row.finding)
              }}
            >
              {approvingId === params.row.id ? '…' : 'Approve'}
            </Button>
          )
        },
      },
    ],
    [approvingId, approvingSelected, handleApproveOne],
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

  async function handleApproveSelected() {
    const selected = rows
      .filter((row) => selectedIds.includes(row.id) && String(row.status || '').toUpperCase() === 'OPEN')
      .map((row) => row.finding)
    if (!selected.length) return
    setApprovingSelected(true)
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
      setApprovingSelected(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <FactCheckOutlinedIcon color="action" />
        <Typography variant="h5">Data Quality</Typography>
        <HelpTip title="Run an audit to queue suggested word-concept corrections. Approve applies the change to the shared catalog and marks the finding resolved." />
        {notice ? <Chip size="small" color="success" label={notice} /> : null}
      </Stack>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button variant="contained" onClick={() => void handleRunAudit()} disabled={auditing}>
            {auditing ? 'Running audit…' : 'Run Audit'}
          </Button>
          <Button
            variant="outlined"
            disabled={
              approvingSelected ||
              rows.filter(
                (row) =>
                  selectedIds.includes(row.id) && String(row.status || '').toUpperCase() === 'OPEN',
              ).length < 1
            }
            onClick={() => void handleApproveSelected()}
          >
            {approvingSelected ? 'Approving…' : 'Approve Selected'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            The audit is a placeholder until Amazon Bedrock is connected. Approving a finding still
            updates the live word-concept catalog.
          </Typography>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ height: { xs: 420, md: 'calc(100vh - 280px)' }, minHeight: 320, width: '100%' }}>
          <DataGridPro
            rows={rows}
            columns={columns}
            checkboxSelection
            disableRowSelectionExcludeModel
            disableRowSelectionOnClick
            rowSelectionModel={selectionModel}
            onRowSelectionModelChange={(model) => setSelectionModel(model)}
            isRowSelectable={(params) => String(params.row.status || '').toUpperCase() === 'OPEN'}
            loading={loading}
            pagination
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'confidence', sort: 'desc' }] },
              filter: { filterModel: { items: [{ field: 'status', operator: 'equals', value: 'OPEN' }] } },
              pinnedColumns: { right: ['actions'] },
            }}
            slots={{ toolbar: FindingsToolbar }}
            slotProps={{
              toolbar: {
                showQuickFilter: true,
                quickFilterProps: { debounceMs: 300 },
                selectedCount: rows.filter(
                  (row) =>
                    selectedIds.includes(row.id) && String(row.status || '').toUpperCase() === 'OPEN',
                ).length,
                onApproveSelected: () => void handleApproveSelected(),
                approving: approvingSelected,
              },
            }}
            density="compact"
            localeText={{ noRowsLabel: 'No data quality findings yet. Run Audit to generate suggestions.' }}
          />
        </Box>
      </Paper>
    </Box>
  )
}
