/**
 * Preview and download this week’s lesson plans as PDF, Word, or Google Docs.
 */
import { Fragment, useMemo, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DescriptionIcon from '@mui/icons-material/Description'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import ArticleIcon from '@mui/icons-material/Article'
import LessonPlanTemplate from '../lesson-plan/LessonPlanTemplate'
import { studentDisplayName } from '../../lib/fetchStudentLessonPlan'
import { sanitizeFileStem } from '../../lib/exportTable'
import {
  formatLessonPlanDate,
  lessonPlanTemplateProps,
  LESSON_PLAN_PRINT_PAGE_STYLE,
} from '../../lib/lessonPlanPrint'
import {
  downloadWeekLessonPlansDocx,
  downloadWeekLessonPlansForGoogleDocs,
} from '../../lib/lessonPlanOffice'
import { formatTimeRange, parseScheduleDate } from '../../lib/schedule'

function formatEntryWhen(start, end) {
  const from = parseScheduleDate(start)
  if (!from) return formatTimeRange(start, end)
  const day = from.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  const range = formatTimeRange(start, end)
  return range ? `${day} · ${range}` : day
}

export default function WeekLessonPlansPreview({
  weekLabel,
  entries = [],
  loading = false,
  instructor = '',
  onClose,
}) {
  const printRef = useRef(null)
  const printableEntries = useMemo(
    () => (entries ?? []).filter((entry) => entry?.lesson?.id),
    [entries],
  )
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: sanitizeFileStem(`Lesson Plans – ${weekLabel || 'Week'}`),
    pageStyle: LESSON_PLAN_PRINT_PAGE_STYLE,
  })

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Stack spacing={1} sx={{ p: 2, pb: 1.5, flexShrink: 0 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6">This week’s lesson plans</Typography>
            <Typography variant="body2" color="text.secondary">
              {weekLabel}
            </Typography>
          </Box>
          <Tooltip title="Hide preview">
            <IconButton size="small" aria-label="Hide week preview" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Plans are listed in calendar order. Group lessons include each student’s plan.
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            startIcon={<PictureAsPdfIcon />}
            onClick={handlePrint}
            disabled={loading || !printableEntries.length}
          >
            Download as PDF
          </Button>
          <Tooltip title="Download an editable Word document">
            <span>
              <Button
                variant="outlined"
                startIcon={<DescriptionIcon />}
                onClick={() =>
                  downloadWeekLessonPlansDocx({
                    weekLabel,
                    entries: printableEntries,
                    instructor,
                  })
                }
                disabled={loading || !printableEntries.length}
              >
                Microsoft Word
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Download a Word file, then upload it in Google Docs (File → Open)">
            <span>
              <Button
                variant="outlined"
                startIcon={<ArticleIcon />}
                onClick={() =>
                  downloadWeekLessonPlansForGoogleDocs({
                    weekLabel,
                    entries: printableEntries,
                    instructor,
                  })
                }
                disabled={loading || !printableEntries.length}
              >
                Google Docs
              </Button>
            </span>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Word and Google Docs download an editable .docx. In Google Docs, choose File → Open → Upload.
        </Typography>
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, bgcolor: 'background.default' }}>
        {loading ? (
          <Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ minHeight: 280, py: 6 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Loading this week’s lesson plans…
            </Typography>
          </Stack>
        ) : !entries.length ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No scheduled lessons this week. Add calendar items, then preview them here.
            </Typography>
          </Paper>
        ) : (
          <Box ref={printRef} className="week-lesson-plans-print">
            {entries.map((entry) => {
              const name = studentDisplayName(entry.student)
              const when = formatEntryWhen(entry.startAt, entry.endAt)
              if (!entry.lesson) {
                return (
                  <Paper key={entry.key} variant="outlined" sx={{ p: 1.5, mb: 2 }} className="lesson-plan-screen-only">
                    <Typography variant="subtitle2">{name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {when}
                      {entry.groupName ? ` · ${entry.groupName}` : ''}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      No lesson plan is linked to this calendar item.
                    </Typography>
                  </Paper>
                )
              }
              const props = lessonPlanTemplateProps(entry.lesson, entry.student, {
                instructor,
                date: formatLessonPlanDate(parseScheduleDate(entry.startAt) || entry.lesson.date),
              })
              return (
                <Fragment key={entry.key}>
                  <Typography
                    className="lesson-plan-screen-only"
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      mb: 1,
                    }}
                  >
                    {name}
                    {when ? ` · ${when}` : ''}
                    {entry.groupName ? ` · ${entry.groupName}` : ''}
                    {props.lessonName ? ` · ${props.lessonName}` : ''}
                  </Typography>
                  <LessonPlanTemplate {...props} />
                </Fragment>
              )
            })}
          </Box>
        )}
      </Box>
    </Box>
  )
}
