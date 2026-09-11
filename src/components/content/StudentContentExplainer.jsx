/**
 * Right-hand details copy when a student has no lists/sentences/passages yet,
 * or when nothing is selected.
 */
import { Box, Chip, Stack, Typography } from '@mui/material'
import { studentDisplayName } from '../../lib/studentDisplay'

const COPY = {
  list: {
    title: (name) => `About ${name}’s word lists`,
    body: (name) => [
      `This page shows word lists saved for ${name} only — not lists from other students.`,
      'A list is a set of practice words tied to one concept. After you create one, it lives here and can be dropped into a lesson plan for this student.',
      'Use Create list to pick a concept from the catalog, choose words, and save them for this student.',
    ],
    emptyHint: (name) =>
      `${name} has no word lists yet. The grid stays hidden until the first list is saved so it is obvious this is empty for this student, not a missing catalog.`,
  },
  sentence: {
    title: (name) => `About ${name}’s sentences`,
    body: (name) => [
      `Sentences on this tab belong to ${name} only. Other students’ sentences do not appear here.`,
      'Each sentence is tagged to a focus concept so you can pull it into a lesson when that concept is new or in review.',
      'Create a sentence to start this student’s collection. Tagging and concept weight show up here once you select one.',
    ],
    emptyHint: (name) =>
      `No sentences are saved for ${name} yet. Create one to fill this student’s sentence bank.`,
  },
  passage: {
    title: (name) => `About ${name}’s passages`,
    body: (name) => [
      `Passages on this tab belong to ${name} only. This is not a shared library of every student’s reading text.`,
      'A passage is longer connected text with a focus concept. Save it here, then attach it to a lesson plan for this student.',
      'Create a passage to start this student’s collection. Preview, tagging, and concept weight appear here after you select one.',
    ],
    emptyHint: (name) =>
      `No passages are saved for ${name} yet. Create one to fill this student’s passage bank.`,
  },
  catalog: {
    title: () => 'Shared concept catalog',
    body: () => [
      'This is the shared word-concept catalog for your account, not one student’s lists.',
      'Select a concept to preview its labeled words. Renaming a concept updates the label everywhere it is used.',
    ],
    emptyHint: () => 'Select a concept on the left to preview its details and tagged words.',
  },
  catalogList: {
    title: () => 'Shared word lists',
    body: () => [
      'Lists on this tab belong to the shared catalog, not a specific student.',
      'A list is a set of practice words tied to one concept. After you create one, it can be used in any student’s lesson plan.',
      'Use Create list to pick a concept from the catalog, choose words, and save them here.',
    ],
    emptyHint: () =>
      'No shared lists yet. Create the first catalog list so it is available account-wide.',
  },
  catalogSentence: {
    title: () => 'Shared sentences',
    body: () => [
      'Sentences on this tab belong to the shared catalog, not a specific student.',
      'Each sentence is tagged to a focus concept so you can pull it into a lesson when that concept is new or in review.',
      'Create a sentence to start the catalog collection. Tagging and concept weight show up here once you select one.',
    ],
    emptyHint: () => 'No shared sentences yet. Create one to fill the catalog sentence bank.',
  },
  catalogPassage: {
    title: () => 'Shared passages',
    body: () => [
      'Passages on this tab belong to the shared catalog, not a specific student.',
      'A passage is longer connected text with a focus concept. Save it here, then attach it to any student’s lesson plan.',
      'Create a passage to start the catalog collection. Preview, tagging, and concept weight appear here after you select one.',
    ],
    emptyHint: () => 'No shared passages yet. Create one to fill the catalog passage bank.',
  },
  catalogWord: {
    title: () => 'Shared word catalog',
    body: () => [
      'This is the shared word catalog for your account. A book icon means a dictionary entry is already loaded.',
      'Select a word to preview its dictionary entry and tagged concepts on this side.',
    ],
    emptyHint: () => 'Select a word on the left to preview its dictionary entry and tagged concepts.',
  },
  catalogLesson: {
    title: () => 'Shared lesson plans',
    body: () => [
      'Lesson-plan templates on this tab belong to the shared catalog, not a specific student.',
      'Select a template to preview the printable lesson document. Apply a template from a student’s Lesson Plan tab.',
    ],
    emptyHint: () => 'Select a lesson plan on the left to preview its document.',
  },
}

export default function StudentContentExplainer({
  kind = 'list',
  student,
  empty = false,
  selectHint,
}) {
  const name = studentDisplayName(student)
  const copy = COPY[kind] ?? COPY.list
  const title = copy.title(name)
  const paragraphs = copy.body(name)
  const hint = selectHint || (empty ? copy.emptyHint(name) : null)

  return (
    <Box>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25 }} flexWrap="wrap" useFlexGap>
        {kind === 'catalog' || String(kind).startsWith('catalog') ? (
          <Chip size="small" variant="outlined" label="Shared catalog" />
        ) : (
          <Chip size="small" color="primary" label={`${name} only`} />
        )}
      </Stack>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1.25}>
        {paragraphs.map((text) => (
          <Typography key={text} variant="body2" color="text.secondary">
            {text}
          </Typography>
        ))}
        {hint ? (
          <Typography variant="body2" sx={{ pt: 0.5 }}>
            {hint}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  )
}
