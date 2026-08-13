import { forwardRef } from 'react'
import { Box, Paper, Typography } from '@mui/material'

const WHAT_SPELLS = ['/a/ cat', '/e/ pet', '/i/ itch', '/o/ octopus', '/u/ up', '/ck/ luck', '/sk/ mask', '/ft/ gift']
const SIMULTANEOUS_ORAL = ['task', 'shaft', 'pluck']

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

function formatListWords(list) {
  if (!list) return ''
  if (typeof list === 'string') return list
  const words = Array.isArray(list.words) ? list.words : []
  const labels = words
    .map((word) => {
      if (typeof word === 'string') return word
      if (typeof word?.word === 'string') return word.word
      return word?.word?.word
    })
    .filter(Boolean)
  if (labels.length) return labels.join(', ')
  return list.name ? `(${list.name})` : ''
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

/**
 * Printable lesson-plan layout. Maps relational props onto the original HTML placeholders:
 *   <<STUDENT>>                student first + last name
 *   <<REVIEW_LIST_WORDS_1..3>> lists (review slots, or lists[0..2])
 *   <<NEW_CONCEPT_LIST_WORDS>> lists marked kind === 'new' (or lists[3])
 *   <<SENTENCE_1>> / _2        sentences[0], sentences[1]
 *   <<PASSAGE_1>>              passages[0]
 */
const LessonPlanTemplate = forwardRef(function LessonPlanTemplate(
  {
    student,
    lists = [],
    sentences = [],
    passages = [],
    date,
    lessonNumber,
    instructor,
    soapNotes,
    reflectionNotes,
  },
  ref,
) {
  const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ')

  const reviewLists = lists.filter((list) => list?.kind !== 'new').slice(0, 3)
  const newConceptList = lists.find((list) => list?.kind === 'new') ?? lists[3] ?? null

  const reviewWords = [0, 1, 2].map((index) => formatListWords(reviewLists[index]))

  return (
    <Paper ref={ref} elevation={0} className="lesson-plan-print-root" sx={paperSx}>
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
            <Placeholder tag="<<REVIEW_LIST_WORDS_1>>" value={reviewWords[0]} />
            {', '}
            <Placeholder tag="<<REVIEW_LIST_WORDS_2>>" value={reviewWords[1]} />
            {', '}
            <Placeholder tag="<<REVIEW_LIST_WORDS_3>>" value={reviewWords[2]} />
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
            <Box sx={contentSx}>{newConceptList?.name || '[New Concept Field]'}</Box>
          </Box>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Methods</Box>
            <Box sx={contentSx}>VATK, Coding of New Concept, Handwriting</Box>
          </Box>
        </Box>
        <Box sx={rowSx}>
          <Box sx={labelSx}>Auditory Visual</Box>
          <Box sx={contentSx}>
            <Placeholder tag="<<NEW_CONCEPT_LIST_WORDS>>" value={formatListWords(newConceptList)} />
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
            1. <Placeholder tag="<<SENTENCE_1>>" value={sentenceText(sentences[0])} />
            <br />
            2. <Placeholder tag="<<SENTENCE_2>>" value={sentenceText(sentences[1])} />
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
            <Placeholder tag="<<PASSAGE_1>>" value={passageText(passages[0])} />
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
  )
})

LessonPlanTemplate.displayName = 'LessonPlanTemplate'

export default LessonPlanTemplate
