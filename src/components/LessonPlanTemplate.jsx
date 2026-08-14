import { forwardRef } from 'react'
import { Box, Paper, Typography } from '@mui/material'

const WHAT_SPELLS = ['/a/ cat', '/e/ pet', '/i/ itch', '/o/ octopus', '/u/ up', '/ck/ luck', '/sk/ mask', '/ft/ gift']
const SIMULTANEOUS_ORAL = ['task', 'shaft', 'pluck']

const EXHIBIT_COLUMNS = [
  { key: 'review1', fallback: 'Review concept #1' },
  { key: 'review2', fallback: 'Review concept #2' },
  { key: 'review3', fallback: 'Review concept #3' },
  { key: 'newConcept', fallback: 'The new concept list' },
]

const paperSx = {
  bgcolor: '#ffffff',
  width: '100%',
  maxWidth: '800px',
  mx: 'auto',
  p: '20px',
  borderRadius: '4px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  color: 'rgba(0,0,0,0.87)',
  fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  fontSize: '11px',
  lineHeight: 1.3,
  '@media print': {
    boxShadow: 'none',
    p: 0,
    maxWidth: '100%',
    borderRadius: 0,
    bgcolor: 'transparent',
  },
}

const sectionSx = { mb: '12px', '@media print': { breakInside: 'avoid' } }

const sectionHeaderSx = {
  color: 'primary.main',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  borderBottom: '1px solid #e0e0e0',
  pb: '2px',
  mb: '6px',
}

const rowSx = {
  display: 'flex',
  alignItems: 'flex-start',
  mb: '6px',
}

const labelSx = {
  fontWeight: 600,
  color: 'rgba(0,0,0,0.7)',
  width: 110,
  flexShrink: 0,
  fontSize: '11px',
}

const contentSx = { flexGrow: 1, lineHeight: 1.3, fontSize: '11px' }

const chipSx = {
  display: 'inline-block',
  bgcolor: '#f0f0f0',
  px: '6px',
  py: '2px',
  borderRadius: '4px',
  mr: '4px',
  mb: '4px',
  fontSize: '10px',
  border: '1px solid #ccc',
  '@media print': {
    border: '1px solid #e0e0e0',
    bgcolor: 'transparent',
  },
}

const exhibitTableSx = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
}

const exhibitHeaderSx = {
  width: '25%',
  verticalAlign: 'bottom',
  pr: '10px',
  pb: '6px',
  fontWeight: 700,
  fontSize: '11px',
  borderBottom: '1px solid #e0e0e0',
}

const exhibitCellSx = {
  width: '25%',
  verticalAlign: 'top',
  pr: '10px',
  py: 0,
  lineHeight: 2,
  fontSize: '14px',
}

function Placeholder({ tag, value }) {
  if (value) {
    return (
      <Box component="span" sx={{ color: 'inherit', fontFamily: 'inherit', fontWeight: 400 }}>
        {value}
      </Box>
    )
  }
  return (
    <Box
      component="span"
      sx={{
        color: '#d32f2f',
        fontFamily: '"Courier New", Courier, monospace',
        fontWeight: 700,
      }}
    >
      {tag}
    </Box>
  )
}

function listWordLabels(list) {
  if (!list) return []
  const words = Array.isArray(list.words) ? list.words : []
  const labels = words
    .map((word) => {
      if (typeof word === 'string') return word
      if (typeof word?.word === 'string') return word.word
      return word?.word?.word
    })
    .filter(Boolean)
  return labels
}

function listDisplayName(list, fallback) {
  if (list?.name) return list.name
  return fallback
}

function sentenceText(sentence) {
  if (!sentence) return ''
  if (typeof sentence === 'string') return sentence
  return sentence.text || ''
}

function passageText(passage) {
  if (!passage) return ''
  if (typeof passage === 'string') return passage
  const title = passage.title ? `${passage.title}: ` : ''
  return `${title}${passage.text || ''}`.trim()
}

function StudentExhibit({ reviewLists, newConceptList }) {
  const lists = [
    reviewLists[0],
    reviewLists[1],
    reviewLists[2],
    newConceptList,
  ]
  const columns = lists.map((list) => listWordLabels(list))
  const rowCount = Math.max(1, ...columns.map((words) => words.length))

  return (
    <Box component="table" sx={exhibitTableSx}>
      <Box component="thead">
        <Box component="tr">
          {EXHIBIT_COLUMNS.map((column, index) => (
            <Box component="th" key={column.key} sx={exhibitHeaderSx}>
              {listDisplayName(lists[index], column.fallback)}
            </Box>
          ))}
        </Box>
      </Box>
      <Box component="tbody">
        {Array.from({ length: rowCount }, (_, row) => (
          <Box component="tr" key={row}>
            {columns.map((words, col) => (
              <Box component="td" key={col} sx={exhibitCellSx}>
                {words[row] || '\u00a0'}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/**
 * Printable lesson-plan layout: cover sheet (page 1) plus student word-list exhibit (page 2).
 */
const LessonPlanTemplate = forwardRef(function LessonPlanTemplate(
  {
    student,
    reviewLists = [null, null, null],
    newConceptList = null,
    sentences = [null, null],
    passage = null,
    date,
    lessonNumber,
    instructor,
    soapNotes,
    reflectionNotes,
  },
  ref,
) {
  const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ')
  const paddedReview = [0, 1, 2].map((index) => reviewLists[index] ?? null)

  return (
    <Box ref={ref} className="lesson-plan-print-root">
      <Paper elevation={0} className="lesson-plan-page" sx={{ ...paperSx, mb: 2, '@media print': { ...paperSx['@media print'], mb: 0 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            pb: '8px',
            borderBottom: '2px solid rgba(0,0,0,0.87)',
            mb: '12px',
            fontWeight: 700,
            fontSize: '11px',
          }}
        >
          <Box>
            Student: <Placeholder tag="<<STUDENT>>" value={studentName} />
          </Box>
          <Box>
            Date: <Placeholder tag="<<DATE>>" value={date} />
          </Box>
          <Box>
            Lesson #: <Placeholder tag="<<LESSON>>" value={lessonNumber} />
          </Box>
          <Box>
            Instructor: <Placeholder tag="<<INSTRUCTOR>>" value={instructor} />
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography component="div" sx={sectionHeaderSx}>
            Decoding
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Box sx={rowSx}>
              <Box sx={labelSx}>SOAP Notes</Box>
              <Box sx={contentSx}>{soapNotes || '[SOAP Notes Field]'}</Box>
            </Box>
            <Box sx={rowSx}>
              <Box sx={labelSx}>Drills</Box>
              <Box sx={contentSx}>
                Phonemic Awareness, Phonogram Card Drill
                <br />
                Blending Drill
                <br />
                Non-Phonetic Morpheme Drill
              </Box>
            </Box>
          </Box>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Review Words</Box>
            <Box sx={contentSx}>
              {[0, 1, 2].map((index) => (
                <Box key={index}>
                  {index + 1}.{' '}
                  <Placeholder
                    tag={`Review concept #${index + 1}`}
                    value={paddedReview[index]?.name || ''}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography component="div" sx={sectionHeaderSx}>
            Guided Discovery
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Box sx={rowSx}>
              <Box sx={labelSx}>New Concept</Box>
              <Box sx={contentSx}>
                <Placeholder tag="The new concept list" value={newConceptList?.name || ''} />
              </Box>
            </Box>
            <Box sx={rowSx}>
              <Box sx={labelSx}>Methods</Box>
              <Box sx={contentSx}>VATK, Coding of New Concept, Handwriting</Box>
            </Box>
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography component="div" sx={sectionHeaderSx}>
            Encoding
          </Typography>
          <Box sx={rowSx}>
            <Box sx={labelSx}>What Spells?</Box>
            <Box sx={contentSx}>
              {WHAT_SPELLS.map((item) => (
                <Box key={item} component="span" sx={chipSx}>
                  {item}
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Simultaneous Oral</Box>
            <Box sx={contentSx}>
              {SIMULTANEOUS_ORAL.map((item) => (
                <Box key={item} component="span" sx={chipSx}>
                  {item}
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Dictation</Box>
            <Box sx={contentSx}>
              1. <Placeholder tag="Sentence #1" value={sentenceText(sentences[0])} />
              <br />
              2. <Placeholder tag="Sentence #2" value={sentenceText(sentences[1])} />
            </Box>
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography component="div" sx={sectionHeaderSx}>
            Oral Reading
          </Typography>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Passage</Box>
            <Box sx={contentSx}>
              <Placeholder tag="Passage #1" value={passageText(passage)} />
            </Box>
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography component="div" sx={sectionHeaderSx}>
            Reflection
          </Typography>
          <Box sx={rowSx}>
            <Box sx={labelSx}>SOAP Notes</Box>
            <Box sx={contentSx}>{reflectionNotes || '[Final SOAP Notes Field] | '}</Box>
          </Box>
        </Box>
      </Paper>

      <Paper
        elevation={0}
        className="lesson-plan-page lesson-plan-page-2"
        sx={{
          ...paperSx,
          '@media print': {
            ...paperSx['@media print'],
            breakBefore: 'page',
            pageBreakBefore: 'always',
          },
        }}
      >
        <Typography
          className="lesson-plan-screen-only"
          component="div"
          sx={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(0,0,0,0.54)',
            mb: '10px',
            '@media print': { display: 'none' },
          }}
        >
          Page 2 · Student exhibit
        </Typography>
        <StudentExhibit reviewLists={paddedReview} newConceptList={newConceptList} />
      </Paper>
    </Box>
  )
})

LessonPlanTemplate.displayName = 'LessonPlanTemplate'

export default LessonPlanTemplate
