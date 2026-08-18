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
import { updatePassage, updateSentence } from '../lib/crudRecords'

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
  editItem = null,
  lockKind = false,
  preferredFocusConcept = null,
}) {
  const [kindState, setKindState] = useState(editItem?.kind || 'sentence')
  const kind = kindProp ?? kindState
  const preferredFocusId = preferredFocusConcept?.id ?? null
  const preferredFocusName =
    preferredFocusConcept?.name || preferredFocusConcept?.concept || ''
  const [text, setText] = useState(editItem?.text || '')
  const [title, setTitle] = useState(editItem?.title || '')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [focusConceptId, setFocusConceptId] = useState(
    editItem?.focusConceptId ?? preferredFocusId ?? null,
  )
  const [focusTouched, setFocusTouched] = useState(
    Boolean(editItem?.id || preferredFocusId),
  )
  const editing = Boolean(editItem?.id)

  useEffect(() => {
    if (!editItem?.id) {
      setText('')
      setTitle(preferredFocusName)
      setFocusConceptId(preferredFocusId)
      setFocusTouched(Boolean(preferredFocusId))
      setNotice('')
      return
    }
    setText(editItem.text || '')
    setTitle(editItem.title || '')
    setFocusConceptId(editItem.focusConceptId || null)
    setFocusTouched(Boolean(editItem.focusConceptId))
    setNotice('')
  }, [
    editItem?.id,
    editItem?.kind,
    editItem?.text,
    editItem?.title,
    editItem?.focusConceptId,
    preferredFocusId,
    preferredFocusName,
  ])

  const catalogIndex = useMemo(
    () => buildWordCatalogIndex(concepts, wordsByConceptId),
    [concepts, wordsByConceptId],
  )

  const tagged = useMemo(() => tagMultiWordText(text, catalogIndex), [text, catalogIndex])

  const focusOptions = useMemo(() => {
    const rows = [...(tagged.conceptRows ?? [])]
    if (preferredFocusId && !rows.some((row) => row.id === preferredFocusId)) {
      rows.unshift({
        id: preferredFocusId,
        name: preferredFocusName || 'Selected concept',
      })
    }
    return rows
  }, [tagged.conceptRows, preferredFocusId, preferredFocusName])
  const focusValue = focusOptions.find((row) => row.id === focusConceptId) ?? null

  useEffect(() => {
    const topId = tagged.topConcept?.id ?? null
    if (!focusTouched) {
      setFocusConceptId(preferredFocusId || topId)
      return
    }
    if (focusConceptId && !tagged.conceptIds.includes(focusConceptId)) {
      if (focusConceptId === preferredFocusId) return
      setFocusConceptId(preferredFocusId || topId)
      setFocusTouched(Boolean(preferredFocusId))
    }
  }, [tagged.topConcept?.id, tagged.conceptIds, focusTouched, focusConceptId, preferredFocusId])

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
      let savedId = editItem?.id || null
      if (kind === 'passage') {
        if (editing) {
          await updatePassage({
            id: editItem.id,
            title: title.trim() || focusName || 'Untitled passage',
            text: trimmed,
            wordCount: tagged.tokenCount,
            conceptID: focusConceptId,
            tagged,
          })
          savedId = editItem.id
          setNotice('Passage updated.')
        } else {
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
        }
      } else if (editing) {
        await updateSentence({
          id: editItem.id,
          text: trimmed,
          wordCount: tagged.tokenCount,
          conceptID: focusConceptId,
          tagged,
        })
        savedId = editItem.id
        setNotice('Sentence updated.')
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
          {lockKind ? (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={kind === 'passage' ? 'Passage' : 'Sentence'}
              sx={{ alignSelf: 'flex-start' }}
            />
          ) : (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={kind}
              disabled={editing}
              onChange={(_event, value) => setKindValue(value)}
            >
              <ToggleButton value="sentence">Sentence</ToggleButton>
              <ToggleButton value="passage">Passage</ToggleButton>
            </ToggleButtonGroup>
          )}
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
              {kind === 'passage'
                ? editing
                  ? 'Save passage changes'
                  : 'Save tagged passage'
                : editing
                  ? 'Save sentence changes'
                  : 'Save tagged sentence'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  )
}
