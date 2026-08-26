import { useState } from 'react'
import { Box, Tab, Tabs } from '@mui/material'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import ShortTextIcon from '@mui/icons-material/ShortText'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import CategoryIcon from '@mui/icons-material/Category'
import WordListsPanel from './WordListsPanel'
import MultiWordPanel from './MultiWordPanel'
import ConceptsCatalogPanel from './ConceptsCatalogPanel'

const CONTENT_TAB_LISTS = 0
const CONTENT_TAB_SENTENCES = 1
const CONTENT_TAB_PASSAGES = 2
const CONTENT_TAB_CONCEPTS = 3

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

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_event, value) => setSubTab(value)}
        variant="fullWidth"
        sx={{ mb: 2 }}
      >
        <Tab icon={<FormatListBulletedIcon />} iconPosition="start" label="Word lists" />
        <Tab icon={<ShortTextIcon />} iconPosition="start" label="Sentences" />
        <Tab icon={<MenuBookIcon />} iconPosition="start" label="Passages" />
        <Tab icon={<CategoryIcon />} iconPosition="start" label="Concepts" />
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
