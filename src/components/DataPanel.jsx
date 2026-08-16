import { useMemo } from 'react'
import {
  Box,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ReportingPanel from './ReportingPanel'

export default function DataPanel({
  student,
  concepts = [],
  wordsByConceptId,
  setError,
}) {
  const subtitle = useMemo(
    () => 'Word encounters and concept mastery for this student.',
    [],
  )

  return (
    <Box>
      <Tabs
        value={0}
        variant="fullWidth"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<AssessmentIcon />} iconPosition="start" label="Reporting" />
      </Tabs>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {subtitle}
      </Typography>
      <ReportingPanel
        student={student}
        concepts={concepts}
        wordsByConceptId={wordsByConceptId}
        setError={setError}
      />
    </Box>
  )
}
