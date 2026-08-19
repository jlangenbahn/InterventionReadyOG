import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import {
  applyLessonTemplate,
  deleteLessonTemplate,
  listLessonTemplates,
  templateIsOwnedBy,
} from '../lib/lessonTemplates'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import { getLessonPlan } from '../lib/fetchStudentLessonPlan'

export default function LessonTemplateGallery({
  student,
  concepts = [],
  username,

  setError,
  onApplied,
}) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [conceptId, setConceptId] = useState('')
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return templates
    return templates.filter((item) => {
      const plan = getLessonPlan(item)
      const haystack = [
        item.name,
        item.summary,
        item.conceptName,
        item.category,
        item.level,
        ...(item.reviewConceptNames ?? []),
        plan.snapshots?.lists?.newConcept?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [templates, query])

  const rows = useMemo(
    () =>
      filtered.map((item) => ({
        id: item.id,
        name: item.name || 'Untitled template',
        conceptName: item.conceptName || '—',
        category: item.category || '—',
        level: item.level || '—',
        reviews: (item.reviewConceptNames ?? []).filter(Boolean).join(', ') || '—',
        summary: item.summary || '',
        mine: templateIsOwnedBy(item, username),
      })),
    [filtered, username],
  )

  async function handleApply(templateId) {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    if (!student?.id) {
      setError('Select a student before applying a template.')
      return
    }
    setApplyingId(templateId)
    try {
      await applyLessonTemplate({ template, studentId: student.id })
      setError('')
      onApplied?.()
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
    { field: 'name', headerName: 'Template', flex: 1.4, minWidth: 180 },
    { field: 'conceptName', headerName: 'New concept', flex: 1, minWidth: 140 },
    { field: 'level', headerName: 'Level', width: 100 },
    { field: 'category', headerName: 'Category', flex: 0.8, minWidth: 120 },
    { field: 'reviews', headerName: 'Review concepts', flex: 1, minWidth: 160 },
    {
      field: 'actions',
      headerName: '',
      width: 200,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="contained"
            disabled={!student?.id || applyingId === params.id}
            onClick={() => void handleApply(params.id)}
          >
            {applyingId === params.id ? 'Applying…' : 'Apply'}
          </Button>
          {params.row.mine ? (
            <Button
              size="small"
              color="error"
              onClick={() => setToDelete(params.row)}
            >
              Delete
            </Button>
          ) : null}
        </Stack>
      ),
    },
  ]

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Public lesson plans shared by any user. Applying one copies the materials
        onto {student ? 'this student' : 'the selected student'} as a new private
        plan, without scores or student names.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ minWidth: 220, flexGrow: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 240 }}>
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
      </Stack>
      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Loading templates…</Typography>
        </Stack>
      ) : (
        <Chip size="small" label={`${rows.length} template${rows.length === 1 ? '' : 's'}`} sx={{ mb: 1 }} />
      )}
      {!student?.id ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Select a student to apply a template to their lesson plans.
        </Alert>
      ) : null}
      <Box sx={{ height: { xs: 420, md: 'calc(100vh - 280px)' }, minHeight: 280, width: '100%' }}>
        <DataGridPro
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          pagination
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: false,
            },
          }}
          density="compact"
          localeText={{ noRowsLabel: 'No public lesson templates yet. Publish one from a saved lesson plan.' }}
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
    </Box>
  )
}
