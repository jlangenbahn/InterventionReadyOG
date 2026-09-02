/**
 * Compose a sentence or passage, optionally with Ask Andrea, and tag catalog words.
 */
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
  Tooltip,
  Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SaveIcon from '@mui/icons-material/Save'
import AskAndreaButton from '../shared/AskAndreaButton'
import HelpTip from '../shared/HelpTip'
import { client } from '../../lib/amplifyClient'
import {
  buildWordCatalogIndex,
  serializeTagResult,
  tagMultiWordText,
} from '../../lib/tagMultiWordText'
import { updatePassage, updateSentence } from '../../lib/crudRecords'
import { generateLessonText, wordsFromConceptBank } from '../../lib/generateLessonText'
import { sanitizeGeneratedLessonText } from '../../lib/sanitizeLessonText'

function conceptButtonLabel(concept) {
  return concept?.concept || concept?.name || 'Untitled concept'
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
  lessonConcepts = [],
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
  const [selectedAndreaIds, setSelectedAndreaIds] = useState(() => new Set())
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
  const conceptButtons = useMemo(() => {
    const seen = new Set()
    const rows = []
    function push(concept, role) {
      if (!concept?.id || seen.has(concept.id)) return
      seen.add(concept.id)
      rows.push({
        id: concept.id,
        concept: conceptButtonLabel(concept),
        role: role || concept.role || 'review',
      })
    }
    for (const item of lessonConcepts ?? []) push(item, item.role)
    if (preferredFocusConcept) {
      push(preferredFocusConcept, preferredFocusConcept.role || 'new')
    }
    return rows
  }, [lessonConcepts, preferredFocusConcept])

  useEffect(() => {
    const valid = new Set(conceptButtons.map((item) => item.id))
    setSelectedAndreaIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)))
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
      return next
    })
  }, [conceptButtons])

  const tagged = useMemo(() => tagMultiWordText(text, catalogIndex), [text, catalogIndex])

  const focusOptions = useMemo(() => {
    const rows = [...(tagged.conceptRows ?? [])]
    function prepend(id, name) {
      if (!id || rows.some((row) => row.id === id)) return
      rows.unshift({ id, name: name || 'Selected concept' })
    }
    for (const item of [...conceptButtons].reverse()) {
      prepend(item.id, item.concept)
    }
    if (preferredFocusId) prepend(preferredFocusId, preferredFocusName)
    return rows
  }, [tagged.conceptRows, preferredFocusId, preferredFocusName, conceptButtons])
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

  function bankForConcept(concept) {
    return {
      role: concept?.role === 'new' ? 'new' : 'review',
      conceptName: conceptButtonLabel(concept),
      words: wordsFromConceptBank(wordsByConceptId, concept?.id),
    }
  }

  async function handleGenerate() {
    const selected = conceptButtons.filter((concept) => selectedAndreaIds.has(concept.id))
    const banks = selected
      .map((concept) => bankForConcept(concept))
      .filter((bank) => bank.words.length)
    if (!banks.length) {
      setGenerateError('Select at least one concept that has catalog words.')
      return
    }
    const focus = selected.find((concept) => concept.role === 'new') || selected[0]
    setGenerating(true)
    setGenerateError('')
    setFocusTouched(true)
    if (focus?.id) setFocusConceptId(focus.id)
    try {
      const conceptName = banks.map((bank) => bank.conceptName).join(', ')
      const focusConcept =
        concepts.find((item) => item.id === focus?.id) ||
        preferredFocusConcept ||
        null
      const draft = await generateLessonText({
        kind,
        conceptName,
        wordBanks: banks,
        student,
        concept: focusConcept,
        concepts,
        studentLists: lists,
        wordsByConceptId,
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
              bgcolor: 'action.hover',
              borderColor: 'divider',
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <AutoAwesomeIcon color="secondary" />
                <Typography variant="subtitle2">Ask Andrea</Typography>
                <HelpTip title="Andrea is our AI helper. She writes from the full catalog word bank for each selected concept, not from a saved 10-word list." />
              </Stack>
              <Stack direction="row" spacing={0.5} alignItems="flex-start">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {kind === 'passage'
                    ? 'Select concepts, then generate a passage from all of their word banks'
                    : 'Select concepts, then generate a sentence from all of their word banks'}
                </Typography>
                <HelpTip
                  title={
                    kind === 'passage'
                      ? 'Toggle every concept you want included. Andrea pulls the full word bank for each selected concept and weaves those words into one passage.'
                      : 'Toggle every concept you want included. Andrea pulls the full word bank for each selected concept and weaves those words into one sentence.'
                  }
                />
              </Stack>
              {conceptButtons.length ? (
                <Stack spacing={1}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.75,
                    }}
                  >
                    {conceptButtons.map((concept) => {
                      const wordCount = wordsFromConceptBank(wordsByConceptId, concept.id).length
                      const selected = selectedAndreaIds.has(concept.id)
                      const unavailable = wordCount === 0
                      return (
                        <Tooltip
                          key={concept.id}
                          title={
                            unavailable
                              ? `No catalog words for ${concept.concept} yet.`
                              : selected
                                ? `Selected. Click to remove ${concept.concept} from generation.`
                                : `Select ${concept.concept} to include its word bank.`
                          }
                        >
                          <span
                            style={{
                              display: 'flex',
                              flex: '1 1 140px',
                              maxWidth: '100%',
                            }}
                          >
                            <Button
                              size="small"
                              variant={selected ? 'contained' : 'outlined'}
                              color="primary"
                              disabled={saving || generating || loadingCatalog || unavailable}
                              onClick={() => {
                                setSelectedAndreaIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(concept.id)) next.delete(concept.id)
                                  else next.add(concept.id)
                                  return next
                                })
                              }}
                              sx={{
                                height: 'auto',
                                minHeight: 36,
                                py: 0.75,
                                px: 1.25,
                                lineHeight: 1.2,
                                whiteSpace: 'normal',
                                textAlign: 'center',
                                maxWidth: { xs: '100%', sm: 220 },
                                width: '100%',
                              }}
                            >
                              <Box component="span" sx={{ display: 'block', fontWeight: 700 }}>
                                {concept.concept}
                              </Box>
                              <Box
                                component="span"
                                sx={{
                                  display: 'block',
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  opacity: 0.85,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {concept.role}
                                {unavailable ? ' · no words' : ''}
                              </Box>
                            </Button>
                          </span>
                        </Tooltip>
                      )
                    })}
                  </Box>
                  <AskAndreaButton
                    size="small"
                    variant="contained"
                    loading={generating}
                    disabled={
                      saving
                      || generating
                      || loadingCatalog
                      || ![...selectedAndreaIds].some((id) =>
                        wordsFromConceptBank(wordsByConceptId, id).length,
                      )
                    }
                    tooltip={
                      kind === 'passage'
                        ? 'Write a passage using the word banks for every selected concept.'
                        : 'Write a sentence using the word banks for every selected concept.'
                    }
                    onClick={() => void handleGenerate()}
                  >
                    {kind === 'passage' ? 'Generate passage' : 'Generate sentence'}
                  </AskAndreaButton>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Choose a new concept and review concepts in the lesson, or mark concepts as New or
                  Review in Scope and Sequence, then come back to generate.
                </Typography>
              )}
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
          <Stack direction="row" spacing={0.5} alignItems="flex-start">
            <Autocomplete
              options={focusOptions}
              value={focusValue}
              onChange={(_event, next) => {
                setFocusTouched(true)
                setFocusConceptId(next?.id ?? null)
              }}
              getOptionLabel={(option) => option?.name || ''}
              isOptionEqualToValue={(option, selected) => option.id === selected.id}
              sx={{ flex: 1, minWidth: 0 }}
              renderInput={(params) => (
                <TextField {...params} label="Focus concept" size="small" required />
              )}
            />
            <Box sx={{ pt: 0.75 }}>
              <HelpTip
                title={
                  kind === 'passage'
                    ? 'The unifying concept for this passage. Lesson creation filters passages by this.'
                    : 'The unifying concept for this sentence. Lesson creation filters sentences by this.'
                }
              />
            </Box>
          </Stack>
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
