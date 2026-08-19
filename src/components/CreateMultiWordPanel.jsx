import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SaveIcon from '@mui/icons-material/Save'
import { generateClient } from 'aws-amplify/data'
import {
  buildWordCatalogIndex,
  serializeTagResult,
  tagMultiWordText,
} from '../lib/tagMultiWordText'
import { updatePassage, updateSentence } from '../lib/crudRecords'
import { resolveListWords } from '../lib/fetchStudentLessonPlan'
import { generateLessonText } from '../lib/generateLessonText'
import { sanitizeGeneratedLessonText } from '../lib/sanitizeLessonText'

const client = generateClient()

function buildWordLookup(wordsByConceptId) {
  const lookup = new Map()
  if (!wordsByConceptId) return lookup
  for (const rows of wordsByConceptId.values()) {
    for (const row of rows ?? []) {
      const word = typeof row?.word === 'string' ? row.word : ''
      if (!word) continue
      if (row.wordId) lookup.set(row.wordId, word)
      if (row.id) lookup.set(row.id, word)
    }
  }
  return lookup
}

function uniqueWords(words) {
  const seen = new Set()
  const result = []
  for (const raw of words ?? []) {
    const word = String(raw ?? '').trim()
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(word)
  }
  return result
}

function listSourceWords(list, wordLookup) {
  const nested = Array.isArray(list?.words) ? list.words : []
  if (nested.length && nested.every((item) => typeof item === 'string')) {
    return uniqueWords(nested)
  }
  return uniqueWords(resolveListWords(list, wordLookup))
}

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
  lists = [],
}) {
  const [kindState, setKindState] = useState(editItem?.kind || 'sentence')
  const kind = kindProp ?? kindState
  const preferredFocusId = preferredFocusConcept?.id ?? null
  const preferredFocusName =
    preferredFocusConcept?.name || preferredFocusConcept?.concept || ''
  const [text, setText] = useState(editItem?.text || '')
  const [title, setTitle] = useState(editItem?.title || '')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedListId, setSelectedListId] = useState(null)
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
    setGenerateError('')
    setSelectedListId(null)
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
  const wordLookup = useMemo(() => buildWordLookup(wordsByConceptId), [wordsByConceptId])
  const sourceListConceptId = preferredFocusId || focusConceptId
  const sourceLists = useMemo(
    () =>
      (lists ?? [])
        .filter((list) => list?.id)
        .filter((list) => !sourceListConceptId || list.conceptID === sourceListConceptId)
        .map((list) => ({
          id: list.id,
          name: list.name || 'Untitled list',
          conceptID: list.conceptID || null,
          words: listSourceWords(list, wordLookup),
        }))
        .filter((list) => list.words.length > 0),
    [lists, wordLookup, sourceListConceptId],
  )
  const selectedSourceList = sourceLists.find((list) => list.id === selectedListId) ?? null

  useEffect(() => {
    if (!sourceLists.length) {
      if (selectedListId) setSelectedListId(null)
      return
    }
    if (selectedListId && sourceLists.some((list) => list.id === selectedListId)) return
    setSelectedListId(sourceLists[0].id)
  }, [sourceLists, selectedListId])

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

  function handleSelectList(list) {
    if (!list?.id) return
    setSelectedListId(list.id)
    if (!preferredFocusId && list.conceptID) {
      setFocusTouched(true)
      setFocusConceptId(list.conceptID)
    }
  }

  async function handleGenerate() {
    if (!selectedSourceList?.words?.length) {
      setGenerateError('Select a word list to generate from.')
      return
    }
    setGenerating(true)
    setGenerateError('')
    try {
      const conceptName = preferredFocusName || focusValue?.name || 'this concept'
      const draft = await generateLessonText({
        kind,
        conceptName,
        words: selectedSourceList.words,
      })
      const cleaned = sanitizeGeneratedLessonText(draft, {
        conceptName,
        title,
      })
      setText(cleaned.text)
      if (kind === 'passage' && !title.trim() && cleaned.extractedTitle) {
        setTitle(cleaned.extractedTitle)
      }
      setNotice(`Andrea ${kind} added. Edit it below before saving if you want.`)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate text'
      setGenerateError(message)
      setError(message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!student?.id) {
      setError('Select a student before saving.')
      return
    }
    const trimmed = sanitizeGeneratedLessonText(text, {
      conceptName: focusValue?.name || tagged.topConcept?.name || '',
      title,
    }).text
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
      const taggedForSave =
        trimmed === String(text ?? '').trim() ? tagged : tagMultiWordText(trimmed, catalogIndex)
      const payload = serializeTagResult(taggedForSave)
      const focusName = focusValue?.name || taggedForSave.topConcept?.name
      let savedId = editItem?.id || null
      if (kind === 'passage') {
        if (editing) {
          await updatePassage({
            id: editItem.id,
            title: title.trim() || focusName || 'Untitled passage',
            text: trimmed,
            wordCount: taggedForSave.tokenCount,
            conceptID: focusConceptId,
            tagged: taggedForSave,
          })
          savedId = editItem.id
          setNotice('Passage updated.')
        } else {
          const { data, errors } = await client.models.Passage.create({
            title: title.trim() || focusName || 'Untitled passage',
            text: trimmed,
            wordCount: taggedForSave.tokenCount,
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
          wordCount: taggedForSave.tokenCount,
          conceptID: focusConceptId,
          tagged: taggedForSave,
        })
        savedId = editItem.id
        setNotice('Sentence updated.')
      } else {
        const sentencePayload = {
          text: trimmed,
          wordCount: taggedForSave.tokenCount,
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

        const wordIds = taggedForSave.wordIds.filter(Boolean)
        const conceptIds = taggedForSave.conceptIds.filter(Boolean)
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
      if (trimmed !== text) setText(trimmed)
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
          {loadingCatalog || saving || generating ? <CircularProgress size={16} /> : null}
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          {notice ? <Chip size="small" color="success" label={notice} /> : null}
          {saving || generating ? <CircularProgress size={16} /> : null}
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
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: 'rgba(15, 76, 92, 0.04)',
              borderColor: 'rgba(15, 76, 92, 0.18)',
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <AutoAwesomeIcon color="secondary" sx={{ mt: 0.25 }} />
                <Box>
                  <Typography variant="subtitle2">Generate with Andrea</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Andrea is the AI Agent for ReadyOG!. Pick a word list for this concept, then
                    generate a simple {kind === 'passage' ? 'passage' : 'sentence'} into the editor.
                    You can edit it before saving.
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {sourceListConceptId
                  ? 'Word lists for this concept'
                  : "Word lists — select one to use as Andrea's source"}
              </Typography>
              {sourceLists.length ? (
                <List
                  dense
                  disablePadding
                  sx={{
                    maxHeight: 168,
                    overflow: 'auto',
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  {sourceLists.map((list) => (
                    <ListItemButton
                      key={list.id}
                      selected={list.id === selectedListId}
                      onClick={() => handleSelectList(list)}
                    >
                      <ListItemText
                        primary={list.name}
                        secondary={`${list.words.length} word${list.words.length === 1 ? '' : 's'}`}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {sourceListConceptId
                    ? 'No word lists for this concept yet. Create a list first, then come back to generate.'
                    : 'No word lists yet. Create a list first, then come back to generate.'}
                </Typography>
              )}
              {selectedSourceList ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {selectedSourceList.words.slice(0, 12).map((word) => (
                    <Chip key={word} size="small" label={word} variant="outlined" />
                  ))}
                  {selectedSourceList.words.length > 12 ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`+${selectedSourceList.words.length - 12} more`}
                    />
                  ) : null}
                </Stack>
              ) : null}
              <Tooltip
                title={
                  selectedSourceList
                    ? `Generate a ${kind} from “${selectedSourceList.name}”`
                    : 'Select a word list first'
                }
              >
                <span>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={
                      generating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />
                    }
                    onClick={() => void handleGenerate()}
                    disabled={generating || saving || !selectedSourceList}
                  >
                    Generate with Andrea
                  </Button>
                </span>
              </Tooltip>
              {generateError ? (
                <Alert severity="error" onClose={() => setGenerateError('')}>
                  {generateError}
                </Alert>
              ) : null}
            </Stack>
          </Paper>
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
              disabled={saving || generating || loadingCatalog || !text.trim() || !focusConceptId}
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
