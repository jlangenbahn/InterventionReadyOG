import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { DataGridPro, GridToolbar } from '@mui/x-data-grid-pro'
import { generateClient } from 'aws-amplify/data'
import ConceptCountChart from './ConceptCountChart'
import {
  buildWordCatalogIndex,
  serializeTagResult,
  tagMultiWordText,
} from '../lib/tagMultiWordText'

const client = generateClient()

const CONCEPT_COLUMNS = [
  { field: 'name', headerName: 'Concept', flex: 1.4, minWidth: 160 },
  {
    field: 'count',
    headerName: 'Words',
    type: 'number',
    width: 90,
    align: 'left',
    headerAlign: 'left',
  },
  {
    field: 'percentLabel',
    headerName: 'Share',
    width: 90,
  },
  { field: 'examples', headerName: 'Examples', flex: 1.2, minWidth: 140 },
  { field: 'category', headerName: 'Category', flex: 0.8, minWidth: 110 },
]

function StatCard({ label, value, hint }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 120px', minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  )
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`
}

export default function CreateMultiWordPanel({
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  setError,
}) {
  const [kind, setKind] = useState('sentence')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [focusConceptId, setFocusConceptId] = useState(null)
  const [focusTouched, setFocusTouched] = useState(false)

  const catalogIndex = useMemo(
    () => buildWordCatalogIndex(concepts, wordsByConceptId),
    [concepts, wordsByConceptId],
  )

  const tagged = useMemo(() => tagMultiWordText(text, catalogIndex), [text, catalogIndex])

  const focusOptions = tagged.conceptRows ?? []
  const focusValue = focusOptions.find((row) => row.id === focusConceptId) ?? null

  useEffect(() => {
    const topId = tagged.topConcept?.id ?? null
    if (!focusTouched) {
      setFocusConceptId(topId)
      return
    }
    if (focusConceptId && !tagged.conceptIds.includes(focusConceptId)) {
      setFocusConceptId(topId)
      setFocusTouched(false)
    }
  }, [tagged.topConcept?.id, tagged.conceptIds, focusTouched, focusConceptId])

  const conceptRows = useMemo(
    () =>
      (tagged.conceptRows ?? []).map((row) => ({
        ...row,
        percentLabel: formatPercent(row.percentOfTokens),
        examples: [...new Set(row.words)].slice(0, 6).join(', '),
      })),
    [tagged.conceptRows],
  )

  async function handleSave() {
    if (!student?.id) {
      setError('Select a student before saving.')
      return
    }
    const trimmed = text.trim()
    if (!trimmed) {
      setError('Enter some text to tag and save.')
      return
    }
    if (!focusConceptId) {
      setError(
        `Choose a focus concept for this ${kind}. That is the unifying concept used when creating lessons.`,
      )
      return
    }

    setSaving(true)
    try {
      const payload = serializeTagResult(tagged)
      const focusName = focusValue?.name || tagged.topConcept?.name
      if (kind === 'passage') {
        const { data, errors } = await client.models.Passage.create({
          title: title.trim() || focusName || 'Untitled passage',
          text: trimmed,
          wordCount: tagged.tokenCount,
          studentID: student.id,
          conceptID: focusConceptId,
          passageData: JSON.stringify({
            tags: payload,
            focusConceptId,
          }),
        })
        if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
        if (!data?.id) throw new Error('Failed to save passage')
        setNotice('Passage saved and tagged against the word-concept catalog.')
      } else {
        const sentencePayload = {
          text: trimmed,
          wordCount: tagged.tokenCount,
          studentID: student.id,
          sentenceData: JSON.stringify({
            tags: payload,
            focusConceptId,
          }),
        }
        let created = await client.models.Sentence.create({
          ...sentencePayload,
          conceptID: focusConceptId,
        })
        if (created.errors?.length || !created.data?.id) {
          created = await client.models.Sentence.create(sentencePayload)
        }
        const { data, errors } = created
        if (errors?.length) throw new Error(errors.map((item) => item.message).join(', '))
        if (!data?.id) throw new Error('Failed to save sentence')

        const wordIds = tagged.wordIds.filter(Boolean)
        const conceptIds = tagged.conceptIds.filter(Boolean)
        const linkResults = await Promise.all([
          ...wordIds.map((wordId) => client.models.SentenceWord.create({ sentenceId: data.id, wordId })),
          ...conceptIds.map((conceptId) =>
            client.models.SentenceConcept.create({ sentenceId: data.id, conceptId }),
          ),
        ])
        const linkErrors = linkResults.flatMap((result) => result.errors ?? [])
        if (linkErrors.length) throw new Error(linkErrors.map((item) => item.message).join(', '))
        setNotice('Sentence saved and tagged against the word-concept catalog.')
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tagged text')
    } finally {
      setSaving(false)
    }
  }

  if (!student) {
    return (
      <Typography color="text.secondary">
        Select a student to create and tag sentences or passages.
      </Typography>
    )
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Typography variant="h6">Create Multi-Word</Typography>
        {notice ? <Chip size="small" color="success" label={notice} /> : null}
        {loadingCatalog || saving ? <CircularProgress size={16} /> : null}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Type a sentence, passage, or word list. Each word is looked up in the concept-word catalog so
        you can see coverage and concept density before you save.
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={kind}
            onChange={(_event, value) => {
              if (value) setKind(value)
            }}
          >
            <ToggleButton value="sentence">Sentence</ToggleButton>
            <ToggleButton value="passage">Passage</ToggleButton>
          </ToggleButtonGroup>
          {kind === 'passage' ? (
            <TextField
              label="Passage title"
              size="small"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Optional — defaults to the top concept"
            />
          ) : null}
          <TextField
            label={kind === 'passage' ? 'Passage text' : 'Sentence or words'}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setNotice('')
            }}
            multiline
            minRows={kind === 'passage' ? 6 : 4}
            fullWidth
            placeholder={
              kind === 'passage'
                ? 'Paste or write the passage…'
                : 'Write a sentence, or a list of words separated by spaces…'
            }
          />
          <Autocomplete
            options={focusOptions}
            value={focusValue}
            onChange={(_event, next) => {
              setFocusTouched(true)
              setFocusConceptId(next?.id ?? null)
            }}
            getOptionLabel={(option) => option?.name || ''}
            isOptionEqualToValue={(option, selected) => option.id === selected.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Focus concept"
                size="small"
                required
                helperText={
                  kind === 'passage'
                    ? 'The unifying concept for this passage. Lesson creation filters passages by this.'
                    : 'The unifying concept for this sentence. Lesson creation filters sentences by this.'
                }
              />
            )}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => void handleSave()}
              disabled={saving || loadingCatalog || !text.trim() || !focusConceptId}
            >
              {kind === 'passage' ? 'Save tagged passage' : 'Save tagged sentence'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <StatCard label="Words" value={tagged.tokenCount} hint="Tokens in the text" />
        <StatCard
          label="In catalog"
          value={tagged.matchedCount}
          hint={formatPercent(tagged.coverage)}
        />
        <StatCard label="Not in catalog" value={tagged.unmatchedCount} hint="Need a word-bank match" />
        <StatCard label="Concepts" value={tagged.conceptCount} hint="Distinct tags found" />
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          mb: 2,
        }}
      >
        <ConceptCountChart
          rows={tagged.conceptRows}
          totalTokens={tagged.tokenCount}
          title="Concept count"
          emptyLabel="Matched catalog words will appear here as concept bars."
        />
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Word lookup
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Green chips are in the database. Outlined chips were not found.
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ minHeight: 72 }}>
            {tagged.tokens.length ? (
              tagged.tokens.map((token) => (
                <Chip
                  key={`${token.index}-${token.original}`}
                  size="small"
                  label={token.original}
                  color={token.found ? 'success' : 'default'}
                  variant={token.found ? 'filled' : 'outlined'}
                  title={
                    token.found
                      ? token.concepts.map((concept) => concept.name).join(', ')
                      : 'Not in the word-concept catalog'
                  }
                />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                Start typing to tag words.
              </Typography>
            )}
          </Stack>
          {tagged.unmatchedWords.length ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Not in catalog: {tagged.unmatchedWords.slice(0, 12).join(', ')}
              {tagged.unmatchedWords.length > 12 ? '…' : ''}
            </Alert>
          ) : null}
          {tagged.multiConceptCount ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              {tagged.multiConceptCount} word{tagged.multiConceptCount === 1 ? '' : 's'} carry more
              than one concept tag.
            </Typography>
          ) : null}
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Concepts in this text
        </Typography>
        <Box sx={{ height: 320, width: '100%' }}>
          <DataGridPro
            rows={conceptRows}
            columns={CONCEPT_COLUMNS}
            getRowId={(row) => row.id}
            density="compact"
            pagination
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
              sorting: { sortModel: [{ field: 'count', sort: 'desc' }] },
            }}
            slots={{ toolbar: GridToolbar }}
            slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
            localeText={{ noRowsLabel: 'No concept tags yet. Words must exist in the catalog.' }}
          />
        </Box>
      </Paper>
    </Box>
  )
}
