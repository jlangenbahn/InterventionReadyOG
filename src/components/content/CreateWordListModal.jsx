/**
 * Modal to name a list and pick focus words for a concept.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { createWordList } from '../../lib/crudRecords'
import { studentDisplayName } from '../../lib/fetchStudentLessonPlan'
import { deselectWord, emptyWordSelection, wordRowId } from '../../lib/wordSelection'
import HelpTip from '../shared/HelpTip'
import SelectedWordsPanel from './SelectedWordsPanel'
import WordSelectionActions from './WordSelectionActions'

const WORD_COLUMNS = [
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
  {
    field: 'isNonsenseWord',
    headerName: 'Nonsense',
    width: 100,
    type: 'boolean',
  },
]

export default function CreateWordListModal({
  open = false,
  student,
  concept = null,
  concepts = [],
  words = [],
  studentLists,
  wordsByConceptId,
  setError,
  onClose,
  onCreated,
}) {
  const [wordSelection, setWordSelection] = useState(emptyWordSelection)
  const [listName, setListName] = useState('')
  const [creating, setCreating] = useState(false)

  const conceptName = concept?.concept || 'this concept'

  useEffect(() => {
    if (!open) return
    setWordSelection(emptyWordSelection())
    setListName(concept?.concept || '')
  }, [open, concept?.id, concept?.concept])

  const selectedWordRows = useMemo(() => {
    const ids = wordSelection?.ids
    if (!ids?.size) {
      return wordSelection?.type === 'exclude' ? words : []
    }
    if (wordSelection.type === 'exclude') {
      return words.filter((row) => !ids.has(wordRowId(row)))
    }
    return words.filter((row) => ids.has(wordRowId(row)))
  }, [wordSelection, words])

  async function handleCreate() {
    const name = listName.trim()
    if (!student?.id || !concept?.id || !name || selectedWordRows.length === 0) return

    setCreating(true)
    try {
      const created = await createWordList({
        studentId: student.id,
        conceptId: concept.id,
        name,
        selectedWordRows,
      })
      setError?.('')
      onCreated?.(created)
      onClose?.()
    } catch (err) {
      setError?.(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setCreating(false)
    }
  }

  function handleClose() {
    if (!creating) onClose?.()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box component="span">Create {conceptName} list</Box>
          <HelpTip
            title={`Select words tagged with ${conceptName} for ${studentDisplayName(student)}. Name the list (the concept is filled in as a default) and save to add it to this lesson step.`}
          />
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <WordSelectionActions
            words={words}
            selectedCount={selectedWordRows.length}
            disabled={creating}
            student={student}
            concept={concept}
            concepts={concepts}
            studentLists={studentLists}
            wordsByConceptId={wordsByConceptId}
            onSelectionChange={setWordSelection}
          />
          {creating ? <CircularProgress size={16} /> : null}
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(200px, 1fr)' },
            gap: 1.5,
            alignItems: 'stretch',
          }}
        >
          <Box sx={{ height: { xs: 320, md: 420 }, minWidth: 0 }}>
            <DataGridPro
              key={concept?.id || 'none'}
              rows={words}
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
              localeText={{
                noRowsLabel: `No words tagged with ${conceptName} yet.`,
              }}
            />
          </Box>
          <SelectedWordsPanel
            words={selectedWordRows}
            onRemove={(row) => setWordSelection((prev) => deselectWord(prev, row))}
            emptyLabel="No words selected yet. Use Random 10, Ask Andrea, or check rows on the left."
          />
        </Box>
        <TextField
          label="List name"
          value={listName}
          onChange={(event) => setListName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleCreate()
            }
          }}
          required
          disabled={creating}
          slotProps={{
            input: {
              endAdornment: (
                <HelpTip title="Change the default name if you want a more specific list." />
              ),
            },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={creating}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<PlaylistAddIcon />}
          onClick={() => void handleCreate()}
          disabled={creating || !listName.trim() || selectedWordRows.length === 0}
        >
          {creating ? 'Creating…' : 'Create list'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
