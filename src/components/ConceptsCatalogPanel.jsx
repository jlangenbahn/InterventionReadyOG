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
        headerName: 'Actions',
        width: 90,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <IconButton
            size="small"
            aria-label={`Edit ${params.row.concept || 'concept'}`}
            onClick={() => {
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
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Catalog concepts used across lists, lessons, sentences, and passages. You can rename a
          concept label. IDs and relationship keys stay unchanged, and concepts cannot be deleted
          from here.
        </Typography>
        {notice ? <Chip size="small" color="success" label={notice} /> : null}
        {loadingCatalog ? <CircularProgress size={16} /> : null}
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ height: { xs: 480, md: 'calc(100vh - 240px)' }, minHeight: 360, width: '100%' }}>
          <DataGridPro
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            loading={loadingCatalog}
            disableRowSelectionOnClick
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
    </Box>
  )
}
