/**
 * Shared catalog word grid for the global Content page.
 */
import { useCallback, useMemo, useState } from 'react'
import { Box, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import HelpTip from '../shared/HelpTip'
import { DictionaryEntryCard, DictionaryWordCell } from '../data/DictionaryWordTooltip'
import { buildWordConceptColumns, wordConceptGridSx } from './WordConceptsEditor'
import { assignedConcepts, uniqueCatalogWords, wordRecordId } from '../../lib/wordConcepts'
import { parseDictionaryData } from '../../lib/dictionaryData'
import { wordRowId } from '../../lib/wordSelection'
import StudentContentExplainer from './StudentContentExplainer'
import ConceptChip from './ConceptTooltip'

export default function CatalogWordsPanel({
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  loadingCatalog = false,
  onCatalogReload,
  setError,
}) {
  const [editingWordRowId, setEditingWordRowId] = useState(null)
  const [selectedRowId, setSelectedRowId] = useState(null)

  const rows = useMemo(
    () =>
      uniqueCatalogWords(catalogWords, wordsByConceptId).map((word) => ({
        ...word,
        dictionaryData: parseDictionaryData(word.dictionaryData),
      })),
    [catalogWords, wordsByConceptId],
  )

  const selectedWord = rows.find((row) => wordRowId(row) === selectedRowId) ?? null
  const selectedConcepts = selectedWord
    ? assignedConcepts(wordRecordId(selectedWord), wordsByConceptId, concepts)
    : []

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
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            {loadingCatalog ? <CircularProgress size={16} /> : null}
            <HelpTip title="This is the shared word catalog. A book icon means a dictionary entry is already loaded. Hover the word to read it. Hover a concept chip for its OG description. Hover a row to edit which concepts are tagged." />
          </Stack>
          <Box sx={{ height: { xs: 420, md: 'calc(100vh - 320px)' }, minHeight: 320, width: '100%' }}>
            <DataGrid
              rows={rows}
              columns={columns}
              getRowId={wordRowId}
              getRowHeight={() => 'auto'}
              onRowClick={(params) => setSelectedRowId(wordRowId(params.row))}
              getRowClassName={(params) => (params.id === selectedRowId ? 'Mui-selected' : '')}
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
        {!selectedWord ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <StudentContentExplainer kind="catalogWord" empty />
          </Paper>
        ) : (
          <Paper
            sx={{
              p: 2,
              bgcolor: '#f7f4ee',
              border: '1px solid rgba(28, 25, 23, 0.14)',
            }}
          >
            <Stack spacing={1.25}>
              {selectedWord.isNonsenseWord ? (
                <Chip size="small" label="Nonsense word" sx={{ alignSelf: 'flex-start' }} />
              ) : null}
              {selectedWord.dictionaryData ? (
                <DictionaryEntryCard
                  word={selectedWord.word}
                  data={selectedWord.dictionaryData}
                  taggedConcepts={selectedConcepts}
                />
              ) : (
                <>
                  <Typography
                    sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: 0.2 }}
                  >
                    {selectedWord.word}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No dictionary entry yet.
                  </Typography>
                  <Divider sx={{ borderColor: 'rgba(28, 25, 23, 0.14)' }} />
                  <Typography
                    sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}
                  >
                    Tagged Concepts
                  </Typography>
                  {selectedConcepts.length ? (
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      {selectedConcepts.map((concept) => (
                        <ConceptChip key={concept.id} concept={concept} />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      None tagged
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        )}
      </Box>
    </Box>
  )
}
