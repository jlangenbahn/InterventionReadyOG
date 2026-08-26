/**
 * Shared confirm-delete dialog used across students, groups, lists, and lessons.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

export default function ConfirmDeleteDialog({
  open,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Delete',
  deleting = false,
  onClose,
  onConfirm,
}) {
  return (
    <Dialog
      open={open}
      onClose={deleting ? undefined : onClose}
      aria-labelledby="confirm-delete-title"
    >
      <DialogTitle id="confirm-delete-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting} autoFocus>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={deleting}
        >
          {deleting ? 'Deleting…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
