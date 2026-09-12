/**
 * Shared catalog word grid for the global Content page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import HelpTip from '../shared/HelpTip'
import { DictionaryEntryCard, DictionaryWordCell } from '../data/DictionaryWordTooltip'
import { buildWordConceptColumns, wordConceptGridSx } from './WordConceptsEditor'
import { assignedConcepts, uniqueCatalogWords, wordRecordId, wordTagCountById, TAG_FILTER } from '../../lib/wordConcepts'
import { COVERAGE_FILTER, parseDictionaryData } from '../../lib/dictionaryData'
import { matchesCatalogFilter, TEXT_FILTER } from '../../lib/catalogFilters'
import { wordRowId } from '../../lib/wordSelection'
import StudentContentExplainer from './StudentContentExplainer'
import ConceptChip from './ConceptTooltip'

const CATALOG_FILTER_LABELS = {
  [COVERAGE_FILTER.WITH_DEFINITIONS]: 'with definitions',
  [COVERAGE_FILTER.MISSING_DEFINITIONS]: 'without definitions',
  [COVERAGE_FILTER.INVALID_WORDS]: 'not valid words',
  [TAG_FILTER.UNTAGGED]: 'untagged',
  [TAG_FILTER.ONE_TAG]: 'with 1 tag',
  [TAG_FILTER.TWO_TAGS]: 'with 2 tags',
  [TEXT_FILTER.CONTAINS_SPACE]: 'with a space',
}

export default function CatalogWordsPanel({
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  loadingCatalog = false,
  onCatalogReload,
  setError,
  coverageFilter = null,
  onCoverageFilterChange,
}) {
  const [editingWordRowId, setEditingWordRowId] = useState(null)
  const [selectedRowId, setSelectedRowId] = useState(null)
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 })

  const rows = useMemo(
    () =>
      uniqueCatalogWords(catalogWords, wordsByConceptId).map((word) => ({
        ...word,
        dictionaryData: parseDictionaryData(word.dictionaryData),
      })),
    [catalogWords, wordsByConceptId],
  )

  const tagCounts = useMemo(() => wordTagCountById(wordsByConceptId), [wordsByConceptId])

  const visibleRows = useMemo(() => {
    if (!coverageFilter) return rows
    return rows.filter((row) =>
      matchesCatalogFilter(row, coverageFilter, tagCounts.get(wordRecordId(row)) ?? 0),
    )
  }, [coverageFilter, rows, tagCounts])

  useEffect(() => {
    setPaginationModel((current) => ({ ...current, page: 0 }))
  }, [coverageFilter])

  const selectedWord = visibleRows.find((row) => wordRowId(row) === selectedRowId) ?? null
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
            {coverageFilter ? (
              <Chip
                size="small"
                color={
                  coverageFilter === COVERAGE_FILTER.MISSING_DEFINITIONS ||
                  coverageFilter === TAG_FILTER.UNTAGGED
                    ? 'warning'
                    : coverageFilter === COVERAGE_FILTER.WITH_DEFINITIONS
                      ? 'success'
                      : 'default'
                }
                label={`Showing ${visibleRows.length} ${CATALOG_FILTER_LABELS[coverageFilter]}`}
                onDelete={() => onCoverageFilterChange?.(null)}
              />
            ) : null}
            <HelpTip title="This is the shared word catalog. A book icon means a dictionary entry is already loaded. Hover the word to read it. Hover a concept chip for its OG description. Hover a row to edit which concepts are tagged. Use the Data Operations chips to show only words with definitions, without definitions, not valid words, untagged words, words with 1 or 2 tags, or words that contain a space. Run Audit uses the selected chip as its sample pool." />
          </Stack>
          <Box sx={{ height: { xs: 420, md: 'calc(100vh - 320px)' }, minHeight: 320, width: '100%' }}>
            <DataGrid
              rows={visibleRows}
              columns={columns}
              getRowId={wordRowId}
              getRowHeight={() => 'auto'}
              onRowClick={(params) => setSelectedRowId(wordRowId(params.row))}
              getRowClassName={(params) => (params.id === selectedRowId ? 'Mui-selected' : '')}
              loading={loadingCatalog}
              pagination
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                sorting: { sortModel: [{ field: 'word', sort: 'asc' }] },
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } },
              }}
              density="compact"
              localeText={{
                noRowsLabel: coverageFilter
                  ? `No words ${CATALOG_FILTER_LABELS[coverageFilter]}.`
                  : 'No words in the catalog yet.',
              }}
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
