import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import ConceptCountChart from './ConceptCountChart'

const CONCEPT_COLUMNS = [
  { field: 'name', headerName: 'Concept', flex: 1.4, minWidth: 140 },
  {
    field: 'role',
    headerName: 'Role',
    width: 90,
    renderCell: (params) =>
      params.row.isFocus ? (
        <Chip size="small" color="primary" label="Focus" />
      ) : (
        <Typography variant="caption" color="text.secondary">
          Also
        </Typography>
      ),
  },
  {
    field: 'count',
    headerName: 'Words',
    type: 'number',
    width: 80,
    align: 'left',
    headerAlign: 'left',
  },
  {
    field: 'percentLabel',
    headerName: 'Weight',
    width: 80,
  },
  { field: 'examples', headerName: 'Examples', flex: 1.2, minWidth: 120 },
  { field: 'category', headerName: 'Category', flex: 0.8, minWidth: 100 },
]

function StatCard({ label, value, hint }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, flex: '1 1 100px', minWidth: 100 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  )
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`
}

export default function MultiWordPreview({
  kind = 'sentence',
  title = '',
  text = '',
  tagged,
  focusConceptId = null,
  focusName = '',
  emptyLabel = 'Select a sentence or passage to see focus and concept weight.',
  onEdit,
  onDelete,
  deleting = false,
}) {
  const hasText = Boolean(String(text ?? '').trim())
  const conceptRows = (tagged?.conceptRows ?? []).map((row) => ({
    ...row,
    isFocus: Boolean(focusConceptId) && row.id === focusConceptId,
    percentLabel: formatPercent(row.percentOfTokens),
    examples: [...new Set(row.words ?? [])].slice(0, 6).join(', '),
  }))
  const secondaryRows = conceptRows.filter((row) => !row.isFocus)
  const heading = kind === 'passage' ? title || 'Untitled passage' : 'Sentence'

  if (!hasText) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography color="text.secondary">{emptyLabel}</Typography>
      </Paper>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 1 }}
        >
          <Chip size="small" label={kind === 'passage' ? 'Passage' : 'Sentence'} />
          {focusName ? (
            <Chip size="small" color="primary" label={`Focus: ${focusName}`} />
          ) : (
            <Chip size="small" variant="outlined" label="No focus concept" />
          )}
          <Chip
            size="small"
            variant="outlined"
            label={`${tagged?.conceptCount ?? 0} concepts`}
          />
          {onEdit || onDelete ? <Box sx={{ flexGrow: 1 }} /> : null}
          {onEdit ? (
            <Button size="small" startIcon={<EditIcon />} onClick={onEdit} disabled={deleting}>
              Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          ) : null}
        </Stack>
        {kind === 'passage' ? (
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.75 }}>
            {heading}
          </Typography>
        ) : null}
        <Typography
          variant="body2"
          sx={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}
        >
          {text}
        </Typography>
      </Paper>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <StatCard label="Words" value={tagged?.tokenCount ?? 0} hint="Tokens in the text" />
        <StatCard
          label="In catalog"
          value={tagged?.matchedCount ?? 0}
          hint={formatPercent(tagged?.coverage)}
        />
        <StatCard
          label="Not in catalog"
          value={tagged?.unmatchedCount ?? 0}
          hint="Need a word-bank match"
        />
        <StatCard
          label="Secondary"
          value={secondaryRows.length}
          hint={focusName ? 'Concepts besides focus' : 'All tagged concepts'}
        />
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 1.5,
        }}
      >
        <ConceptCountChart
          compact
          rows={tagged?.conceptRows ?? []}
          totalTokens={tagged?.tokenCount ?? 0}
          title="Concept weight"
          emptyLabel="Matched catalog words will appear here as concept bars."
        />
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Word lookup
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Green chips are in the catalog. Outlined chips were not found.
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ minHeight: 56 }}>
            {(tagged?.tokens ?? []).length ? (
              tagged.tokens.map((token) => (
                <Chip
                  key={`${token.index}-${token.original}`}
                  size="small"
                  label={token.original}
                  color={token.found ? 'success' : 'default'}
                  variant={token.found ? 'filled' : 'outlined'}
                  title={
                    token.found
                      ? token.concepts.map((concept) => concept.name).join(', ')
                      : 'Not in the word-concept catalog'
                  }
                />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No words to tag yet.
              </Typography>
            )}
          </Stack>
          {tagged?.unmatchedWords?.length ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Not in catalog: {tagged.unmatchedWords.slice(0, 12).join(', ')}
              {tagged.unmatchedWords.length > 12 ? '…' : ''}
            </Alert>
          ) : null}
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Concepts in this text
        </Typography>
        <Box sx={{ height: 280, width: '100%' }}>
          <DataGridPro
            rows={conceptRows}
            columns={CONCEPT_COLUMNS}
            getRowId={(row) => row.id}
            density="compact"
            pagination
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'count', sort: 'desc' }] },
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
            localeText={{ noRowsLabel: 'No concept tags yet. Words must exist in the catalog.' }}
            getRowClassName={(params) => (params.row.isFocus ? 'Mui-selected' : '')}
          />
        </Box>
      </Paper>
    </Stack>
  )
}
