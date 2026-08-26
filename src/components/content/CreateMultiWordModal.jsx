/**
 * Modal wrapper around CreateMultiWordPanel + live preview.
 */
import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material'
import CreateMultiWordPanel from './CreateMultiWordPanel'
import MultiWordPreview from './MultiWordPreview'

export default function CreateMultiWordModal({
  open = false,
  kind = 'sentence',
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  focusConcept = null,
  lists = [],
  setError,
  onClose,
  onCreated,
}) {
  const [preview, setPreview] = useState(null)
  const label = kind === 'passage' ? 'passage' : 'sentence'
  const conceptName = focusConcept?.concept || 'this concept'

  function handleClose() {
    onClose?.()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle>
        Create {conceptName} {label}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <CreateMultiWordPanel
            student={student}
            concepts={concepts}
            wordsByConceptId={wordsByConceptId}
            loadingCatalog={loadingCatalog}
            setError={setError}
            kind={kind}
            lockKind
            preferredFocusConcept={focusConcept}
            lists={lists}
            onPreviewChange={setPreview}
            onSaved={(payload) => {
              onCreated?.(payload)
              onClose?.()
            }}
            embedded
          />
          <MultiWordPreview
            kind={kind}
            title={preview?.title || ''}
            text={preview?.text || ''}
            tagged={preview?.tagged}
            focusConceptId={preview?.focusConceptId ?? focusConcept?.id ?? null}
            focusName={preview?.focusName || conceptName}
            emptyLabel={`Write a ${label} on the left to tag words and set the focus concept.`}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
