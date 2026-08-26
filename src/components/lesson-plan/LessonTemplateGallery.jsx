/**
 * Browse My/Global lesson templates and apply one to the current student.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import {
  applyLessonTemplate,
  deleteLessonTemplate,
  listLessonTemplates,
  templateIsOwnedBy,
} from '../../lib/lessonTemplates'
import ConfirmDeleteDialog from '../shared/ConfirmDeleteDialog'

export default function LessonTemplateGallery({
  student,
  concepts = [],
  username,
  setError,
  onSelect,
  onApplied,
}) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [conceptId, setConceptId] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [applyingId, setApplyingId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listLessonTemplates({
        focusConceptId: conceptId || undefined,
      })
      setTemplates(items)
      setError('')
    } catch (err) {
      setTemplates([])
      setError(err instanceof Error ? err.message : 'Failed to load lesson templates')
    } finally {
      setLoading(false)
    }
  }, [conceptId, setError])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(
    () =>
      templates.map((item) => ({
        id: item.id,
        name: item.name || 'Untitled template',
        conceptName: item.conceptName || '—',
        category: item.category || '—',
        level: item.level || '—',
        reviews: (item.reviewConceptNames ?? []).filter(Boolean).join(', ') || '—',
        summary: item.summary || '',
        mine: templateIsOwnedBy(item, username),
      })),
    [templates, username],
  )

  const selectionModel = useMemo(
    () => ({
      type: 'include',
      ids: new Set(selectedId ? [selectedId] : []),
    }),
    [selectedId],
  )

  function selectTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    setSelectedId(templateId)
    onSelect?.(template)
  }

  async function handleApply(event, templateId) {
    event?.stopPropagation()
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    if (!student?.id) {
      setError('Select a student before applying a template.')
      return
    }
    setApplyingId(templateId)
    try {
      const saved = await applyLessonTemplate({ template, studentId: student.id })
      setError('')
      onApplied?.(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    } finally {
      setApplyingId(null)
    }
  }

  async function handleDelete() {
    if (!toDelete?.id) return
    setDeleting(true)
    try {
      await deleteLessonTemplate(toDelete.id)
      if (selectedId === toDelete.id) setSelectedId(null)
      setToDelete(null)
      await load()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { field: 'name', headerName: 'Template', flex: 1.4, minWidth: 160 },
    { field: 'conceptName', headerName: 'New concept', flex: 1, minWidth: 120 },
    { field: 'level', headerName: 'Level', width: 90 },
    { field: 'category', headerName: 'Category', flex: 0.7, minWidth: 100 },
    { field: 'reviews', headerName: 'Review concepts', flex: 1, minWidth: 140 },
    {
      field: 'actions',
      headerName: '',
      width: 196,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Button
            size="small"
            variant="contained"
            disabled={!student?.id || applyingId === params.id}
            onClick={(event) => void handleApply(event, params.id)}
          >
            {applyingId === params.id ? 'Applying…' : 'Apply'}
          </Button>
          {params.row.mine ? (
            <Button
              size="small"
              color="error"
              onClick={(event) => {
                event.stopPropagation()
                setToDelete(params.row)
              }}
            >
              Delete
            </Button>
          ) : null}
        </Stack>
      ),
    },
  ]

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Select a public template to preview it on the right. Apply copies the
        materials onto this student as a new private plan, without scores or
        student names.
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 220, flexGrow: 1 }}>
          <InputLabel id="template-concept-filter">Focus concept</InputLabel>
          <Select
            labelId="template-concept-filter"
            label="Focus concept"
            value={conceptId}
            onChange={(event) => setConceptId(event.target.value)}
          >
            <MenuItem value="">All concepts</MenuItem>
            {concepts.map((concept) => (
              <MenuItem key={concept.id} value={concept.id}>
                {concept.concept || concept.id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {loading ? <CircularProgress size={16} /> : null}
        <Chip
          size="small"
          label={`${rows.length} template${rows.length === 1 ? '' : 's'}`}
        />
      </Stack>
      <Box sx={{ height: { xs: 360, md: 'calc(100vh - 380px)' }, minHeight: 280, width: '100%' }}>
        <DataGridPro
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          onRowClick={(params) => selectTemplate(params.id)}
          rowSelectionModel={selectionModel}
          getRowClassName={(params) => (params.id === selectedId ? 'Mui-selected' : '')}
          loading={loading}
          pagination
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
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
            noRowsLabel: 'No public lesson templates yet. Publish one from a saved lesson plan.',
          }}
        />
      </Box>
      <ConfirmDeleteDialog
        open={Boolean(toDelete)}
        title="Delete this template?"
        description={
          toDelete
            ? `Delete “${toDelete.name}”? Student lesson plans that already used it are not affected.`
            : ''
        }
        confirmLabel="Delete template"
        deleting={deleting}
        onClose={() => !deleting && setToDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  )
}
