/**
 * Save the open lesson as a reusable My or Global template.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import {
  formatLessonDisplayName,
  getLessonPlan,
} from '../../lib/fetchStudentLessonPlan'

export default function PublishLessonTemplateDialog({
  open,
  lesson,
  publishing = false,
  onClose,
  onPublish,
}) {
  const plan = useMemo(() => getLessonPlan(lesson), [lesson])
  const conceptName = plan.snapshots?.lists?.newConcept?.concept || ''
  const defaultName = formatLessonDisplayName(
    lesson?.name || plan.name,
    conceptName,
    lesson?.lessonNumber,
  )

  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setSummary('')
  }, [open, defaultName, lesson?.id])

  function handlePublish() {
    const trimmed = name.trim()
    if (!trimmed) return
    onPublish?.({ name: trimmed, summary: summary.trim() })
  }

  return (
    <Dialog open={open} onClose={publishing ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Publish as a public template</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This copies the word lists, sentences, and passages — not the student,
          scores, or notes. Other signed-in users can search it and apply it to
          their own students.
        </Typography>
        <TextField
          autoFocus
          margin="dense"
          label="Template name"
          fullWidth
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={publishing}
        />
        <TextField
          margin="dense"
          label="Summary (optional)"
          fullWidth
          multiline
          minRows={2}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          disabled={publishing}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={publishing}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handlePublish}
          disabled={publishing || !name.trim()}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
