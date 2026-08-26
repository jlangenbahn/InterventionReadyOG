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
      'This tab is the shared word-concept catalog for your account, not one student’s lists.',
      'Lists, sentences, and passages you create on the other tabs are saved to the selected student only.',
      'Select a concept to preview its labeled words. Renaming a concept updates the label everywhere it is used.',
    ],
    emptyHint: () => 'Select a concept on the left to preview its details and tagged words.',
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
        {kind === 'catalog' ? (
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
