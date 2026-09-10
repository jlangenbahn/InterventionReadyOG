/**
 * Shared catalog word grid for the global Content page.
 */
import { useCallback, useMemo, useState } from 'react'
import { Box, CircularProgress, Paper, Stack } from '@mui/material'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import HelpTip from '../shared/HelpTip'
import { DictionaryWordCell } from '../data/DictionaryWordTooltip'
import { buildWordConceptColumns, wordConceptGridSx } from './WordConceptsEditor'
import { assignedConcepts, uniqueCatalogWords, wordRecordId } from '../../lib/wordConcepts'
import { parseDictionaryData } from '../../lib/dictionaryData'
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
    () =>
      uniqueCatalogWords(catalogWords, wordsByConceptId).map((word) => ({
        ...word,
        dictionaryData: parseDictionaryData(word.dictionaryData),
      })),
    [catalogWords, wordsByConceptId],
  )

  const renderWordCell = useCallback(
    (params) => (
      <DictionaryWordCell
        word={params.row.word}
        dictionaryData={params.row.dictionaryData}
        taggedConcepts={assignedConcepts(wordRecordId(params.row), wordsByConceptId, concepts)}
      />
    ),
    [concepts, wordsByConceptId],
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
        renderWordCell,
        extraColumns: [
          {
            field: 'isNonsenseWord',
            headerName: 'Nonsense',
            width: 100,
            type: 'boolean',
          },
        ],
      }),
    [editingWordRowId, concepts, wordsByConceptId, onCatalogReload, setError, renderWordCell],
  )

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        {loadingCatalog ? <CircularProgress size={16} /> : null}
        <HelpTip title="This is the shared word catalog. A book icon means a dictionary entry is already loaded. Hover the word to read it. Hover a row to edit which concepts are tagged." />
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
          sx={{
            ...wordConceptGridSx,
            '& .MuiDataGrid-cell': { overflow: 'visible' },
          }}
        />
      </Box>
    </Paper>
  )
}
