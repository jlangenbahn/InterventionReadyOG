/**
 * Student Content tab: this student's word lists, sentences, and passages,
 * plus the shared concept catalog.
 */
import { useState } from 'react'
import { Box, Chip, Paper, Stack, Tab, Tabs, Typography } from '@mui/material'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import ShortTextIcon from '@mui/icons-material/ShortText'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import CategoryIcon from '@mui/icons-material/Category'
import WordListsPanel from './WordListsPanel'
import MultiWordPanel from './MultiWordPanel'
import ConceptsCatalogPanel from './ConceptsCatalogPanel'
import { studentDisplayName } from '../../lib/studentDisplay'

const CONTENT_TAB_LISTS = 0
const CONTENT_TAB_SENTENCES = 1
const CONTENT_TAB_PASSAGES = 2
const CONTENT_TAB_CONCEPTS = 3

const TAB_COPY = {
  [CONTENT_TAB_LISTS]: {
    kind: 'lists',
    title: 'Word lists',
    body: (name) =>
      `Word lists saved for ${name} only. Other students’ lists are not shown.`,
  },
  [CONTENT_TAB_SENTENCES]: {
    kind: 'sentences',
    title: 'Sentences',
    body: (name) =>
      `Sentences saved for ${name} only. This is not a shared sentence bank.`,
  },
  [CONTENT_TAB_PASSAGES]: {
    kind: 'passages',
    title: 'Passages',
    body: (name) =>
      `Passages saved for ${name} only. Other students’ passages stay on their pages.`,
  },
  [CONTENT_TAB_CONCEPTS]: {
    kind: 'catalog',
    title: 'Shared catalog',
    body: () =>
      'The word-concept catalog is shared across students. Lists, sentences, and passages on the other tabs belong to the selected student only.',
  },
}

export default function ContentPanel({
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  studentLists = [],
  loadingLists = false,
  onReloadLists,
  setError,
  onConceptUpdated,
}) {
  const [subTab, setSubTab] = useState(CONTENT_TAB_LISTS)
  const name = studentDisplayName(student)
  const copy = TAB_COPY[subTab]
  const studentScoped = subTab !== CONTENT_TAB_CONCEPTS

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {studentScoped ? (
            <Chip size="small" color="primary" label={`${name} only`} />
          ) : (
            <Chip size="small" variant="outlined" label="Shared catalog" />
          )}
          <Typography variant="subtitle1">{copy.title}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {copy.body(name)}
        </Typography>
      </Paper>
      <Tabs
        value={subTab}
        onChange={(_event, value) => setSubTab(value)}
        variant="fullWidth"
        sx={{ mb: 2 }}
      >
        <Tab icon={<FormatListBulletedIcon />} iconPosition="start" label="Lists" />
        <Tab icon={<ShortTextIcon />} iconPosition="start" label="Sentences" />
        <Tab icon={<MenuBookIcon />} iconPosition="start" label="Passages" />
        <Tab icon={<CategoryIcon />} iconPosition="start" label="Shared" />
      </Tabs>
      {subTab === CONTENT_TAB_SENTENCES ? (
        <MultiWordPanel
          student={student}
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          studentLists={studentLists}
          setError={setError}
          forcedKind="sentence"
        />
      ) : subTab === CONTENT_TAB_PASSAGES ? (
        <MultiWordPanel
          student={student}
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          studentLists={studentLists}
          setError={setError}
          forcedKind="passage"
        />
      ) : subTab === CONTENT_TAB_CONCEPTS ? (
        <ConceptsCatalogPanel
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          setError={setError}
          onConceptUpdated={onConceptUpdated}
        />
      ) : (
        <WordListsPanel
          student={student}
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          studentLists={studentLists}
          loadingLists={loadingLists}
          onReloadLists={onReloadLists}
          setError={setError}
        />
      )}
    </Box>
  )
}
