import { useState } from 'react'
import { Box, Tab, Tabs } from '@mui/material'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import NotesIcon from '@mui/icons-material/Notes'
import WordListsPanel from './WordListsPanel'
import MultiWordPanel from './MultiWordPanel'

const CONTENT_TAB_LISTS = 0
const CONTENT_TAB_MULTI = 1

export default function ContentPanel({
  student,
  concepts = [],
  wordsByConceptId,
  loadingCatalog = false,
  studentLists = [],
  loadingLists = false,
  onReloadLists,
  setError,
}) {
  const [subTab, setSubTab] = useState(CONTENT_TAB_LISTS)

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_event, value) => setSubTab(value)}
        variant="fullWidth"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<FormatListBulletedIcon />} iconPosition="start" label="Word lists" />
        <Tab icon={<NotesIcon />} iconPosition="start" label="Sentences / Passages" />
      </Tabs>
      {subTab === CONTENT_TAB_MULTI ? (
        <MultiWordPanel
          student={student}
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          setError={setError}
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
