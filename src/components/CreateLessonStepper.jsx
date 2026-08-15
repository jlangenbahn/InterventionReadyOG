import {
  Alert,
  Button,
  Stack,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import StepperSelectionGrid from './StepperSelectionGrid'

const LIST_COLUMNS = [
  { field: 'name', headerName: 'List', flex: 1.2, minWidth: 90 },
  { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 90 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 70,
    align: 'left',
    headerAlign: 'left',
  },
]

const SENTENCE_COLUMNS = [
  { field: 'text', headerName: 'Sentence', flex: 2, minWidth: 140 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 70,
    align: 'left',
    headerAlign: 'left',
  },
]

const PASSAGE_COLUMNS = [
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 90 },
  { field: 'concept', headerName: 'Concept', flex: 1, minWidth: 90 },
  { field: 'text', headerName: 'Text', flex: 1.4, minWidth: 120 },
  {
    field: 'wordCount',
    headerName: 'Words',
    type: 'number',
    width: 70,
    align: 'left',
    headerAlign: 'left',
  },
]

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export default function CreateLessonStepper({
  activeStep,
  onStepChange,
  lessonDate,
  onLessonDateChange,
  lists = [],
  sentences = [],
  passages = [],
  loading = false,
  loadingLists = false,
  newConceptIds = [],
  reviewIds = [],
  sentenceIds = [],
  passageIds = [],
  onNewConceptChange,
  onReviewChange,
  onSentencesChange,
  onPassagesChange,
  onCreate,
  creating = false,
  createLabel = 'Create lesson plan',
  canCreate = false,
}) {
  const newConceptId = newConceptIds[0] ?? null
  const canContinueFromDateAndList = Boolean(lessonDate) && Boolean(newConceptId)

  return (
    <Stepper activeStep={activeStep} orientation="vertical" nonLinear>
      <Step completed={Boolean(newConceptId)}>
        <StepLabel
          optional={<Typography variant="caption">Required</Typography>}
          onClick={() => onStepChange(0)}
          sx={{ cursor: 'pointer' }}
        >
          New concept list
        </StepLabel>
        <StepContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Set the lesson date, then choose the new concept list for this lesson.
          </Typography>
          <TextField
            label="Lesson date"
            type="date"
            size="small"
            value={lessonDate}
            onChange={(event) => onLessonDateChange(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 190, mb: 1.5 }}
          />
          <StepperSelectionGrid
            items={lists}
            columns={LIST_COLUMNS}
            selectedIds={newConceptIds}
            onChange={onNewConceptChange}
            maxCount={1}
            loading={loading || loadingLists}
            noRowsLabel="No lists yet. Create lists on the Concepts & Lists tab."
            getItemLabel={(list) => list.name || 'Untitled list'}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button
              variant="contained"
              onClick={() => onStepChange(1)}
              disabled={!canContinueFromDateAndList}
            >
              Continue
            </Button>
          </Stack>
        </StepContent>
      </Step>

      <Step completed={reviewIds.length > 0}>
        <StepLabel
          optional={<Typography variant="caption">Up to 3</Typography>}
          onClick={() => onStepChange(1)}
          sx={{ cursor: 'pointer' }}
        >
          Review concept lists
        </StepLabel>
        <StepContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select up to three review lists. The new concept list is hidden here so it is not chosen twice.
          </Typography>
          <StepperSelectionGrid
            items={lists}
            columns={LIST_COLUMNS}
            selectedIds={reviewIds}
            onChange={onReviewChange}
            maxCount={3}
            excludeIds={newConceptIds}
            loading={loading || loadingLists}
            noRowsLabel="No other lists available for review."
            getItemLabel={(list) => list.name || 'Untitled list'}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button onClick={() => onStepChange(0)}>Back</Button>
            <Button variant="contained" onClick={() => onStepChange(2)}>
              Continue
            </Button>
          </Stack>
        </StepContent>
      </Step>

      <Step completed={sentenceIds.length > 0}>
        <StepLabel
          optional={<Typography variant="caption">Up to 6</Typography>}
          onClick={() => onStepChange(2)}
          sx={{ cursor: 'pointer' }}
        >
          Sentences
        </StepLabel>
        <StepContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select up to six sentences for dictation.
          </Typography>
          <StepperSelectionGrid
            items={sentences}
            columns={SENTENCE_COLUMNS}
            selectedIds={sentenceIds}
            onChange={onSentencesChange}
            maxCount={6}
            loading={loading}
            noRowsLabel="No sentences yet for this student."
            getItemLabel={(sentence) => truncate(sentence.text, 60) || 'Untitled sentence'}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button onClick={() => onStepChange(1)}>Back</Button>
            <Button variant="contained" onClick={() => onStepChange(3)}>
              Continue
            </Button>
          </Stack>
        </StepContent>
      </Step>

      <Step completed={passageIds.length > 0}>
        <StepLabel
          optional={<Typography variant="caption">Up to 2</Typography>}
          onClick={() => onStepChange(3)}
          sx={{ cursor: 'pointer' }}
        >
          Passages
        </StepLabel>
        <StepContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select up to two passages, then create the lesson plan.
          </Typography>
          <StepperSelectionGrid
            items={passages}
            columns={PASSAGE_COLUMNS}
            selectedIds={passageIds}
            onChange={onPassagesChange}
            maxCount={2}
            loading={loading}
            noRowsLabel="No passages yet for this student."
            getItemLabel={(passage) => passage.title || truncate(passage.text, 60) || 'Untitled passage'}
          />
          {!canCreate ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Choose a new concept list and a lesson date before creating the lesson.
            </Alert>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button onClick={() => onStepChange(2)}>Back</Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SaveIcon />}
              onClick={() => void onCreate()}
              disabled={!canCreate || creating}
            >
              {createLabel}
            </Button>
          </Stack>
        </StepContent>
      </Step>
    </Stepper>
  )
}
