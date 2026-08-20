import { useState } from 'react'
import { Alert, Box, Button, Chip, Portal, Snackbar, Stack } from '@mui/material'
import CasinoIcon from '@mui/icons-material/Casino'
import AskAndreaButton from './AskAndreaButton'
import { FOCUS_WORD_COUNT, includeWordSelection, randomWordSelection } from '../lib/wordSelection'
import { selectFocusWords } from '../lib/selectFocusWords'

export default function WordSelectionActions({
  words = [],
  selectedCount = 0,
  disabled = false,
  student,
  concept,
  concepts = [],
  studentLists,
  wordsByConceptId,
  onSelectionChange,
  extraActions = null,
}) {
  const [asking, setAsking] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const wordCount = words.length
  const randomCount = Math.min(FOCUS_WORD_COUNT, wordCount) || FOCUS_WORD_COUNT
  const busy = disabled || asking

  async function handleAskAndrea() {
    if (busy || !wordCount) return
    setAsking(true)
    try {
      const result = await selectFocusWords({
        student,
        concept,
        concepts,
        words,
        studentLists,
        wordsByConceptId,
      })
      onSelectionChange?.(includeWordSelection(result.ids))
      setNoticeError(false)
      setNotice(result.summary)
    } catch (err) {
      setNoticeError(true)
      setNotice(err instanceof Error ? err.message : 'Andrea could not pick words.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<CasinoIcon />}
        disabled={busy || wordCount === 0}
        onClick={() => onSelectionChange?.(randomWordSelection(words))}
      >
        Random {randomCount}
      </Button>
      <AskAndreaButton
        disabled={busy || wordCount === 0}
        loading={asking}
        tooltip="Andrea picks 10 simple, related words using this student’s history."
        onClick={() => void handleAskAndrea()}
      />
      <Chip size="small" color="primary" variant="outlined" label={`${wordCount} words`} />
      <Chip size="small" variant="outlined" label={`${selectedCount} selected`} />
      {extraActions ? <Box sx={{ flexGrow: 1, minWidth: 8 }} /> : null}
      {extraActions}
      <Portal>
        <Snackbar
          open={Boolean(notice)}
          autoHideDuration={noticeError ? 8000 : 6000}
          onClose={() => setNotice('')}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={noticeError ? 'error' : 'success'}
            variant="filled"
            onClose={() => setNotice('')}
            sx={{ width: '100%' }}
          >
            {notice}
          </Alert>
        </Snackbar>
      </Portal>
    </Stack>
  )
}
