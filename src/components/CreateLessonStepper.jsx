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
import { MASTERY_ROW_COLORS, REVIEW_SLOT_COLORS, UNREPRESENTED_COLORS } from '../theme'

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

function masteryColors(status) {
  return MASTERY_ROW_COLORS[status] ?? MASTERY_ROW_COLORS.unknown
}

function reviewSlotColors(index) {
  if (!Number.isInteger(index) || index < 0) return null
  return REVIEW_SLOT_COLORS[index] ?? null
}

function slotChipSx(colors) {
  if (!colors) return undefined
  return {
    bgcolor: colors.bg,
    color: colors.color,
    fontWeight: 600,
    border: `1px solid ${colors.border}`,
    '& .MuiChip-deleteIcon': { color: colors.color },
  }
}

const REVIEW_SLOT_GRID_SX = Object.fromEntries(
  REVIEW_SLOT_COLORS.flatMap((tone) => [
    [`& .${tone.slotClass}`, { bgcolor: `${tone.rowBg} !important` }],
    [`& .${tone.slotClass}:hover`, { bgcolor: `${tone.rowHover} !important` }],
    [
      `& .${tone.slotClass}.Mui-selected, & .${tone.slotClass}.stepper-selected-row`,
      { bgcolor: `${tone.rowSelected} !important` },
    ],
  ]),
)

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
  representedIds,
  slotColorsById,
}) {
  if (!concepts.length) {
    return emptyLabel ? (
      <Typography variant="body2" color="text.secondary">
        {emptyLabel}
      </Typography>
    ) : null
  }

  const represented = representedIds instanceof Set ? representedIds : new Set(representedIds ?? [])
  const colorByCoverage = representedIds != null

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {concepts.map((concept) => {
          const name = concept?.concept || 'concept'
          const isRepresented = represented.has(concept.id)
          const slotColors = slotColorsById?.get(concept.id)
          const colors = colorByCoverage && !isRepresented ? UNREPRESENTED_COLORS : slotColors
          return (
            <Button
              key={concept.id}
              size="small"
              variant={colorByCoverage && isRepresented ? 'contained' : 'outlined'}
              startIcon={<AddIcon />}
              disabled={disabled || !concept?.id}
              onClick={() => onCreate?.(concept)}
              sx={
                colors
                  ? {
                      bgcolor: colors.bg,
                      color: colors.color,
                      borderColor: colors.border,
                      fontWeight: 700,
                      boxShadow: 'none',
                      '&:hover': {
                        bgcolor: colors.hover,
                        borderColor: colors.border,
                        boxShadow: 'none',
                      },
                    }
                  : undefined
              }
            >
              {`Create ${name} ${kind}`}
            </Button>
          )
        })}
      </Stack>
      {colorByCoverage ? (
        <Typography variant="caption" color="text.secondary">
          Gray means that review concept has no list selected yet. Each color matches one of the
          review concepts you chose.
        </Typography>
      ) : null}
    </Stack>
  )
}

function conceptSearchText(option) {
  return [option?.concept, option?.category, option?.subcategory, option?.level]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
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
  loading = false,
  tagPalette = 'mastery',
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
      autoHighlight
      openOnFocus
      options={options ?? []}
      loading={loading}
      value={multiple ? (value ?? []) : (value ?? null)}
      onChange={(_event, next) => {
        if (!multiple) {
          onChange(next)
          return
        }
        const limited = Array.isArray(next) ? next.slice(0, maxCount) : []
        onChange(limited)
      }}
      groupBy={(option) => (option.inScope ? 'In scope' : 'Not in scope')}
      getOptionKey={(option) => option?.id}
      getOptionLabel={(option) => option?.concept || option?.label || ''}
      isOptionEqualToValue={(option, selected) => option?.id === selected?.id}
      filterOptions={(items, state) => {
        const query = String(state.inputValue ?? '').trim().toLowerCase()
        if (!query) return items
        return items.filter((option) => conceptSearchText(option).includes(query))
      }}
      getOptionDisabled={(option) => {
        if (disabled.has(option.id)) return true
        if (!multiple) return false
        if (selectedIds.has(option.id)) return false
        return selectedIds.size >= maxCount
      }}
      filterSelectedOptions={multiple}
      disableCloseOnSelect={multiple}
      noOptionsText={loading ? 'Loading concepts…' : 'No concepts in the catalog yet.'}
      slotProps={{
        popper: { sx: { zIndex: 1400 } },
        listbox: { sx: { maxHeight: 320 } },
      }}
      renderGroup={(params) => (
        <li key={params.key}>
          <Box
            component="div"
            sx={{
              px: 2,
              py: 0.75,
              typography: 'caption',
              color: 'text.secondary',
              fontWeight: 700,
              bgcolor: 'background.paper',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            {params.group}
          </Box>
          <Box component="ul" sx={{ p: 0, m: 0 }}>
            {params.children}
          </Box>
        </li>
      )}
      renderTags={(selected, getTagProps) =>
        selected.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index })
          if (tagPalette === 'reviewSlots') {
            return (
              <Chip
                key={key}
                {...tagProps}
                size="small"
                label={option.concept}
                sx={slotChipSx(reviewSlotColors(index))}
              />
            )
          }
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
          <li
            key={key}
            {...optionProps}
            style={{
              ...optionProps.style,
              backgroundColor: colors.bg,
              color: colors.color,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', py: 0.25 }}>
              <Typography variant="body2" sx={{ flex: 1, color: 'inherit' }}>
                {option.concept || 'Untitled concept'}
              </Typography>
              <Chip
                size="small"
                label={option.masteryStatus || 'unknown'}
                sx={{
                  bgcolor: 'transparent',
                  color: 'inherit',
                  border: '1px solid currentColor',
                  textTransform: 'capitalize',
                  height: 22,
                }}
              />
            </Stack>
          </li>
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
  lessonNumber = null,
  loadingCatalog = false,
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
  onDeleteSentence,
  onDeletePassage,
}) {
  const newConceptListId = newConceptIds[0] ?? null
  const newConceptValue = conceptOptions.find((item) => item.id === selectedNewConceptId) ?? null
  const reviewConceptValues = selectedReviewConceptIds
    .map((id) => conceptOptions.find((item) => item.id === id))
    .filter(Boolean)
  const defaultNamePreview = newConceptValue?.concept
    ? `Lesson Plan #${lessonNumber || 1} – ${newConceptValue.concept}`
    : `Lesson Plan #${lessonNumber || 1}`
  const conceptsReady =
    Boolean(lessonDate) && Boolean(selectedNewConceptId) && selectedReviewConceptIds.length > 0
  const canContinueFromNewList = conceptsReady && Boolean(newConceptListId)
  const sentenceConcepts = [newConceptValue, ...reviewConceptValues].filter(Boolean)
  const reviewSlotColorsById = new Map(
    selectedReviewConceptIds.map((id, index) => [id, reviewSlotColors(index)]),
  )
  const representedReviewConceptIds = new Set(
    reviewIds
      .map((id) => reviewConceptLists.find((list) => list.id === id)?.conceptID)
      .filter(Boolean),
  )

  function reviewListTone(list) {
    const index = selectedReviewConceptIds.indexOf(list?.conceptID)
    return reviewSlotColors(index)
  }

  return (
    <Box>
      <Stepper activeStep={activeStep} orientation="vertical" nonLinear>
        <Step completed={conceptsReady}>
          <StepLabel
            optional={<Typography variant="caption">Required</Typography>}
            onClick={() => onStepChange(0)}
            sx={{ cursor: 'pointer' }}
          >
            Lesson setup
          </StepLabel>
          <StepContent>
            <Stack spacing={1.5}>
              <MasteryLegend />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="stretch">
                <TextField
                  label="Lesson name"
                  size="small"
                  value={lessonName}
                  onChange={(event) => onLessonNameChange(event.target.value)}
                  placeholder={defaultNamePreview}
                  sx={{ flex: 1, minWidth: 0 }}
                  helperText={`Default name is “${defaultNamePreview}”. Edit it if you want a custom title.`}
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
                  loading={loadingCatalog}
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
                loading={loadingCatalog}
                disabledIds={selectedNewConceptId ? [selectedNewConceptId] : []}
                onChange={(next) => onSelectedReviewConceptsChange((next ?? []).map((item) => item.id))}
                tagPalette="reviewSlots"
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
              {!loadingCatalog && conceptOptions.length === 0 ? (
                <Alert severity="warning">
                  No concepts are available yet. Open the Concepts tab to confirm the catalog loaded, then
                  return here to choose a new concept and review concepts.
                </Alert>
              ) : null}
              {!conceptsReady ? (
                <Alert severity="info">
                  Choose a lesson date, one new concept, and at least one review concept (up to three)
                  before selecting lists.
                </Alert>
              ) : null}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button variant="contained" onClick={() => onStepChange(1)} disabled={!conceptsReady}>
                Continue
              </Button>
            </Stack>
          </StepContent>
        </Step>

        <Step completed={Boolean(newConceptListId)}>
          <StepLabel
            optional={<Typography variant="caption">Required</Typography>}
            onClick={() => onStepChange(1)}
            sx={{ cursor: 'pointer' }}
          >
            New concept list
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {selectedNewConceptId
                ? 'Only lists tagged with the selected new concept are shown.'
                : 'Select a new concept in Lesson setup to see matching lists.'}
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
                  : 'Select a new concept in Lesson setup to filter lists.'
              }
              getItemLabel={(list) => list.name || 'Untitled list'}
              header={
                <CreateConceptActions
                  concepts={newConceptValue ? [newConceptValue] : []}
                  kind="list"
                  onCreate={onCreateList}
                  emptyLabel="Select a new concept in Lesson setup to create a matching list."
                />
              }
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button onClick={() => onStepChange(0)}>Back</Button>
              <Button
                variant="contained"
                onClick={() => onStepChange(2)}
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
            onClick={() => onStepChange(2)}
            sx={{ cursor: 'pointer' }}
          >
            Review concept lists
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {selectedReviewConceptIds.length
                ? 'Only lists tagged with the selected review concepts are shown. The new concept list is hidden so it is not chosen twice.'
                : 'Select review concepts in Lesson setup to see matching lists.'}
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
                  : 'Select review concepts in Lesson setup to filter lists.'
              }
              getItemLabel={(list) => list.name || 'Untitled list'}
              getItemClassName={(list) => reviewListTone(list)?.slotClass}
              getChipSx={(list) => slotChipSx(reviewListTone(list))}
              gridSx={REVIEW_SLOT_GRID_SX}
              header={
                <CreateConceptActions
                  concepts={reviewConceptValues}
                  kind="list"
                  onCreate={onCreateList}
                  emptyLabel="Select review concepts in Lesson setup to create a matching list."
                  representedIds={representedReviewConceptIds}
                  slotColorsById={reviewSlotColorsById}
                />
              }
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button onClick={() => onStepChange(1)}>Back</Button>
              <Button variant="contained" onClick={() => onStepChange(3)} disabled={!conceptsReady}>
                Continue
              </Button>
            </Stack>
          </StepContent>
        </Step>

        <Step completed={sentenceIds.length > 0}>
          <StepLabel
            optional={<Typography variant="caption">Up to 6</Typography>}
            onClick={() => onStepChange(3)}
            sx={{ cursor: 'pointer' }}
          >
            Sentences
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Only sentences whose focus concept matches the new or review concepts from Lesson setup are shown.
              Use the trash icon on a row to delete a sentence.
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
                  : 'Select new and review concepts in Lesson setup to filter sentences by focus concept.'
              }
              getItemLabel={(sentence) => truncate(sentence.text, 60) || 'Untitled sentence'}
              onDeleteItem={onDeleteSentence}
              header={
                <CreateConceptActions
                  concepts={sentenceConcepts}
                  kind="sentence"
                  onCreate={onCreateSentence}
                  emptyLabel="Select new and review concepts in Lesson setup to create a matching sentence."
                />
              }
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button onClick={() => onStepChange(2)}>Back</Button>
              <Button variant="contained" onClick={() => onStepChange(4)}>
                Continue
              </Button>
            </Stack>
          </StepContent>
        </Step>

        <Step completed={passageIds.length > 0}>
          <StepLabel
            optional={<Typography variant="caption">Up to 2</Typography>}
            onClick={() => onStepChange(4)}
            sx={{ cursor: 'pointer' }}
          >
            Passages
          </StepLabel>
          <StepContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Only passages whose focus concept matches the new or review concepts from Lesson setup are shown.
              Use the trash icon on a row to delete a passage.
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
                  : 'Select new and review concepts in Lesson setup to filter passages by focus concept.'
              }
              getItemLabel={(passage) => passage.title || truncate(passage.text, 60) || 'Untitled passage'}
              onDeleteItem={onDeletePassage}
              header={
                <CreateConceptActions
                  concepts={sentenceConcepts}
                  kind="passage"
                  onCreate={onCreatePassage}
                  emptyLabel="Select new and review concepts in Lesson setup to create a matching passage."
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
              <Button onClick={() => onStepChange(3)}>Back</Button>
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
