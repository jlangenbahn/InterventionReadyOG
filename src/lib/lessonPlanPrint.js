import { formatLessonDisplayName } from './fetchStudentLessonPlan'
import { getLessonPlan } from './lessonPlanDocument'

export const LESSON_PLAN_PRINT_PAGE_STYLE = `
  @page { size: 8.5in 11in; margin: 0.5in; }
  html, body {
    background: transparent !important;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .lesson-plan-print-root {
    box-shadow: none !important;
    padding: 0 !important;
    max-width: 100% !important;
    background: transparent !important;
  }
  .lesson-plan-print-root ~ .lesson-plan-print-root {
    break-before: page;
    page-break-before: always;
  }
  .lesson-plan-page {
    box-shadow: none !important;
    padding: 0 !important;
    max-width: 100% !important;
    border-radius: 0 !important;
  }
  .lesson-plan-page-2,
  .lesson-plan-page-3,
  .lesson-plan-page-4 {
    break-before: page;
    page-break-before: always;
  }
  .lesson-plan-reader-page {
    background: #ffffff !important;
    color: #333333 !important;
    font-family: "Century Gothic", "Comic Sans MS", Andika, sans-serif !important;
    font-size: 24px !important;
    font-weight: 400 !important;
    font-style: normal !important;
    line-height: 1.6 !important;
    letter-spacing: 0.04em !important;
    text-align: left !important;
    text-transform: none !important;
    text-decoration: none !important;
  }
  .lesson-plan-page:not(.lesson-plan-reader-page) {
    font-family: "Century Gothic", "Comic Sans MS", Andika, sans-serif !important;
    font-size: 11px !important;
    letter-spacing: -0.02em !important;
    line-height: 1.25 !important;
    color: #1a2332 !important;
  }
  .lesson-plan-screen-only {
    display: none !important;
  }
`

function pad(value) {
  return String(value).padStart(2, '0')
}

export function formatLessonPlanDate(value) {
  if (!value) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${pad(value.getMonth() + 1)}/${pad(value.getDate())}/${value.getFullYear()}`
  }
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-')
    return `${month}/${day}/${year}`
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatLessonPlanDate(parsed)
}

export function lessonPlanTemplateProps(lesson, student, extras = {}) {
  const data = getLessonPlan(lesson) ?? {}
  const lists = data.snapshots?.lists ?? {}
  const sentenceSnaps = Array.isArray(data.snapshots?.sentences) ? data.snapshots.sentences : []
  const passageSnaps = Array.isArray(data.snapshots?.passages)
    ? data.snapshots.passages
    : data.snapshots?.passage
      ? [data.snapshots.passage]
      : []
  const conceptName = lists.newConcept?.concept || lists.newConcept?.name || ''
  const lessonNumber = lesson?.lessonNumber
  return {
    student,
    reviewLists: [lists.review1 ?? null, lists.review2 ?? null, lists.review3 ?? null],
    newConceptList: lists.newConcept ?? null,
    sentences: [0, 1, 2, 3, 4, 5].map((index) => sentenceSnaps[index] ?? null),
    passages: [passageSnaps[0] ?? null, passageSnaps[1] ?? null],
    passage: passageSnaps[0] ?? null,
    date: extras.date || formatLessonPlanDate(lesson?.date),
    lessonNumber,
    lessonName: formatLessonDisplayName(data.name || lesson?.name, conceptName, lessonNumber),
    instructor: extras.instructor || data.instructor || '',
    soapNotes: extras.soapNotes ?? data.notes ?? lesson?.comments ?? '',
  }
}
