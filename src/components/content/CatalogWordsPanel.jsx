/**
 * Shared catalog word grid for the global Content page.
 */
import { useMemo, useState } from 'react'
import { Box, CircularProgress, Paper, Stack } from '@mui/material'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import HelpTip from '../shared/HelpTip'
import { buildWordConceptColumns, wordConceptGridSx } from './WordConceptsEditor'
import { uniqueCatalogWords } from '../../lib/wordConcepts'
import { wordRowId } from '../../lib/wordSelection'

export default function CatalogWordsPanel({
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  loadingCatalog = false,
  onCatalogReload,
  setError,
}) {
  const [editingWordRowId, setEditingWordRowId] = useState(null)

  const rows = useMemo(
    () => uniqueCatalogWords(catalogWords, wordsByConceptId),
    [catalogWords, wordsByConceptId],
  )

  const columns = useMemo(
    () =>
      buildWordConceptColumns({
        editingRowId: editingWordRowId,
        onStartEdit: setEditingWordRowId,
        onCancelEdit: () => setEditingWordRowId(null),
        onSaved: async () => {
          setEditingWordRowId(null)
          await onCatalogReload?.()
        },
        concepts,
        wordsByConceptId,
        setError,
        extraColumns: [
          {
            field: 'isNonsenseWord',
            headerName: 'Nonsense',
            width: 100,
            type: 'boolean',
          },
        ],
      }),
    [editingWordRowId, concepts, wordsByConceptId, onCatalogReload, setError],
  )

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        {loadingCatalog ? <CircularProgress size={16} /> : null}
        <HelpTip title="This is the shared word catalog. Hover a row to edit which concepts are tagged to that word." />
      </Stack>
      <Box sx={{ height: { xs: 420, md: 'calc(100vh - 280px)' }, minHeight: 320, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={wordRowId}
          getRowHeight={() => 'auto'}
          disableRowSelectionOnClick
          loading={loadingCatalog}
          pagination
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: { sortModel: [{ field: 'word', sort: 'asc' }] },
          }}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } },
          }}
          density="compact"
          localeText={{ noRowsLabel: 'No words in the catalog yet.' }}
          sx={wordConceptGridSx}
        />
      </Box>
    </Paper>
  )
}
