import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import CasinoIcon from '@mui/icons-material/Casino'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { createWordList } from '../lib/crudRecords'
import { studentDisplayName } from '../lib/fetchStudentLessonPlan'

const RANDOM_WORD_COUNT = 10

const WORD_COLUMNS = [
  { field: 'word', headerName: 'Word', flex: 1, minWidth: 120 },
  {
    field: 'isNonsenseWord',
    headerName: 'Nonsense',
    width: 100,
    type: 'boolean',
  },
]

function emptyWordSelection() {
  return { type: 'include', ids: new Set() }
}

function wordRowId(row) {
  return row?.conceptWordId || row?.id
}

function randomWordSelection(words, count = RANDOM_WORD_COUNT) {
  const ids = words.map(wordRowId).filter(Boolean)
  const pool = [...ids]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return {
    type: 'include',
    ids: new Set(pool.slice(0, Math.min(count, pool.length))),
  }
}

export default function CreateWordListModal({
  open = false,
  student,
  concept = null,
  words = [],
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
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>Create {conceptName} list</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Select words tagged with {conceptName} for {studentDisplayName(student)}. Name the list
          (the concept is filled in as a default) and save to add it to this lesson step.
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" color="primary" variant="outlined" label={`${words.length} words`} />
          <Chip size="small" variant="outlined" label={`${selectedWordRows.length} selected`} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<CasinoIcon />}
            disabled={creating || words.length === 0}
            onClick={() => setWordSelection(randomWordSelection(words))}
          >
            Random {Math.min(RANDOM_WORD_COUNT, words.length) || RANDOM_WORD_COUNT}
          </Button>
          {creating ? <CircularProgress size={16} /> : null}
        </Stack>
        <Box sx={{ height: 360, width: '100%' }}>
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
          helperText="Change the default name if you want a more specific list."
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
