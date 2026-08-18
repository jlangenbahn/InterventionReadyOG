import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Stack,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
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
  { field: 'focusConcept', headerName: 'Focus concept', flex: 1, minWidth: 110 },
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
  { field: 'focusConcept', headerName: 'Focus concept', flex: 1, minWidth: 110 },
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

const MASTERY_STATUSES = ['unknown', 'new', 'review', 'mastered']

/** Same sequential teal as Scope & Sequence: unknown (lightest) → mastered (darkest). */
const MASTERY_ROW_COLORS = {
  unknown: { bg: '#eef6f8', hover: '#e2f0f3', color: '#1a2a2e' },
  new: { bg: '#c5dce1', hover: '#b4d2d8', color: '#1a2a2e' },
  review: { bg: '#7aadb8', hover: '#689faa', color: '#102428' },
  mastered: { bg: '#0f4c5c', hover: '#0c3e4b', color: '#ffffff' },
}

function masteryColors(status) {
  return MASTERY_ROW_COLORS[status] ?? MASTERY_ROW_COLORS.unknown
}

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function MasteryLegend() {
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
      <Typography variant="caption" color="text.secondary">
        Mastery:
      </Typography>
      {MASTERY_STATUSES.map((status) => {
        const colors = masteryColors(status)
        return (
          <Chip
            key={status}
            size="small"
            label={status}
            sx={{
              bgcolor: colors.bg,
              color: colors.color,
              textTransform: 'capitalize',
              fontWeight: 600,
            }}
          />
        )
      })}
    </Stack>
  )
}

function MasteryChip({ status, label, sx, ...chipProps }) {
  const colors = masteryColors(status)
  return (
    <Chip
      size="small"
      label={label ?? status}
      {...chipProps}
      sx={{
        bgcolor: colors.bg,
        color: colors.color,
        fontWeight: 600,
        textTransform: label ? 'none' : 'capitalize',
        ...sx,
      }}
    />
  )
}

function CreateConceptActions({
  concepts = [],
  kind = 'list',
  onCreate,
  disabled = false,
  emptyLabel,
}) {
  if (!concepts.length) {
    return emptyLabel ? (
      <Typography variant="body2" color="text.secondary">
        {emptyLabel}
      </Typography>
    ) : null
  }

  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {concepts.map((concept) => {
        const name = concept?.concept || 'concept'
        return (
          <Button
            key={concept.id}
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={disabled || !concept?.id}
            onClick={() => onCreate?.(concept)}
          >
            {`Create ${name} ${kind}`}
          </Button>
        )
      })}
    </Stack>
  )
}

function ConceptAutocomplete({
  label,
  options,
  value,
  onChange,
  multiple = false,
  maxCount = 1,
  disabledIds = [],
  required = false,
}) {
  const disabled = new Set(disabledIds)
  const selectedIds = new Set(
    multiple
      ? (value ?? []).map((item) => item?.id).filter(Boolean)
      : value?.id
        ? [value.id]
        : [],
  )

  return (
    <Autocomplete
      multiple={multiple}
      fullWidth
      options={options}
      value={value}
      onChange={(_event, next) => {
        if (!multiple) {
          onChange(next)
          return
        }
        const limited = Array.isArray(next) ? next.slice(0, maxCount) : []
        onChange(limited)
      }}
      groupBy={(option) => (option.inScope ? 'In scope' : 'Not in scope')}
      getOptionLabel={(option) => option?.concept || ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      getOptionDisabled={(option) => {
        if (disabled.has(option.id)) return true
        if (!multiple) return false
        if (selectedIds.has(option.id)) return false
        return selectedIds.size >= maxCount
      }}
      filterSelectedOptions={multiple}
      disableCloseOnSelect={multiple}
      renderTags={(selected, getTagProps) =>
        selected.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index })
          return (
            <MasteryChip
              key={key}
              {...tagProps}
              status={option.masteryStatus}
              label={option.concept}
            />
          )
        })
      }
      renderOption={(props, option) => {
        const { key, ...optionProps } = props
        const colors = masteryColors(option.masteryStatus)
        return (
          <Box
            component="li"
            key={key}
            {...optionProps}
            sx={{
              bgcolor: `${colors.bg} !important`,
              color: colors.color,
              '&:hover': { bgcolor: `${colors.hover} !important` },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', py: 0.25 }}>
              <Typography variant="body2" sx={{ flex: 1, color: 'inherit' }}>
                {option.concept}
              </Typography>
              <Chip
                size="small"
                label={option.masteryStatus}
                sx={{
                  bgcolor: 'transparent',
                  color: 'inherit',
                  border: '1px solid currentColor',
                  textTransform: 'capitalize',
                  height: 22,
                }}
              />
            </Stack>
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          required={required}
        />
      )}
    />
  )
}

export default function CreateLessonStepper({
  activeStep,
  onStepChange,
  lessonDate,
  onLessonDateChange,
  conceptOptions = [],
  selectedNewConceptId = null,
  selectedReviewConceptIds = [],
  onSelectedNewConceptChange,
  onSelectedReviewConceptsChange,
  lessonNotes = '',
  onLessonNotesChange,
  lessonName = '',
  onLessonNameChange,
  newConceptLists = [],
  reviewConceptLists = [],
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
  onCreateList,
  onCreateSentence,
  onCreatePassage,
}) {
  const newConceptListId = newConceptIds[0] ?? null
  const newConceptValue = conceptOptions.find((item) => item.id === selectedNewConceptId) ?? null
  const reviewConceptValues = selectedReviewConceptIds
    .map((id) => conceptOptions.find((item) => item.id === id))
    .filter(Boolean)
  const conceptsReady =
    Boolean(lessonDate) && Boolean(selectedNewConceptId) && selectedReviewConceptIds.length > 0
  const canContinueFromNewList = conceptsReady && Boolean(newConceptListId)
  const sentenceConcepts = [newConceptValue, ...reviewConceptValues].filter(Boolean)

  return (
    <Box>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Lesson setup</Typography>
        <MasteryLegend />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="stretch">
          <TextField
            label="Lesson name"
            size="small"
            value={lessonName}
            onChange={(event) => onLessonNameChange(event.target.value)}
            placeholder="e.g. Week 3 dictation"
            sx={{ flex: 1, minWidth: 0 }}
            helperText={
              newConceptValue?.concept
                ? `Saved as “${lessonName.trim() ? `${lessonName.trim()} — ${newConceptValue.concept}` : `Lesson — ${newConceptValue.concept}`}”`
                : 'The new concept name is appended after you pick it.'
            }
          />
          <TextField
            label="Lesson date"
            type="date"
            size="small"
            required
            value={lessonDate}
            onChange={(event) => onLessonDateChange(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: { xs: '100%', sm: 190 }, flexShrink: 0 }}
          />
        </Stack>
        <Box sx={{ minWidth: 0 }}>
          <ConceptAutocomplete
            label="New concept"
            required
            options={conceptOptions}
            value={newConceptValue}
            onChange={(next) => onSelectedNewConceptChange(next?.id ?? null)}
          />
        </Box>
        <ConceptAutocomplete
          label="Review concepts"
          required
          multiple
          maxCount={3}
          options={conceptOptions}
          value={reviewConceptValues}
          disabledIds={selectedNewConceptId ? [selectedNewConceptId] : []}
          onChange={(next) => onSelectedReviewConceptsChange((next ?? []).map((item) => item.id))}
        />
        <TextField
          label="Lesson notes"
          placeholder="Add notes for this specific lesson…"
          value={lessonNotes}
          onChange={(event) => onLessonNotesChange(event.target.value)}
          multiline
          minRows={3}
          fullWidth
          size="small"
        />
        {!conceptsReady ? (
          <Alert severity="info">
            Choose a lesson date, one new concept, and at least one review concept (up to three)
            before selecting lists.
          </Alert>
        ) : null}
      </Stack>

      <Stepper activeStep={activeStep} orientation="vertical" nonLinear>
        <Step completed={Boolean(newConceptListId)}>
          <StepLabel
            optional={<Typography variant="caption">Required</Typography>}
            onClick={() => onStepChange(0)}
            sx={{ cursor: 'pointer' }}
          >
            New concept list
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {selectedNewConceptId
                ? 'Only lists tagged with the selected new concept are shown.'
                : 'Select a new concept above to see matching lists.'}
            </Typography>
            <StepperSelectionGrid
              items={newConceptLists}
              columns={LIST_COLUMNS}
              selectedIds={newConceptIds}
              onChange={onNewConceptChange}
              maxCount={1}
              loading={loading || loadingLists}
              noRowsLabel={
                selectedNewConceptId
                  ? 'No lists for this concept yet. Create one above.'
                  : 'Select a new concept above to filter lists.'
              }
              getItemLabel={(list) => list.name || 'Untitled list'}
              header={
                <CreateConceptActions
                  concepts={newConceptValue ? [newConceptValue] : []}
                  kind="list"
                  onCreate={onCreateList}
                  emptyLabel="Select a new concept above to create a matching list."
                />
              }
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                variant="contained"
                onClick={() => onStepChange(1)}
                disabled={!canContinueFromNewList}
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
              {selectedReviewConceptIds.length
                ? 'Only lists tagged with the selected review concepts are shown. The new concept list is hidden so it is not chosen twice.'
                : 'Select review concepts above to see matching lists.'}
            </Typography>
            <StepperSelectionGrid
              items={reviewConceptLists}
              columns={LIST_COLUMNS}
              selectedIds={reviewIds}
              onChange={onReviewChange}
              maxCount={3}
              excludeIds={newConceptIds}
              loading={loading || loadingLists}
              noRowsLabel={
                selectedReviewConceptIds.length
                  ? 'No other lists available for the selected review concepts. Create one above.'
                  : 'Select review concepts above to filter lists.'
              }
              getItemLabel={(list) => list.name || 'Untitled list'}
              header={
                <CreateConceptActions
                  concepts={reviewConceptValues}
                  kind="list"
                  onCreate={onCreateList}
                  emptyLabel="Select review concepts above to create a matching list."
                />
              }
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button onClick={() => onStepChange(0)}>Back</Button>
              <Button variant="contained" onClick={() => onStepChange(2)} disabled={!conceptsReady}>
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
              Only sentences whose focus concept matches the new or review concepts above are shown.
            </Typography>
            <StepperSelectionGrid
              items={sentences}
              columns={SENTENCE_COLUMNS}
              selectedIds={sentenceIds}
              onChange={onSentencesChange}
              maxCount={6}
              loading={loading}
              noRowsLabel={
                selectedNewConceptId
                  ? 'No sentences with those focus concepts. Create one above.'
                  : 'Select new and review concepts above to filter sentences by focus concept.'
              }
              getItemLabel={(sentence) => truncate(sentence.text, 60) || 'Untitled sentence'}
              header={
                <CreateConceptActions
                  concepts={sentenceConcepts}
                  kind="sentence"
                  onCreate={onCreateSentence}
                  emptyLabel="Select new and review concepts above to create a matching sentence."
                />
              }
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
              Only passages whose focus concept matches the new or review concepts above are shown.
            </Typography>
            <StepperSelectionGrid
              items={passages}
              columns={PASSAGE_COLUMNS}
              selectedIds={passageIds}
              onChange={onPassagesChange}
              maxCount={2}
              loading={loading}
              noRowsLabel={
                selectedNewConceptId
                  ? 'No passages with those focus concepts. Create one above.'
                  : 'Select new and review concepts above to filter passages by focus concept.'
              }
              getItemLabel={(passage) => passage.title || truncate(passage.text, 60) || 'Untitled passage'}
              header={
                <CreateConceptActions
                  concepts={sentenceConcepts}
                  kind="passage"
                  onCreate={onCreatePassage}
                  emptyLabel="Select new and review concepts above to create a matching passage."
                />
              }
            />
            {!canCreate ? (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Choose a lesson date, new concept, review concepts, and a new concept list before
                creating the lesson.
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
    </Box>
  )
}
