import { forwardRef } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { sanitizeLessonBody } from '../lib/sanitizeLessonText'

const WHAT_SPELLS = ['/a/ cat', '/e/ pet', '/i/ itch', '/o/ octopus', '/u/ up', '/ck/ luck', '/sk/ mask', '/ft/ gift']
const SIMULTANEOUS_ORAL = ['task', 'shaft', 'pluck']

const READER_FONT_FAMILY = '"Century Gothic", "Comic Sans MS", Andika, sans-serif'

const readerPaperSx = {
  bgcolor: '#ffffff',
  width: '100%',
  maxWidth: '800px',
  mx: 'auto',
  p: '20px',
  borderRadius: '4px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  color: '#333333',
  fontFamily: READER_FONT_FAMILY,
  fontSize: '24px',
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 1.6,
  letterSpacing: '0.04em',
  textAlign: 'left',
  textTransform: 'none',
  textDecoration: 'none',
  '@media print': {
    boxShadow: 'none',
    p: 0,
    maxWidth: '100%',
    borderRadius: 0,
    bgcolor: '#ffffff',
    color: '#333333',
  },
}

const readerTypeSx = {
  fontFamily: 'inherit',
  fontSize: '24px',
  fontWeight: 400,
  fontStyle: 'normal',
  lineHeight: 1.6,
  letterSpacing: '0.04em',
  textAlign: 'left',
  textTransform: 'none',
  textDecoration: 'none',
  color: '#333333',
}

const readerBodySx = {
  ...readerTypeSx,
  maxWidth: '60ch',
}

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

function sentenceText(sentence) {
  if (!sentence) return ''
  if (typeof sentence === 'string') return sentence
  return sentence.text || ''
}

function passageBody(passage) {
  if (!passage) return ''
  const raw = typeof passage === 'string' ? passage : String(passage.text || '')
  const title = typeof passage === 'string' ? '' : passage.title || ''
  const conceptName = typeof passage === 'string' ? '' : passage.concept || ''
  return sanitizeLessonBody(raw, { title, conceptName })
}

function passageText(passage) {
  if (!passage) return ''
  if (typeof passage === 'string') return sanitizeLessonBody(passage)
  const body = passageBody(passage)
  const title = String(passage.title || '').trim()
  if (title && body) return `${title}\n${body}`
  return title || body
}

function ReaderWordList({ list }) {
  const words = listWordLabels(list)
  return (
    <Box sx={readerTypeSx}>
      {words.length
        ? words.map((word, index) => (
            <Box key={index} component="div">
              {word}
            </Box>
          ))
        : '\u00a0'}
    </Box>
  )
}

function ReaderWordColumns({ lists = [] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(lists.length, 1)}, minmax(0, 1fr))`,
        columnGap: '32px',
        alignItems: 'start',
      }}
    >
      {lists.map((list, index) => (
        <ReaderWordList key={index} list={list} />
      ))}
    </Box>
  )
}

function ReaderPassages({ passages = [] }) {
  const texts = (passages ?? []).map(passageBody).filter(Boolean)
  return (
    <Box sx={readerBodySx}>
      {texts.length
        ? texts.map((text, index) => (
            <Box
              key={index}
              component="p"
              sx={{
                m: 0,
                mb: index < texts.length - 1 ? '1.6em' : 0,
                fontFamily: 'inherit',
                fontWeight: 400,
                fontStyle: 'normal',
                textAlign: 'left',
                textTransform: 'none',
                textDecoration: 'none',
                whiteSpace: 'pre-wrap',
              }}
            >
              {text}
            </Box>
          ))
        : '\u00a0'}
    </Box>
  )
}

function ExhibitPage({ pageNumber, label, reader = false, children }) {
  const pageSx = reader ? readerPaperSx : paperSx
  return (
    <Paper
      elevation={0}
      className={`lesson-plan-page lesson-plan-page-${pageNumber}${reader ? ' lesson-plan-reader-page' : ''}`}
      sx={{
        ...pageSx,
        mb: 2,
        '@media print': {
          ...pageSx['@media print'],
          mb: 0,
          breakBefore: 'page',
          pageBreakBefore: 'always',
        },
      }}
    >
      <Typography
        className="lesson-plan-screen-only"
        component="div"
        sx={
          reader
            ? {
                fontFamily: READER_FONT_FAMILY,
                fontSize: '14px',
                fontWeight: 400,
                fontStyle: 'normal',
                letterSpacing: '0.02em',
                textTransform: 'none',
                textDecoration: 'none',
                color: '#333333',
                mb: '16px',
                '@media print': { display: 'none' },
              }
            : {
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'rgba(0,0,0,0.54)',
                mb: '10px',
                '@media print': { display: 'none' },
              }
        }
      >
        Page {pageNumber} · {label}
      </Typography>
      {children}
    </Paper>
  )
}

/**
 * Printable lesson-plan layout: cover sheet (page 1) plus child-facing pages
 * for review lists (page 2), the new concept list (page 3), and the passage (page 4).
 */
const LessonPlanTemplate = forwardRef(function LessonPlanTemplate(
  {
    student,
    reviewLists = [null, null, null],
    newConceptList = null,
    sentences = [null, null, null, null, null, null],
    passages = [null, null],
    passage = null,
    date,
    lessonNumber,
    lessonName,
    instructor,
    soapNotes,
    reflectionNotes,
  },
  ref,
) {
  const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ')
  const paddedReview = [0, 1, 2].map((index) => reviewLists[index] ?? null)
  const paddedPassages = [0, 1].map((index) => passages[index] ?? (index === 0 ? passage : null) ?? null)
  const filledSentences = (sentences ?? []).filter((item) => Boolean(sentenceText(item)))
  const filledPassages = paddedPassages.filter((item) => Boolean(passageText(item)))

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
          {lessonName ? (
            <Box sx={{ gridColumn: '1 / -1' }}>
              Name: <Placeholder tag="<<NAME>>" value={lessonName} />
            </Box>
          ) : null}
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
              {filledSentences.map((sentence, index) => (
                <Box key={index}>
                  {index + 1}. {sentenceText(sentence)}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box sx={sectionSx}>
          <Typography component="div" sx={sectionHeaderSx}>
            Oral Reading
          </Typography>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Passage</Box>
            <Box sx={{ ...contentSx, whiteSpace: 'pre-wrap' }}>
              {filledPassages.map((item, index) => (
                <Box key={index} sx={{ mb: index < filledPassages.length - 1 ? '8px' : 0 }}>
                  {index + 1}. {passageText(item)}
                </Box>
              ))}
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

      <ExhibitPage pageNumber={2} label="Review concepts" reader>
        <ReaderWordColumns lists={paddedReview} />
      </ExhibitPage>

      <ExhibitPage pageNumber={3} label="New concept" reader>
        <ReaderWordList list={newConceptList} />
      </ExhibitPage>

      <ExhibitPage pageNumber={4} label="Passage" reader>
        <ReaderPassages passages={filledPassages} />
      </ExhibitPage>
    </Box>
  )
})

LessonPlanTemplate.displayName = 'LessonPlanTemplate'

export default LessonPlanTemplate
