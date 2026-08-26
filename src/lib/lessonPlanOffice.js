/**
 * Build a .docx (and Google Docs-friendly zip) from a week of lesson plans.
 */
import { downloadBlob, sanitizeFileStem, zipStore } from './exportTable'
import { studentDisplayName } from './fetchStudentLessonPlan'
import { sanitizeLessonBody } from './sanitizeLessonText'
import { formatLessonPlanDate, lessonPlanTemplateProps } from './lessonPlanPrint'
import { formatTimeRange, parseScheduleDate } from './schedule'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const GOOGLE_DOCS_OPEN_URL = 'https://docs.google.com/document/u/0/'

const WHAT_SPELLS = ['/a/ cat', '/e/ pet', '/i/ itch', '/o/ octopus', '/u/ up', '/ck/ luck', '/sk/ mask', '/ft/ gift']
const SIMULTANEOUS_ORAL = ['task', 'shaft', 'pluck']

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function listWordLabels(list) {
  if (!list) return []
  const words = Array.isArray(list.words) ? list.words : []
  return words
    .map((word) => {
      if (typeof word === 'string') return word
      if (typeof word?.word === 'string') return word.word
      return word?.word?.word
    })
    .filter(Boolean)
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

function textRuns(text, extraRpr = '') {
  const lines = String(text ?? '').split(/\r?\n/)
  return lines
    .map((line, index) => {
      const run = `<w:r>${extraRpr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
      return index < lines.length - 1 ? `${run}<w:r><w:br/></w:r>` : run
    })
    .join('')
}

function paragraph(text, { style = 'Normal', bold = false } = {}) {
  const rpr = bold ? '<w:rPr><w:b/></w:rPr>' : ''
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${textRuns(text, rpr)}</w:p>`
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function labeledLine(label, value) {
  const text = value == null ? '' : String(value).trim()
  return paragraph(`${label}: ${text || '—'}`)
}

function wordListParagraphs(lists) {
  const blocks = []
  ;(lists ?? []).forEach((list) => {
    const words = listWordLabels(list)
    if (!list && !words.length) return
    if (list?.name || list?.concept) {
      blocks.push(paragraph([list?.name, list?.concept].filter(Boolean).join(' · '), { bold: true }))
    }
    if (words.length) {
      words.forEach((word) => blocks.push(paragraph(word, { style: 'ReaderWord' })))
    } else {
      blocks.push(paragraph('—'))
    }
  })
  return blocks
}

function lessonToParagraphs(section) {
  const { props, studentName, when, groupName } = section
  const reviewLists = [0, 1, 2].map((index) => props.reviewLists?.[index] ?? null)
  const sentences = (props.sentences ?? []).filter((item) => Boolean(sentenceText(item)))
  const passageSnaps = [props.passages?.[0] ?? props.passage ?? null, props.passages?.[1] ?? null]
  const passages = passageSnaps.filter((item) => Boolean(passageText(item)))
  const heading = [studentName, props.lessonName].filter(Boolean).join(' · ') || 'Lesson plan'
  const sub = [when, groupName].filter(Boolean).join(' · ')

  return [
    paragraph(heading, { style: 'Heading1' }),
    sub ? paragraph(sub) : '',
    labeledLine('Student', studentName),
    labeledLine('Date', props.date),
    labeledLine('Lesson #', props.lessonNumber),
    labeledLine('Instructor', props.instructor),
    paragraph('Decoding', { style: 'Heading2' }),
    labeledLine('SOAP notes', props.soapNotes),
    paragraph('Drills: Phonemic Awareness, Phonogram Card Drill, Blending Drill, Non-Phonetic Morpheme Drill'),
    labeledLine(
      'Review words',
      reviewLists
        .filter((list) => list?.name)
        .map((list, index) => `${index + 1}. ${list.name}`)
        .join('\n'),
    ),
    paragraph('Guided Discovery', { style: 'Heading2' }),
    labeledLine('New concept', props.newConceptList?.name || props.newConceptList?.concept),
    paragraph('Methods: VATK, Coding of New Concept, Handwriting'),
    paragraph('Encoding', { style: 'Heading2' }),
    labeledLine('What spells?', WHAT_SPELLS.join(', ')),
    labeledLine('Simultaneous oral', SIMULTANEOUS_ORAL.join(', ')),
    labeledLine(
      'Dictation',
      sentences.map((sentence, index) => `${index + 1}. ${sentenceText(sentence)}`).join('\n'),
    ),
    paragraph('Oral Reading', { style: 'Heading2' }),
    labeledLine(
      'Passage',
      passages.map((item, index) => `${index + 1}. ${passageText(item)}`).join('\n\n'),
    ),
    paragraph('Review concepts', { style: 'Heading2' }),
    ...wordListParagraphs(reviewLists),
    paragraph('New concept', { style: 'Heading2' }),
    ...wordListParagraphs([props.newConceptList]),
    paragraph('Passage', { style: 'Heading2' }),
    ...passages.map((item) => paragraph(passageText(item), { style: 'ReaderWord' })),
  ].filter(Boolean)
}

function stylesXml() {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:styleId="Normal" w:default="1">' +
    '<w:name w:val="Normal"/>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title">' +
    '<w:name w:val="Title"/>' +
    '<w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="240"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="002366"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1">' +
    '<w:name w:val="heading 1"/>' +
    '<w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="120"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="002366"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2">' +
    '<w:name w:val="heading 2"/>' +
    '<w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="280" w:after="80"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="3d5a99"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="ReaderWord">' +
    '<w:name w:val="Reader Word"/>' +
    '<w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="80"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr>' +
    '</w:style>' +
    '</w:styles>'
  )
}

function documentXml(title, sections) {
  const body = [
    paragraph(title, { style: 'Title' }),
    paragraph('Each lesson starts on a new page. Open this file in Microsoft Word or upload it in Google Docs (File → Open).'),
    ...sections.flatMap((section, index) => [
      index === 0 ? '' : pageBreak(),
      ...lessonToParagraphs(section),
    ]),
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="864" w:bottom="720" w:left="864" w:header="0" w:footer="0"/></w:sectPr>',
  ]
    .filter(Boolean)
    .join('')

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body></w:document>`
  )
}

function buildLessonPlansDocx(title, sections) {
  return zipStore([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/_rels/document.xml.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    { name: 'word/styles.xml', data: stylesXml() },
    { name: 'word/document.xml', data: documentXml(title, sections) },
  ])
}

export function weekLessonPlanSections(entries = [], instructor = '') {
  return (entries ?? [])
    .filter((entry) => entry?.lesson?.id)
    .map((entry) => ({
      studentName: studentDisplayName(entry.student),
      when: formatEntryWhen(entry.startAt, entry.endAt),
      groupName: entry.groupName || '',
      props: lessonPlanTemplateProps(entry.lesson, entry.student, {
        instructor,
        date: formatLessonPlanDate(parseScheduleDate(entry.startAt) || entry.lesson.date),
      }),
    }))
}

export function downloadWeekLessonPlansDocx({ weekLabel, entries = [], instructor = '' } = {}) {
  const title = `Lesson Plans – ${weekLabel || 'Week'}`
  const sections = weekLessonPlanSections(entries, instructor)
  if (!sections.length) return false
  downloadBlob(
    buildLessonPlansDocx(title, sections),
    `${sanitizeFileStem(title)}.docx`,
    DOCX_MIME,
  )
  return true
}

export function downloadWeekLessonPlansForGoogleDocs(options = {}) {
  const downloaded = downloadWeekLessonPlansDocx(options)
  if (!downloaded) return false
  window.open(GOOGLE_DOCS_OPEN_URL, '_blank', 'noopener,noreferrer')
  return true
}
