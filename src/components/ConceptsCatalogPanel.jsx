import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { generateClient } from 'aws-amplify/data'
import HelpTip from './HelpTip'

const client = generateClient()

export default function ConceptsCatalogPanel({
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  setError,
  onConceptUpdated,
}) {
  const [editing, setEditing] = useState(null)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const rows = useMemo(
    () =>
      (concepts ?? [])
        .filter((concept) => concept?.id)
        .map((concept) => ({
          id: concept.id,
          concept: concept.concept || 'Untitled concept',
          category: concept.category || '',
          subcategory: concept.subcategory || '',
          level: concept.level || '',
          definition: concept.definition || '',
          wordCount: wordsByConceptId?.get(concept.id)?.length ?? 0,
        })),
    [concepts, wordsByConceptId],
  )

  const columns = useMemo(
    () => [
      { field: 'concept', headerName: 'Concept', flex: 1.4, minWidth: 180 },
      { field: 'category', headerName: 'Category', flex: 1, minWidth: 120 },
      { field: 'subcategory', headerName: 'Subcategory', flex: 1, minWidth: 120 },
      { field: 'level', headerName: 'Level', width: 90 },
      {
        field: 'wordCount',
        headerName: 'Words',
        type: 'number',
        width: 90,
        align: 'left',
        headerAlign: 'left',
      },
      {
        field: 'actions',
        headerName: '',
        width: 52,
        minWidth: 52,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        resizable: false,
        renderCell: (params) => (
          <IconButton
            size="small"
            aria-label={`Edit ${params.row.concept || 'concept'}`}
            onClick={(event) => {
              event.stopPropagation()
              setEditing(params.row)
              setLabel(params.row.concept || '')
              setNotice('')
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [],
  )

  const selectedConcept = rows.find((row) => row.id === selectedId) ?? null
  const selectedWords = useMemo(
    () =>
      (selectedId ? wordsByConceptId?.get(selectedId) ?? [] : []).map((row, index) => ({
        id: row?.conceptWordId || row?.id || `${selectedId}-${index}`,
        word: row?.word || '',
        isNonsenseWord: Boolean(row?.isNonsenseWord),
      })),
    [selectedId, wordsByConceptId],
  )

  async function handleSave(event) {
    event.preventDefault()
    const nextLabel = label.trim()
    if (!editing?.id || !nextLabel) return
    if (nextLabel === (editing.concept || '').trim()) {
      setEditing(null)
      return
    }

    setSaving(true)
    try {
      const { data, errors } = await client.models.Concept.update({
        id: editing.id,
        concept: nextLabel,
      })
      if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
      onConceptUpdated?.({
        ...editing,
        ...(data ?? {}),
        id: editing.id,
        concept: nextLabel,
      })
      setNotice('Concept label updated.')
      setError('')
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update concept label')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
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
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 1.5 }}
          >
            {notice ? <Chip size="small" color="success" label={notice} /> : null}
            {loadingCatalog ? <CircularProgress size={16} /> : null}
            <HelpTip title="Click a concept to preview it. The row icon renames the label." />
          </Stack>
          <Box sx={{ height: { xs: 360, md: 'calc(100vh - 320px)' }, minHeight: 280, width: '100%' }}>
            <DataGridPro
              rows={rows}
              columns={columns}
              getRowId={(row) => row.id}
              onRowClick={(params) => setSelectedId(params.id)}
              getRowClassName={(params) => (params.id === selectedId ? 'Mui-selected' : '')}
              loading={loadingCatalog}
              pagination
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
                sorting: { sortModel: [{ field: 'concept', sort: 'asc' }] },
                pinnedColumns: { right: ['actions'] },
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
        {!selectedConcept ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography color="text.secondary">
              Select a concept to preview its details and tagged words.
            </Typography>
          </Paper>
        ) : (
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                  {selectedConcept.concept}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[selectedConcept.category, selectedConcept.subcategory, selectedConcept.level]
                    .filter(Boolean)
                    .join(' · ') || 'No category metadata'}
                </Typography>
              </Box>
              <IconButton
                size="small"
                aria-label={`Edit ${selectedConcept.concept}`}
                onClick={() => {
                  setEditing(selectedConcept)
                  setLabel(selectedConcept.concept || '')
                  setNotice('')
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Stack>
            {selectedConcept.definition ? (
              <Typography variant="body2" sx={{ mt: 1.5 }}>
                {selectedConcept.definition}
              </Typography>
            ) : null}
            <Chip
              size="small"
              variant="outlined"
              label={`${selectedWords.length} words`}
              sx={{ mt: 1.5, mb: 1.5 }}
            />
            <Box sx={{ height: { xs: 280, md: 'calc(100vh - 320px)' }, minHeight: 220, width: '100%' }}>
              <DataGridPro
                rows={selectedWords}
                columns={[
                  { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
                  { field: 'isNonsenseWord', headerName: 'Nonsense', width: 100, type: 'boolean' },
                ]}
                getRowId={(row) => row.id}
                disableRowSelectionOnClick
                pagination
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                }}
                density="compact"
                localeText={{ noRowsLabel: 'No words tagged to this concept.' }}
              />
            </Box>
          </Paper>
        )}
      </Box>
      </Box>

      <Dialog
        open={Boolean(editing)}
        onClose={() => !saving && setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={handleSave}>
          <DialogTitle>Edit concept label</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <DialogContentText>
              Only the display name can be changed. The concept ID is used by lists, lessons,
              sentences, and passages, so it cannot be edited or removed.
            </DialogContentText>
            <TextField
              label="Concept ID"
              value={editing?.id || ''}
              size="small"
              disabled
              helperText="Relationship key — not editable"
            />
            <TextField
              label="Concept label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              autoFocus
              required
              disabled={saving}
            />
            <TextField
              label="Category"
              value={editing?.category || '—'}
              size="small"
              disabled
            />
            <TextField
              label="Subcategory"
              value={editing?.subcategory || '—'}
              size="small"
              disabled
            />
            <TextField
              label="Level"
              value={editing?.level || '—'}
              size="small"
              disabled
            />
            <Alert severity="info">
              Saving updates the label everywhere this concept is shown. Existing links keep the
              same concept ID.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving || !label.trim()}>
              {saving ? 'Saving…' : 'Save label'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  )
}
