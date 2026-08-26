/**
 * Derive at-a-glance analytics for one student's lessons, scores, and scope.
 */
import {
  SCORE_CORRECT,
  SCORE_INCORRECT,
  buildLessonScoreMaterials,
  lessonConceptKeys,
  parseScopeAndSequence,
  tallyScores,
} from './fetchStudentLessonPlan'
import { MASTERY_STATUSES } from './scopeAndSequence'
import { normalizeLookupWord } from './tagMultiWordText'

const STALE_REVIEW_DAYS = 21

export function formatLessonDate(value) {
  if (!value) return ''
  const raw = String(value)
  const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : ''
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return ''
  return `${month}/${day}/${year}`
}

export function parseLessonDay(value) {
  if (!value) return null
  const raw = String(value)
  const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : ''
  if (!iso) {
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function daysSince(value) {
  const date = parseLessonDay(value)
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - date.getTime()) / 86400000)
}

export function formatDaysAgo(value) {
  const days = daysSince(value)
  if (days == null) return ''
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 0) return 'Upcoming'
  return `${days} days ago`
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

function lessonSortValue(lesson) {
  return String(lesson?.date || lesson?.createdAt || '')
}

function emptyWordRow(lookup, display) {
  return {
    id: lookup,
    word: display || lookup,
    encounters: 0,
    lessonIds: new Set(),
    sources: new Set(),
    lastSeen: '',
    correct: 0,
    incorrect: 0,
    conceptIds: new Set(),
  }
}

/**
 * Build dashboard metrics from a student's lessons, catalog, and scope inventory.
 */
export function buildStudentAnalytics({
  student,
  concepts = [],
  catalogIndex,
  lessons = [],
}) {
  const orderedLessons = [...(lessons ?? [])].sort((a, b) =>
    lessonSortValue(a).localeCompare(lessonSortValue(b)),
  )

  const byWord = new Map()
  const conceptStats = new Map()
  const lessonTrend = []
  let totalCorrect = 0
  let totalIncorrect = 0

  const ensureConceptStat = (conceptId, fallbackName = '') => {
    if (!conceptId) return null
    const current = conceptStats.get(conceptId) ?? {
      id: conceptId,
      lessonIds: new Set(),
      lastSeen: '',
      correct: 0,
      incorrect: 0,
      name: fallbackName,
    }
    if (fallbackName && !current.name) current.name = fallbackName
    conceptStats.set(conceptId, current)
    return current
  }

  const addWord = (raw, source, lesson, scoreState) => {
    const lookup = normalizeLookupWord(raw)
    if (!lookup) return
    const display = String(raw).replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '') || lookup
    const current = byWord.get(lookup) ?? emptyWordRow(lookup, display)
    current.encounters += 1
    if (lesson?.id) current.lessonIds.add(lesson.id)
    current.sources.add(source)
    const lessonDate = lesson.date || lesson.createdAt
    if (String(lessonDate) > String(current.lastSeen)) current.lastSeen = lessonDate
    if (scoreState === SCORE_CORRECT) current.correct += 1
    if (scoreState === SCORE_INCORRECT) current.incorrect += 1
    const catalog = catalogIndex?.get(lookup)
    for (const concept of catalog?.concepts ?? []) {
      if (concept?.id) current.conceptIds.add(concept.id)
    }
    byWord.set(lookup, current)
  }

  for (const lesson of orderedLessons) {
    const materials = buildLessonScoreMaterials(lesson)
    const scores = materials.scores ?? {}
    const tally = tallyScores(materials.allKeys, scores)
    totalCorrect += tally.correct
    totalIncorrect += tally.incorrect
    lessonTrend.push({
      id: lesson.id,
      name: lesson.name || `Lesson ${lesson.lessonNumber || ''}`.trim(),
      date: lesson.date || lesson.createdAt,
      dateLabel: formatLessonDate(lesson.date || lesson.createdAt) || '—',
      accuracy: tally.accuracy,
      correct: tally.correct,
      incorrect: tally.incorrect,
      scored: tally.scored,
      total: tally.total,
    })

    for (const list of materials.lists ?? []) {
      if (list.conceptID) {
        const stat = ensureConceptStat(list.conceptID, list.concept)
        if (stat) {
          if (lesson?.id) stat.lessonIds.add(lesson.id)
          const lessonDate = lesson.date || lesson.createdAt
          if (String(lessonDate) > String(stat.lastSeen)) stat.lastSeen = lessonDate
          const listTally = tallyScores(
            (list.words ?? []).map((item) => item.key),
            scores,
          )
          stat.correct += listTally.correct
          stat.incorrect += listTally.incorrect
        }
      }
      for (const item of list.words ?? []) addWord(item.word, 'Lists', lesson, scores[item.key])
    }
    for (const sentence of materials.sentences ?? []) {
      for (const item of sentence.words ?? []) {
        addWord(item.word, 'Sentences', lesson, scores[item.key])
      }
    }
    for (const passage of materials.passages ?? []) {
      if (passage.conceptID) {
        const stat = ensureConceptStat(passage.conceptID, passage.concept)
        if (stat && lesson?.id) {
          stat.lessonIds.add(lesson.id)
          const lessonDate = lesson.date || lesson.createdAt
          if (String(lessonDate) > String(stat.lastSeen)) stat.lastSeen = lessonDate
        }
      }
      for (const item of passage.words ?? []) {
        addWord(item.word, 'Passages', lesson, scores[item.key])
      }
    }

    const keys = lessonConceptKeys(lesson)
    for (const key of keys) {
      if (!key.startsWith('id:')) continue
      const conceptId = key.slice(3)
      const stat = ensureConceptStat(conceptId)
      if (!stat) continue
      if (lesson?.id) stat.lessonIds.add(lesson.id)
      const lessonDate = lesson.date || lesson.createdAt
      if (String(lessonDate) > String(stat.lastSeen)) stat.lastSeen = lessonDate
    }
  }

  const inventory = parseScopeAndSequence(student?.scopeAndSequence)
  const byId = new Map((inventory ?? []).map((entry) => [entry.conceptId, entry]))

  const masteryRows = (concepts ?? [])
    .filter((concept) => concept?.id)
    .map((concept) => {
      const entry = byId.get(concept.id)
      const masteryStatus = MASTERY_STATUSES.includes(entry?.masteryStatus)
        ? entry.masteryStatus
        : 'unknown'
      const stats = conceptStats.get(concept.id)
      const scored = (stats?.correct ?? 0) + (stats?.incorrect ?? 0)
      return {
        id: concept.id,
        concept: concept.concept || 'Untitled concept',
        category: concept.category || '',
        level: concept.level || '',
        inScope: entry?.inScope === true,
        masteryStatus,
        sequence: Number.isFinite(Number(entry?.sequence)) ? Number(entry.sequence) : null,
        lessonCount: stats?.lessonIds.size ?? 0,
        lastSeen: stats?.lastSeen || '',
        lastSeenLabel: formatLessonDate(stats?.lastSeen) || 'Never',
        correct: stats?.correct ?? 0,
        incorrect: stats?.incorrect ?? 0,
        accuracy: scored ? stats.correct / scored : null,
      }
    })

  const inScope = masteryRows.filter((row) => row.inScope)
  const counts = { unknown: 0, new: 0, review: 0, mastered: 0 }
  for (const row of inScope) counts[row.masteryStatus] += 1
  const chartRows = ['new', 'review', 'mastered'].map((status) => ({
    id: status,
    name: status.charAt(0).toUpperCase() + status.slice(1),
    count: counts[status],
    percentOfTokens: inScope.length ? counts[status] / inScope.length : 0,
  }))

  const wordRows = [...byWord.values()]
    .map((row) => {
      const scored = row.correct + row.incorrect
      return {
        ...row,
        lessonCount: row.lessonIds.size,
        lastSeenLabel: formatLessonDate(row.lastSeen) || '—',
        sources: [...row.sources].join(', ') || '—',
        conceptsLabel:
          (catalogIndex?.get(row.id)?.concepts ?? []).map((item) => item.name).join(', ') || '—',
        accuracy: scored ? row.correct / scored : null,
        scored,
      }
    })
    .sort((a, b) => b.encounters - a.encounters || a.word.localeCompare(b.word))

  const lastLesson = orderedLessons.at(-1) ?? null
  const lastLessonDate = lastLesson?.date || lastLesson?.createdAt || ''
  const scoredTotal = totalCorrect + totalIncorrect

  const nextNew = inScope
    .filter((row) => row.masteryStatus === 'new')
    .sort((a, b) => {
      const seqA = a.sequence ?? Number.POSITIVE_INFINITY
      const seqB = b.sequence ?? Number.POSITIVE_INFINITY
      if (seqA !== seqB) return seqA - seqB
      return a.concept.localeCompare(b.concept)
    })
    .slice(0, 5)

  const errorWords = wordRows
    .filter((row) => row.incorrect >= 2 && (row.accuracy == null || row.accuracy < 0.8))
    .sort((a, b) => b.incorrect - a.incorrect || (a.accuracy ?? 1) - (b.accuracy ?? 1))
    .slice(0, 6)

  const untaughtNew = inScope
    .filter((row) => row.masteryStatus === 'new' && row.lessonCount === 0)
    .slice(0, 5)

  const staleReview = inScope
    .filter((row) => {
      if (row.masteryStatus !== 'review') return false
      if (!row.lastSeen) return true
      const days = daysSince(row.lastSeen)
      return days != null && days >= STALE_REVIEW_DAYS
    })
    .sort((a, b) => String(a.lastSeen).localeCompare(String(b.lastSeen)))
    .slice(0, 5)

  return {
    lessonCount: orderedLessons.length,
    lastLessonDate,
    lastLessonLabel: formatLessonDate(lastLessonDate) || 'No lessons yet',
    daysSinceLast: daysSince(lastLessonDate),
    daysAgoLabel: formatDaysAgo(lastLessonDate) || '—',
    uniqueWords: wordRows.length,
    totalEncounters: wordRows.reduce((sum, row) => sum + row.encounters, 0),
    overallAccuracy: scoredTotal ? totalCorrect / scoredTotal : null,
    scoredTotal,
    totalCorrect,
    totalIncorrect,
    lessonTrend: lessonTrend.slice(-12),
    mastery: {
      rows: inScope,
      counts,
      chartRows,
      inScopeCount: inScope.length,
      masteredPct: inScope.length ? counts.mastered / inScope.length : 0,
    },
    nextNew,
    needsAttention: {
      errorWords,
      untaughtNew,
      staleReview,
    },
    wordRows,
  }
}
