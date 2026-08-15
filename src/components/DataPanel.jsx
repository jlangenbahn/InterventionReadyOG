import { useMemo, useState } from 'react'
import {
  Box,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import AssignmentIcon from '@mui/icons-material/Assignment'
import AssessmentIcon from '@mui/icons-material/Assessment'
import DataEntryPanel from './DataEntryPanel'
import ReportingPanel from './ReportingPanel'

const DATA_TAB_ENTRY = 0
const DATA_TAB_REPORTING = 1

export default function DataPanel({
  student,
  concepts = [],
  wordsByConceptId,
  setError,
}) {
  const [subTab, setSubTab] = useState(DATA_TAB_ENTRY)

  const subtitle = useMemo(
    () =>
      subTab === DATA_TAB_REPORTING
        ? 'Word encounters and concept mastery for this student.'
        : 'Score words from a saved lesson plan.',
    [subTab],
  )

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_event, value) => setSubTab(value)}
        variant="fullWidth"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<AssignmentIcon />} iconPosition="start" label="Data Entry" />
        <Tab icon={<AssessmentIcon />} iconPosition="start" label="Reporting" />
      </Tabs>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {subtitle}
      </Typography>
      {subTab === DATA_TAB_REPORTING ? (
        <ReportingPanel
          student={student}
          concepts={concepts}
          wordsByConceptId={wordsByConceptId}
          setError={setError}
        />
      ) : (
        <DataEntryPanel student={student} setError={setError} />
      )}
    </Box>
  )
}
