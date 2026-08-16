import { useEffect, useMemo, useState } from 'react'
import {
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
import { generateClient } from 'aws-amplify/data'
import {
  buildWordCatalogIndex,
  serializeTagResult,
  tagMultiWordText,
} from '../lib/tagMultiWordText'

const client = generateClient()

export default function CreateMultiWordPanel({
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  setError,
  kind: kindProp,
  onKindChange,
  onPreviewChange,
  onSaved,
  embedded = false,
}) {
  const [kindState, setKindState] = useState('sentence')
  const kind = kindProp ?? kindState
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

  useEffect(() => {
    onPreviewChange?.({
      kind,
      title,
      text,
      tagged,
      focusConceptId,
      focusName: focusValue?.name || '',
    })
  }, [kind, title, text, tagged, focusConceptId, focusValue?.name, onPreviewChange])

  function setKindValue(value) {
    if (!value) return
    if (onKindChange) onKindChange(value)
    else setKindState(value)
  }

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
      let savedId = null
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
        savedId = data.id
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
        savedId = data.id

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
      onSaved?.({ kind, id: savedId })
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
      {!embedded ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Typography variant="h6">Create Multi Word</Typography>
          {notice ? <Chip size="small" color="success" label={notice} /> : null}
          {loadingCatalog || saving ? <CircularProgress size={16} /> : null}
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          {notice ? <Chip size="small" color="success" label={notice} /> : null}
          {saving ? <CircularProgress size={16} /> : null}
        </Stack>
      )}

      <Paper variant={embedded ? 'outlined' : 'elevation'} sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={kind}
            onChange={(_event, value) => setKindValue(value)}
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
              placeholder="Optional — defaults to the focus concept"
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
            minRows={kind === 'passage' ? 8 : 5}
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
    </Box>
  )
}
