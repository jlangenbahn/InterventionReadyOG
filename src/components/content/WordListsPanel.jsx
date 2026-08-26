/**
 * Create and edit per-student word lists tied to a concept.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
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
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { parseListData, resolveListWords, studentDisplayName } from '../../lib/fetchStudentLessonPlan'
import { client } from '../../lib/amplifyClient'
import { deleteWordList, updateWordList } from '../../lib/crudRecords'
import { emptyWordSelection, wordRowId } from '../../lib/wordSelection'
import ConfirmDeleteDialog from '../shared/ConfirmDeleteDialog'
import HelpTip from '../shared/HelpTip'
import WordSelectionActions from './WordSelectionActions'

const MODE_VIEW = 0
const MODE_CREATE = 1

const WORD_COLUMNS = [
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
  {
    field: 'isNonsenseWord',
    headerName: 'Nonsense',
    width: 100,
    type: 'boolean',
  },
]

const LIST_COLUMNS = [
  { field: 'name', headerName: 'List', flex: 1.2, minWidth: 110 },
  { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 110 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 80,
    align: 'left',
    headerAlign: 'left',
  },
]

const CONCEPT_COLUMNS = [
  { field: 'concept', headerName: 'Concept', flex: 1.4, minWidth: 140 },
  { field: 'level', headerName: 'Level', width: 80 },
  { field: 'category', headerName: 'Category', flex: 1, minWidth: 110 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 80,
    align: 'left',
    headerAlign: 'left',
  },
]

function listWordCount(list) {
  const data = parseListData(list?.listData)
  if (Array.isArray(data.conceptWordIds)) return data.conceptWordIds.length
  if (Array.isArray(data.wordIds)) return data.wordIds.length
  if (Array.isArray(list?.words)) return list.words.length
  return 0
}

export default function WordListsPanel({
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  studentLists = [],
  loadingLists = false,
  onReloadLists,
  setError,
}) {
  const [selectedConceptId, setSelectedConceptId] = useState(null)
  const [wordSelection, setWordSelection] = useState(emptyWordSelection)
  const [createListOpen, setCreateListOpen] = useState(false)
  const [listName, setListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [listToRename, setListToRename] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamingList, setRenamingList] = useState(false)
  const [listToDelete, setListToDelete] = useState(null)
  const [deletingList, setDeletingList] = useState(false)
  const [mode, setMode] = useState(MODE_VIEW)
  const [selectedListId, setSelectedListId] = useState(null)

  const selectedConcept = useMemo(
    () => concepts.find((item) => item.id === selectedConceptId) ?? null,
    [concepts, selectedConceptId],
  )

  const conceptRows = useMemo(
    () =>
      (concepts ?? [])
        .filter((concept) => concept?.id)
        .map((concept) => ({
          id: concept.id,
          concept: concept.concept || 'Untitled concept',
          category: concept.category || '',
          subcategory: concept.subcategory || '',
          level: concept.level || '',
          wordCount: wordsByConceptId?.get(concept.id)?.length ?? 0,
        })),
    [concepts, wordsByConceptId],
  )

  const selectedWords = useMemo(() => {
    if (!selectedConceptId) return []
    const words = wordsByConceptId.get(selectedConceptId)
    return words ? words.slice() : []
  }, [wordsByConceptId, selectedConceptId])

  const selectedWordRows = useMemo(() => {
    const ids = wordSelection?.ids
    if (!ids?.size) {
      return wordSelection?.type === 'exclude' ? selectedWords : []
    }
    if (wordSelection.type === 'exclude') {
      return selectedWords.filter((row) => !ids.has(wordRowId(row)))
    }
    return selectedWords.filter((row) => ids.has(wordRowId(row)))
  }, [wordSelection, selectedWords])

  const conceptById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept])),
    [concepts],
  )

  const myListRows = useMemo(
    () =>
      studentLists.map((list) => ({
        id: list.id,
        name: list.name || 'Untitled list',
        concept: conceptById.get(list.conceptID)?.concept || 'Unknown concept',
        wordCount: listWordCount(list),
      })),
    [studentLists, conceptById],
  )

  const selectedList = useMemo(
    () => studentLists.find((list) => list.id === selectedListId) ?? null,
    [studentLists, selectedListId],
  )

  const wordLookup = useMemo(() => {
    const lookup = new Map()
    for (const rows of wordsByConceptId?.values() ?? []) {
      for (const row of rows ?? []) {
        if (row?.wordId) lookup.set(row.wordId, row.word)
        if (row?.id) lookup.set(row.id, row.word)
      }
    }
    return lookup
  }, [wordsByConceptId])

  const selectedListWords = useMemo(
    () =>
      (selectedList ? resolveListWords(selectedList, wordLookup) : []).map((word, index) => ({
        id: `${selectedListId}-${index}-${word}`,
        word,
      })),
    [selectedList, selectedListId, wordLookup],
  )

  const listColumns = useMemo(
    () => [
      ...LIST_COLUMNS,
      {
        field: 'actions',
        headerName: '',
        width: 88,
        minWidth: 88,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        resizable: false,
        renderCell: (params) => (
          <Stack direction="row" spacing={0}>
            <IconButton
              size="small"
              aria-label={`Rename ${params.row.name || 'list'}`}
              onClick={(event) => {
                event.stopPropagation()
                setListToRename(params.row)
                setRenameValue(params.row.name || '')
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={`Delete ${params.row.name || 'list'}`}
              onClick={(event) => {
                event.stopPropagation()
                setListToDelete(params.row)
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        ),
      },
    ],
    [],
  )

  const loadLists = useCallback(async () => {
    if (onReloadLists) await onReloadLists()
  }, [onReloadLists])

  useEffect(() => {
    setWordSelection(emptyWordSelection())
    setCreateListOpen(false)
  }, [selectedConceptId])

  useEffect(() => {
    setSelectedConceptId(null)
    setWordSelection(emptyWordSelection())
    setMode(MODE_VIEW)
    setSelectedListId(null)
  }, [student?.id])

  function openCreateList() {
    if (!selectedConcept || selectedWordRows.length === 0) return
    setListName(selectedConcept.concept || '')
    setCreateListOpen(true)
  }

  async function handleRenameList(event) {
    event.preventDefault()
    const name = renameValue.trim()
    if (!listToRename?.id || !name) return
    setRenamingList(true)
    try {
      await updateWordList({ id: listToRename.id, name })
      setError('')
      setListToRename(null)
      await loadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename list')
    } finally {
      setRenamingList(false)
    }
  }

  async function handleConfirmDeleteList() {
    if (!listToDelete?.id) return
    setDeletingList(true)
    try {
      await deleteWordList(listToDelete.id)
      if (selectedListId === listToDelete.id) setSelectedListId(null)
      setError('')
      setListToDelete(null)
      await loadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list')
    } finally {
      setDeletingList(false)
    }
  }

  async function handleCreateList(event) {
    event.preventDefault()
    const name = listName.trim()
    if (!student?.id || !selectedConcept || !name || selectedWordRows.length === 0) return

    setCreatingList(true)
    try {
      const conceptWordIds = selectedWordRows.map((row) => row.conceptWordId).filter(Boolean)
      const wordIds = selectedWordRows.map((row) => row.wordId || row.id).filter(Boolean)
      const { data, errors } = await client.models.List.create({
        name,
        conceptID: selectedConcept.id,
        studentID: student.id,
        listData: JSON.stringify({
          conceptId: selectedConcept.id,
          conceptWordIds,
          wordIds,
        }),
      })
      if (errors?.length) throw new Error(errors.map((e) => e.message).join(', '))
      if (!data?.id) throw new Error('Failed to create list')

      const linkResults = await Promise.all(
        wordIds.map((wordId) => client.models.WordList.create({ wordId, listId: data.id })),
      )
      const linkErrors = linkResults.flatMap((result) => result.errors ?? [])
      if (linkErrors.length) throw new Error(linkErrors.map((e) => e.message).join(', '))

      setError('')
      setCreateListOpen(false)
      setWordSelection(emptyWordSelection())
      setSelectedListId(data.id)
      setMode(MODE_VIEW)
      await loadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setCreatingList(false)
    }
  }

  if (!student) {
    return (
      <Typography color="text.secondary">Select a student to build word lists.</Typography>
    )
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
            {mode === MODE_CREATE ? (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}
              >
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => setMode(MODE_VIEW)}
                >
                  Back to Word lists
                </Button>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="subtitle1">Create list</Typography>
                  <HelpTip title="Select a concept, choose words on the right, then save the list." />
                </Stack>
              </Stack>
            ) : (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
                sx={{ mb: 1.5 }}
              >
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setMode(MODE_CREATE)}
                  sx={{ flexShrink: 0 }}
                >
                  Create list
                </Button>
                <HelpTip title="Click a list to preview its words. Row icons rename or delete." />
                {loadingLists ? <CircularProgress size={16} /> : null}
              </Stack>
            )}

            {mode === MODE_CREATE ? (
              <>
                <Box sx={{ height: { xs: 360, md: 'calc(100vh - 320px)' }, minHeight: 280, width: '100%' }}>
                  <DataGridPro
                    rows={conceptRows}
                    columns={CONCEPT_COLUMNS}
                    getRowId={(row) => row.id}
                    onRowClick={(params) => setSelectedConceptId(params.id)}
                    getRowClassName={(params) => (params.id === selectedConceptId ? 'Mui-selected' : '')}
                    loading={loadingCatalog}
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
              </>
            ) : (
              <Box sx={{ height: { xs: 360, md: 'calc(100vh - 320px)' }, minHeight: 280, width: '100%' }}>
                <DataGridPro
                  rows={myListRows}
                  columns={listColumns}
                  getRowId={(row) => row.id}
                  onRowClick={(params) => setSelectedListId(params.id)}
                  getRowClassName={(params) => (params.id === selectedListId ? 'Mui-selected' : '')}
                  loading={loadingLists}
                  pagination
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                    sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
                    pinnedColumns: { right: ['actions'] },
                  }}
                  slots={{ toolbar: GridToolbar }}
                  slotProps={{
                    toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } },
                  }}
                  density="compact"
                  localeText={{
                    noRowsLabel: 'No lists yet. Click Create list to make one.',
                  }}
                />
              </Box>
            )}
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
          {mode === MODE_CREATE ? (
            !selectedConcept ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography color="text.secondary">
                  Select a concept on the left to choose words and save a list.
                </Typography>
              </Paper>
            ) : (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                  {selectedConcept.concept}
                </Typography>
                {selectedConcept.subcategory ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {selectedConcept.subcategory}
                  </Typography>
                ) : null}
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, mb: 1.5 }}
                  flexWrap="wrap"
                  useFlexGap
                >
                  {selectedConcept.level ? (
                    <Chip size="small" label={`Level ${selectedConcept.level}`} />
                  ) : null}
                  {selectedConcept.category ? (
                    <Chip size="small" variant="outlined" label={selectedConcept.category} />
                  ) : null}
                  <WordSelectionActions
                    words={selectedWords}
                    selectedCount={selectedWordRows.length}
                    disabled={creatingList}
                    student={student}
                    concept={selectedConcept}
                    concepts={concepts}
                    studentLists={studentLists}
                    wordsByConceptId={wordsByConceptId}
                    onSelectionChange={setWordSelection}
                    extraActions={
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlaylistAddIcon />}
                        disabled={selectedWordRows.length === 0 || creatingList}
                        onClick={openCreateList}
                      >
                        Save list
                      </Button>
                    }
                  />
                </Stack>
                <Box sx={{ height: { xs: 320, md: 'calc(100vh - 280px)' }, minHeight: 240, width: '100%' }}>
                  <DataGridPro
                    key={selectedConceptId}
                    rows={selectedWords}
                    columns={WORD_COLUMNS}
                    getRowId={wordRowId}
                    checkboxSelection
                    disableRowSelectionExcludeModel
                    disableRowSelectionOnClick
                    hideFooterSelectedRowCount
                    rowSelectionModel={wordSelection}
                    onRowSelectionModelChange={(model) => setWordSelection(model)}
                    pagination
                    pageSizeOptions={[25, 50, 100]}
                    initialState={{
                      pagination: { paginationModel: { pageSize: 50 } },
                    }}
                    slots={{ toolbar: GridToolbar }}
                    slotProps={{ toolbar: { showQuickFilter: true } }}
                    density="compact"
                  />
                </Box>
              </Paper>
            )
          ) : !selectedList ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography color="text.secondary">
                Select a list to preview its words.
              </Typography>
            </Paper>
          ) : (
            <Paper sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                    {selectedList.name || 'Untitled list'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {conceptById.get(selectedList.conceptID)?.concept || 'Unknown concept'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    aria-label="Rename list"
                    onClick={() => {
                      setListToRename({
                        id: selectedList.id,
                        name: selectedList.name || '',
                      })
                      setRenameValue(selectedList.name || '')
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Delete list"
                    onClick={() =>
                      setListToDelete({
                        id: selectedList.id,
                        name: selectedList.name || 'this list',
                      })
                    }
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
              <Chip
                size="small"
                variant="outlined"
                label={`${selectedListWords.length} words`}
                sx={{ mt: 1, mb: 1.5 }}
              />
              <Box sx={{ height: { xs: 320, md: 'calc(100vh - 280px)' }, minHeight: 240, width: '100%' }}>
                <DataGridPro
                  rows={selectedListWords}
                  columns={[{ field: 'word', headerName: 'Word', flex: 1, minWidth: 120 }]}
                  getRowId={(row) => row.id}
                  disableRowSelectionOnClick
                  pagination
                  pageSizeOptions={[25, 50, 100]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 25 } },
                  }}
                  density="compact"
                  localeText={{ noRowsLabel: 'This list has no words.' }}
                />
              </Box>
            </Paper>
          )}
        </Box>
      </Box>

      <Dialog open={createListOpen} onClose={() => !creatingList && setCreateListOpen(false)} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={handleCreateList}>
          <DialogTitle>Create list</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <DialogContentText>
              Save {selectedWordRows.length} word
              {selectedWordRows.length === 1 ? '' : 's'} under {selectedConcept?.concept || 'this concept'} for{' '}
              {studentDisplayName(student)}. The list will store this concept and the selected
              concept-word links.
            </DialogContentText>
            <TextField
              label="List name"
              value={listName}
              onChange={(event) => setListName(event.target.value)}
              autoFocus
              required
              disabled={creatingList}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateListOpen(false)} disabled={creatingList}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="success" disabled={creatingList || !listName.trim()}>
              {creatingList ? 'Creating…' : 'Create list'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={Boolean(listToRename)}
        onClose={() => !renamingList && setListToRename(null)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={handleRenameList}>
          <DialogTitle>Rename list</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField
              label="List name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
              required
              disabled={renamingList}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setListToRename(null)} disabled={renamingList}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={renamingList || !renameValue.trim()}>
              {renamingList ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(listToDelete)}
        title="Delete this list?"
        description={
          listToDelete
            ? `Delete “${listToDelete.name}”? Words stay in the catalog. This list will no longer be available for new lesson plans.`
            : ''
        }
        confirmLabel="Delete list"
        deleting={deletingList}
        onClose={() => !deletingList && setListToDelete(null)}
        onConfirm={() => void handleConfirmDeleteList()}
      />
    </>
  )
}
