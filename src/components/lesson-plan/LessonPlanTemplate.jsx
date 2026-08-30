/**
 * Printable lesson-plan pages (instructor + student sheets).
 */
import { forwardRef } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { sanitizeLessonBody } from '../../lib/sanitizeLessonText'
import { BRAND, FONT_FAMILY, studentTypeSx } from '../../theme'

const readerPaperSx = {
  bgcolor: '#ffffff',
  width: '100%',
  maxWidth: '800px',
  mx: 'auto',
  p: '20px',
  borderRadius: '4px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  ...studentTypeSx,
  '@media print': {
    boxShadow: 'none',
    p: 0,
    maxWidth: '100%',
    borderRadius: 0,
    bgcolor: '#ffffff',
    color: BRAND.readerInk,
  },
}

const readerTypeSx = {
  ...studentTypeSx,
  fontFamily: 'inherit',
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
  color: BRAND.ink,
  fontFamily: FONT_FAMILY,
  fontSize: '11px',
  fontWeight: 400,
  lineHeight: 1.25,
  letterSpacing: '-0.02em',
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
  color: BRAND.navy,
  fontFamily: FONT_FAMILY,
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  textTransform: 'uppercase',
  borderBottom: `1px solid ${BRAND.gray}`,
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
  color: BRAND.inkMuted,
  width: 110,
  flexShrink: 0,
  fontSize: '11px',
  fontFamily: FONT_FAMILY,
  letterSpacing: '-0.02em',
}

const contentSx = {
  flexGrow: 1,
  lineHeight: 1.25,
  fontSize: '11px',
  fontFamily: FONT_FAMILY,
  letterSpacing: '-0.02em',
}

function Placeholder({ value }) {
  const text = value != null ? String(value).trim() : ''
  if (!text) return null
  return (
    <Box component="span" sx={{ color: 'inherit', fontFamily: 'inherit', fontWeight: 400 }}>
      {text}
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

function ExhibitPage({ pageNumber, label, reader = false, placeholder = false, children }) {
  const pageSx = reader ? readerPaperSx : paperSx
  return (
    <Paper
      elevation={0}
      className={`lesson-plan-page lesson-plan-page-${pageNumber}${reader ? ' lesson-plan-reader-page' : ''}${placeholder ? ' lesson-plan-page-placeholder' : ''}`}
      sx={{
        ...pageSx,
        mb: 2,
        '@media print': {
          ...pageSx['@media print'],
          mb: 0,
          display: placeholder ? 'none' : undefined,
          breakBefore: placeholder ? 'auto' : 'page',
          pageBreakBefore: placeholder ? 'auto' : 'always',
        },
      }}
    >
      <Typography
        className="lesson-plan-screen-only"
        component="div"
        sx={
          reader
            ? {
                ...studentTypeSx,
                fontSize: '14px',
                letterSpacing: '0.02em',
                mb: '16px',
                '@media print': { display: 'none' },
              }
            : {
                fontFamily: FONT_FAMILY,
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                color: BRAND.inkMuted,
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
  const reviewPlaceholder = !paddedReview.some((list) => listWordLabels(list).length)
  const newConceptPlaceholder = listWordLabels(newConceptList).length === 0
  const passagePlaceholder = filledPassages.length === 0

  return (
    <Box ref={ref} className="lesson-plan-print-root">
      <Paper elevation={0} className="lesson-plan-page" sx={{ ...paperSx, mb: 2, '@media print': { ...paperSx['@media print'], mb: 0 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            pb: '8px',
            borderBottom: `2px solid ${BRAND.navy}`,
            mb: '12px',
            fontWeight: 700,
            fontSize: '11px',
            fontFamily: FONT_FAMILY,
            letterSpacing: '-0.02em',
          }}
        >
          <Box>
            Student: <Placeholder value={studentName} />
          </Box>
          <Box>
            Date: <Placeholder value={date} />
          </Box>
          <Box>
            Lesson #: <Placeholder value={lessonNumber} />
          </Box>
          <Box>
            Instructor: <Placeholder value={instructor} />
          </Box>
          {lessonName ? (
            <Box sx={{ gridColumn: '1 / -1' }}>
              Name: <Placeholder value={lessonName} />
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
              <Box sx={contentSx}>{soapNotes || '\u00a0'}</Box>
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
              {paddedReview.some((list) => list?.name)
                ? paddedReview
                    .filter((list) => list?.name)
                    .map((list, index) => (
                      <Box key={list.id || list.name || index}>
                        {index + 1}. <Placeholder value={list.name} />
                      </Box>
                    ))
                : '\u00a0'}
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
              <Box sx={contentSx}>{newConceptList?.name || '\u00a0'}</Box>
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
            <Box sx={contentSx}>{'\u00a0'}</Box>
          </Box>
          <Box sx={rowSx}>
            <Box sx={labelSx}>Simultaneous Oral Spelling</Box>
            <Box sx={contentSx}>{'\u00a0'}</Box>
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
            <Box sx={contentSx}>{reflectionNotes || '\u00a0'}</Box>
          </Box>
        </Box>
      </Paper>

      <ExhibitPage pageNumber={2} label="Review concepts" reader placeholder={reviewPlaceholder}>
        <ReaderWordColumns lists={paddedReview} />
      </ExhibitPage>

      <ExhibitPage pageNumber={3} label="New concept" reader placeholder={newConceptPlaceholder}>
        <ReaderWordList list={newConceptList} />
      </ExhibitPage>

      <ExhibitPage pageNumber={4} label="Passage" reader placeholder={passagePlaceholder}>
        <ReaderPassages passages={filledPassages} />
      </ExhibitPage>
    </Box>
  )
})

LessonPlanTemplate.displayName = 'LessonPlanTemplate'

export default LessonPlanTemplate
