/**
 * Core ontology vs named paradigm terminology overlays.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import HelpTip from '../shared/HelpTip'
import {
  createParadigmWithMappings,
  fetchParadigmMappings,
  fetchParadigms,
} from '../../lib/paradigms'

const MODE_COMPARE = 'compare'
const MODE_CREATE = 'create'

export default function ParadigmSettingsPanel({ concepts = [], setError }) {
  const [mode, setMode] = useState(MODE_COMPARE)
  const [paradigms, setParadigms] = useState([])
  const [selectedParadigmId, setSelectedParadigmId] = useState('')
  const [mappings, setMappings] = useState([])
  const [loadingParadigms, setLoadingParadigms] = useState(true)
  const [loadingMappings, setLoadingMappings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newLabels, setNewLabels] = useState({})

  const sortedConcepts = useMemo(
    () =>
      [...(concepts ?? [])]
        .filter((concept) => concept?.id)
        .sort((a, b) => String(a.concept ?? '').localeCompare(String(b.concept ?? ''))),
    [concepts],
  )

  const loadParadigms = useCallback(async () => {
    setLoadingParadigms(true)
    try {
      const items = await fetchParadigms()
      setParadigms(items)
      setSelectedParadigmId((current) => current || items[0]?.id || '')
      setError('')
    } catch (err) {
      setParadigms([])
      setError(err instanceof Error ? err.message : 'Failed to load paradigms')
    } finally {
      setLoadingParadigms(false)
    }
  }, [setError])

  useEffect(() => {
    void loadParadigms()
  }, [loadParadigms])

  useEffect(() => {
    if (!selectedParadigmId) {
      setMappings([])
      return
    }
    let cancelled = false
    setLoadingMappings(true)
    fetchParadigmMappings(selectedParadigmId)
      .then((items) => {
        if (!cancelled) {
          setMappings(items)
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMappings([])
          setError(err instanceof Error ? err.message : 'Failed to load paradigm mappings')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMappings(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedParadigmId, setError])

  const mappingByConceptId = useMemo(() => {
    const map = new Map()
    for (const mapping of mappings ?? []) {
      if (mapping?.baseConceptId) map.set(mapping.baseConceptId, mapping)
    }
    return map
  }, [mappings])

  const compareRows = useMemo(
    () =>
      sortedConcepts.map((concept, index) => {
        const mapping = mappingByConceptId.get(concept.id)
        return {
          id: concept.id,
          sequenceOrder: mapping?.sequenceOrder ?? index,
          baseConcept: concept.concept || 'Untitled concept',
          category: concept.category || '',
          level: concept.level || '',
          paradigmLabel: mapping?.label || '',
        }
      }),
    [sortedConcepts, mappingByConceptId],
  )

  const selectedParadigm = paradigms.find((item) => item.id === selectedParadigmId) ?? null

  function startCreate() {
    const prefill = {}
    for (const concept of sortedConcepts) {
      prefill[concept.id] = concept.concept || ''
    }
    setNewName('')
    setNewDescription('')
    setNewLabels(prefill)
    setNotice('')
    setMode(MODE_CREATE)
  }

  async function handleCreate(event) {
    event.preventDefault()
    const mappingsToSave = sortedConcepts
      .map((concept, index) => ({
        baseConceptId: concept.id,
        label: String(newLabels[concept.id] ?? '').trim(),
        sequenceOrder: index,
      }))
      .filter((mapping) => mapping.label)
    if (!mappingsToSave.length) return

    setSaving(true)
    try {
      const created = await createParadigmWithMappings({
        name: newName,
        description: newDescription,
        mappings: mappingsToSave,
      })
      setNotice(`Saved ${created.name}.`)
      setError('')
      setMode(MODE_COMPARE)
      await loadParadigms()
      if (created?.id) setSelectedParadigmId(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save paradigm')
    } finally {
      setSaving(false)
    }
  }

  if (mode === MODE_CREATE) {
    return (
      <Box component="form" onSubmit={handleCreate}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <AccountTreeIcon color="action" />
          <Typography variant="h5">Add New Paradigm</Typography>
          <HelpTip title="Left column is the core ontology and stays fixed. Right column is this paradigm’s names. Fields start as the base labels so you only change the terms that differ." />
        </Stack>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Paradigm name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Description"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              fullWidth
            />
          </Stack>
        </Paper>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1,
              mb: 1,
              px: 0.5,
            }}
          >
            <Typography variant="subtitle2">Core ontological base concepts</Typography>
            <Typography variant="subtitle2">Paradigm names</Typography>
          </Box>
          <Box sx={{ maxHeight: 'calc(100vh - 360px)', overflow: 'auto' }}>
            {sortedConcepts.map((concept) => (
              <Box
                key={concept.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1,
                  alignItems: 'center',
                  py: 0.75,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box>
                  <Typography variant="body2">{concept.concept || 'Untitled concept'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[concept.category, concept.level].filter(Boolean).join(' · ') || 'No category'}
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  value={newLabels[concept.id] ?? ''}
                  onChange={(event) =>
                    setNewLabels((current) => ({ ...current, [concept.id]: event.target.value }))
                  }
                  inputProps={{ 'aria-label': `Paradigm name for ${concept.concept || 'concept'}` }}
                />
              </Box>
            ))}
          </Box>
        </Paper>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => setMode(MODE_COMPARE)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving || !newName.trim()}>
            {saving ? 'Saving…' : 'Save paradigm'}
          </Button>
        </Stack>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <AccountTreeIcon color="action" />
        <Typography variant="h5">Paradigm Settings</Typography>
        <HelpTip title="Base concepts are the shared catalog used by lessons and Scope & Sequence. A paradigm is an alternate naming overlay — it does not create new catalog concepts." />
        {notice ? <Chip size="small" color="success" label={notice} /> : null}
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" onClick={startCreate} disabled={!sortedConcepts.length}>
          Add New Paradigm
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Paper sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Core ontological base concepts
          </Typography>
          <Box sx={{ height: { xs: 360, md: 'calc(100vh - 240px)' }, minHeight: 280 }}>
            <DataGrid
              rows={compareRows}
              columns={[
                { field: 'baseConcept', headerName: 'Base concept', flex: 1.4, minWidth: 160 },
                { field: 'category', headerName: 'Category', flex: 1, minWidth: 110 },
                { field: 'level', headerName: 'Level', width: 80 },
              ]}
              loading={loadingParadigms}
              pagination
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
                sorting: { sortModel: [{ field: 'baseConcept', sort: 'asc' }] },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
              density="compact"
              localeText={{ noRowsLabel: 'No base concepts in the catalog yet.' }}
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 2, minWidth: 0 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 220, flex: 1 }}>
              <InputLabel id="paradigm-select-label">Paradigm</InputLabel>
              <Select
                labelId="paradigm-select-label"
                label="Paradigm"
                value={selectedParadigmId}
                onChange={(event) => setSelectedParadigmId(event.target.value)}
                disabled={!paradigms.length}
              >
                {paradigms.map((paradigm) => (
                  <MenuItem key={paradigm.id} value={paradigm.id}>
                    {paradigm.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedParadigm?.description ? (
              <Typography variant="body2" color="text.secondary">
                {selectedParadigm.description}
              </Typography>
            ) : null}
          </Stack>
          <Box sx={{ height: { xs: 360, md: 'calc(100vh - 280px)' }, minHeight: 280 }}>
            <DataGrid
              rows={compareRows}
              columns={[
                { field: 'baseConcept', headerName: 'Base concept', flex: 1, minWidth: 140 },
                {
                  field: 'paradigmLabel',
                  headerName: 'Paradigm term',
                  flex: 1.2,
                  minWidth: 160,
                  renderCell: (params) =>
                    params.value ? (
                      params.value
                    ) : (
                      <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        {params.row.baseConcept}
                      </Box>
                    ),
                },
              ]}
              loading={loadingMappings}
              pagination
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
                sorting: { sortModel: [{ field: 'baseConcept', sort: 'asc' }] },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
              density="compact"
              localeText={{
                noRowsLabel: paradigms.length
                  ? 'This paradigm has no mapped terms yet.'
                  : 'No paradigms yet. Add one to map alternate terminology.',
              }}
            />
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
