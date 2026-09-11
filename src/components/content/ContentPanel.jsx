/**
 * Shared catalog: Words, Concepts, Lists, Sentences, Passages, and Lesson Plans.
 * Data operations (audit, spell check, dictionary) sit in a togglable banner.
 */
import { useState } from 'react'
import {
  Box,
  Collapse,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import ArticleIcon from '@mui/icons-material/Article'
import AssignmentIcon from '@mui/icons-material/Assignment'
import CategoryIcon from '@mui/icons-material/Category'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ShortTextIcon from '@mui/icons-material/ShortText'
import HelpTip from '../shared/HelpTip'
import CatalogWordsPanel from './CatalogWordsPanel'
import ConceptsCatalogPanel from './ConceptsCatalogPanel'
import WordListsPanel from './WordListsPanel'
import MultiWordPanel from './MultiWordPanel'
import LessonTemplateGallery from '../lesson-plan/LessonTemplateGallery'
import DataQualityPanel from '../data/DataQualityPanel'

const CONTENT_TAB_WORDS = 0
const CONTENT_TAB_CONCEPTS = 1
const CONTENT_TAB_LISTS = 2
const CONTENT_TAB_SENTENCES = 3
const CONTENT_TAB_PASSAGES = 4
const CONTENT_TAB_LESSON_PLANS = 5

export default function ContentPanel({
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  loadingCatalog = false,
  onCatalogReload,
  setError,
  onConceptUpdated,
  username,
}) {
  const [subTab, setSubTab] = useState(CONTENT_TAB_WORDS)
  const [dataOpsOpen, setDataOpsOpen] = useState(false)

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 2 }}
        flexWrap="wrap"
        useFlexGap
      >
        <MenuBookIcon color="action" />
        <Typography variant="h5">Content</Typography>
        <HelpTip title="The shared word, concept, list, sentence, passage, and lesson-plan catalogs used by every student. Edits here apply account-wide. Open Data Operations to audit tags, spell-check words, or write dictionary definitions." />
        <Box sx={{ flexGrow: 1 }} />
        <FormControlLabel
          control={
            <Switch
              checked={dataOpsOpen}
              onChange={(_event, checked) => setDataOpsOpen(checked)}
              color="primary"
            />
          }
          label="Data Operations"
        />
      </Stack>

      <Collapse in={dataOpsOpen} timeout="auto" unmountOnExit>
        <DataQualityPanel
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          catalogWords={catalogWords}
          onCatalogReload={onCatalogReload}
          setError={setError}
        />
      </Collapse>

      <Paper variant="outlined" sx={{ px: 1.5, pt: 0.5, mb: 2 }}>
        <Tabs
          value={subTab}
          onChange={(_event, value) => setSubTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab icon={<MenuBookIcon />} iconPosition="start" label="Words" />
          <Tab icon={<CategoryIcon />} iconPosition="start" label="Concepts" />
          <Tab icon={<FormatListBulletedIcon />} iconPosition="start" label="Lists" />
          <Tab icon={<ShortTextIcon />} iconPosition="start" label="Sentences" />
          <Tab icon={<ArticleIcon />} iconPosition="start" label="Passages" />
          <Tab icon={<AssignmentIcon />} iconPosition="start" label="Lesson Plans" />
        </Tabs>
      </Paper>

      {subTab === CONTENT_TAB_WORDS ? (
        <CatalogWordsPanel
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          catalogWords={catalogWords}
          loadingCatalog={loadingCatalog}
          onCatalogReload={onCatalogReload}
          setError={setError}
        />
      ) : null}
      {subTab === CONTENT_TAB_CONCEPTS ? (
        <ConceptsCatalogPanel
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          setError={setError}
          onConceptUpdated={onConceptUpdated}
          onCatalogReload={onCatalogReload}
        />
      ) : null}
      {subTab === CONTENT_TAB_LISTS ? (
        <WordListsPanel
          catalogMode
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          onCatalogReload={onCatalogReload}
          setError={setError}
        />
      ) : null}
      {subTab === CONTENT_TAB_SENTENCES ? (
        <MultiWordPanel
          catalogMode
          forcedKind="sentence"
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          setError={setError}
        />
      ) : null}
      {subTab === CONTENT_TAB_PASSAGES ? (
        <MultiWordPanel
          catalogMode
          forcedKind="passage"
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          setError={setError}
        />
      ) : null}
      {subTab === CONTENT_TAB_LESSON_PLANS ? (
        <Paper sx={{ p: 2 }}>
          <LessonTemplateGallery
            catalogMode
            concepts={concepts}
            username={username}
            setError={setError}
          />
        </Paper>
      ) : null}
    </Box>
  )
}
