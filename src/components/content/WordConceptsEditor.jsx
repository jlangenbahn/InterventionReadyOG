/**
 * Inline concept Autocomplete for a word row (hover → Edit Concepts → save joins).
 */
import { useMemo, useState } from 'react'
import { Autocomplete, Box, Button, Stack, TextField } from '@mui/material'
import { assignedConceptLinks, assignedConcepts, saveWordConcepts, wordRecordId } from '../../lib/wordConcepts'
import { wordRowId } from '../../lib/wordSelection'
import ConceptChip from './ConceptTooltip'

export const wordConceptGridSx = {
  '& .word-edit-concepts-btn': {
    opacity: 0,
    transition: 'opacity 120ms',
  },
  '& .MuiDataGrid-row:hover .word-edit-concepts-btn, & .MuiDataGrid-row.Mui-hovered .word-edit-concepts-btn, & .MuiDataGrid-row:focus-within .word-edit-concepts-btn, & .word-edit-concepts-btn:focus-visible':
    {
      opacity: 1,
    },
}

export function WordConceptsInlineEditor({
  row,
  concepts = [],
  wordsByConceptId,
  onCancel,
  onSaved,
  setError,
}) {
  const wordId = wordRecordId(row)
  const currentLinks = useMemo(
    () => assignedConceptLinks(wordId, wordsByConceptId),
    [wordId, wordsByConceptId],
  )
  const initial = useMemo(
    () => assignedConcepts(wordId, wordsByConceptId, concepts),
    [wordId, wordsByConceptId, concepts],
  )
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await saveWordConcepts({
        wordId,
        nextConceptIds: value.map((concept) => concept.id).filter(Boolean),
        currentLinks,
      })
      setError?.('')
      await onSaved?.()
    } catch (err) {
      setError?.(err instanceof Error ? err.message : 'Failed to update concepts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
      sx={{ py: 0.5, width: '100%', minWidth: 0 }}
      onClick={(event) => event.stopPropagation()}
    >
      <Autocomplete
        multiple
        fullWidth
        options={concepts}
        value={value}
        onChange={(_event, next) => setValue(next)}
        getOptionLabel={(option) => option?.concept || ''}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        filterSelectedOptions
        disableCloseOnSelect
        renderTags={(selected, getTagProps) =>
          selected.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index })
            return <ConceptChip key={key} concept={option} {...tagProps} />
          })
        }
        renderInput={(params) => (
          <TextField {...params} size="small" label="Concepts" placeholder="Add concept" />
        )}
      />
      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
        <Button size="small" variant="contained" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="small" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  )
}

export function buildWordConceptColumns({
  editingRowId,
  onStartEdit,
  onCancelEdit,
  onSaved,
  concepts,
  wordsByConceptId,
  setError,
  extraColumns = [],
  renderWordCell,
}) {
  return [
    {
      field: 'word',
      headerName: 'Word',
      flex: 1,
      minWidth: 160,
      ...(renderWordCell ? { renderCell: renderWordCell } : {}),
    },
    ...extraColumns,
    {
      field: 'assignedConcepts',
      headerName: 'Concepts',
      flex: 1.6,
      minWidth: 260,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        if (editingRowId === wordRowId(params.row)) {
          return (
            <WordConceptsInlineEditor
              row={params.row}
              concepts={concepts}
              wordsByConceptId={wordsByConceptId}
              onCancel={onCancelEdit}
              onSaved={onSaved}
              setError={setError}
            />
          )
        }
        const chips = assignedConcepts(wordRecordId(params.row), wordsByConceptId, concepts)
        if (!chips.length) {
          return (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              None
            </Box>
          )
        }
        return (
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 0.5 }}>
            {chips.map((concept) => (
              <ConceptChip key={concept.id} concept={concept} />
            ))}
          </Stack>
        )
      },
    },
    {
      field: 'editConcepts',
      headerName: '',
      width: 148,
      minWidth: 148,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      resizable: false,
      renderCell: (params) => {
        const rowId = wordRowId(params.row)
        if (editingRowId === rowId) return null
        return (
          <Button
            className="word-edit-concepts-btn"
            size="small"
            variant="outlined"
            onClick={(event) => {
              event.stopPropagation()
              onStartEdit(rowId)
            }}
          >
            Edit Concepts
          </Button>
        )
      },
    },
  ]
}
