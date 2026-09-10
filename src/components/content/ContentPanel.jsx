/**
 * Global Content page: shared Words and Concepts catalogs, independent of a student.
 */
import { useState } from 'react'
import { Box, Paper, Stack, Tab, Tabs, Typography } from '@mui/material'
import CategoryIcon from '@mui/icons-material/Category'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import HelpTip from '../shared/HelpTip'
import CatalogWordsPanel from './CatalogWordsPanel'
import ConceptsCatalogPanel from './ConceptsCatalogPanel'

const CONTENT_TAB_WORDS = 0
const CONTENT_TAB_CONCEPTS = 1

export default function ContentPanel({
  concepts = [],
  wordsByConceptId,
  catalogWords = [],
  loadingCatalog = false,
  onCatalogReload,
  setError,
  onConceptUpdated,
}) {
  const [subTab, setSubTab] = useState(CONTENT_TAB_WORDS)

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <MenuBookIcon color="action" />
        <Typography variant="h5">Content</Typography>
        <HelpTip title="The shared word and concept catalogs used by every student. Edits here apply account-wide." />
      </Stack>
      <Paper variant="outlined" sx={{ px: 1.5, pt: 0.5, mb: 2 }}>
        <Tabs value={subTab} onChange={(_event, value) => setSubTab(value)}>
          <Tab icon={<MenuBookIcon />} iconPosition="start" label="Words" />
          <Tab icon={<CategoryIcon />} iconPosition="start" label="Concepts" />
        </Tabs>
      </Paper>
      {subTab === CONTENT_TAB_CONCEPTS ? (
        <ConceptsCatalogPanel
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          loadingCatalog={loadingCatalog}
          setError={setError}
          onConceptUpdated={onConceptUpdated}
          onCatalogReload={onCatalogReload}
        />
      ) : (
        <CatalogWordsPanel
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          catalogWords={catalogWords}
          loadingCatalog={loadingCatalog}
          onCatalogReload={onCatalogReload}
          setError={setError}
        />
      )}
    </Box>
  )
}
