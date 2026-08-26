/**
 * Canonical lesson-plan JSON shape (slots, snapshots, scores) and parse/serialize helpers.
 */
const LIST_SLOT_KEYS = ['newConcept', 'review1', 'review2', 'review3']
const SENTENCE_SLOT_KEYS = ['sentence1', 'sentence2', 'sentence3', 'sentence4', 'sentence5', 'sentence6']
const PASSAGE_SLOT_KEYS = ['passage1', 'passage2']

function parseJsonValue(value, fallback) {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    if (current == null) return fallback
    if (typeof current === 'object') return current
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed) return fallback
    try {
      current = JSON.parse(trimmed)
    } catch {
      return fallback
    }
  }
  return current && typeof current === 'object' ? current : fallback
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null)
  return []
}

function asId(value) {
  const id = String(value ?? '').trim()
  return id || null
}

function compactList(list) {
  if (!list || typeof list !== 'object') return null
  const words = asArray(list.words).map((word) => String(word ?? '').trim()).filter(Boolean)
  const id = asId(list.id)
  const name = String(list.name ?? '').trim()
  const concept = String(list.concept ?? '').trim()
  const conceptID = asId(list.conceptID)
  if (!id && !name && !conceptID && !words.length) return null
  return {
    id,
    name: name || null,
    concept: concept || null,
    conceptID,
    words,
  }
}

function compactSentence(sentence) {
  if (!sentence || typeof sentence !== 'object') return null
  const text = String(sentence.text ?? '').trim()
  if (!text && !asId(sentence.id)) return null
  return {
    id: asId(sentence.id),
    text: text || null,
    wordCount: Number.isFinite(Number(sentence.wordCount)) ? Number(sentence.wordCount) : null,
    conceptID: asId(sentence.conceptID || sentence.focusConceptId),
    focusConcept: String(sentence.focusConcept ?? '').trim() || null,
  }
}

function compactPassage(passage) {
  if (!passage || typeof passage !== 'object') return null
  const text = String(passage.text ?? '').trim()
  if (!text && !asId(passage.id)) return null
  const concept = String(passage.concept ?? passage.focusConcept ?? '').trim()
  return {
    id: asId(passage.id),
    title: String(passage.title ?? '').trim() || null,
    text: text || null,
    concept: concept || null,
    conceptID: asId(passage.conceptID || passage.focusConceptId),
    focusConcept: String(passage.focusConcept ?? passage.concept ?? '').trim() || null,
    wordCount: Number.isFinite(Number(passage.wordCount)) ? Number(passage.wordCount) : null,
  }
}

function slotsFromIds(keys, ids) {
  const slots = {}
  keys.forEach((key, index) => {
    slots[key] = asId(ids?.[index]) || null
  })
  return slots
}

function idsFromSlots(slots, keys) {
  return keys.map((key) => asId(slots?.[key])).filter(Boolean)
}

function legacySnapshotsToCanonical(raw) {
  const lists = raw?.lists && typeof raw.lists === 'object' ? raw.lists : {}
  const passages = Array.isArray(raw?.passages)
    ? raw.passages
    : raw?.passage
      ? [raw.passage]
      : []
  return {
    lists: {
      newConcept: compactList(lists.newConcept),
      review1: compactList(lists.review1),
      review2: compactList(lists.review2),
      review3: compactList(lists.review3),
    },
    sentences: asArray(raw?.sentences).map(compactSentence).filter(Boolean),
    passages: passages.map(compactPassage).filter(Boolean),
    passage: compactPassage(raw?.passage) || compactPassage(passages[0]),
  }
}

export function parseJsonObject(value) {
  const parsed = parseJsonValue(value, {})
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

export function parseLessonData(value) {
  const parsed = parseJsonValue(value, {})
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

export function planToCanonical(plan) {
  if (!plan || typeof plan !== 'object') return {}
  const sentenceIds = asArray(plan.sentenceIds)
  const passageIds = asArray(plan.passageIds)
  const snaps = plan.snapshots ?? {}
  const passages = asArray(snaps.passages).map(compactPassage).filter(Boolean)
  return {
    slots: {
      listSlots: {
        newConcept: asId(plan.listSlots?.newConcept),
        review1: asId(plan.listSlots?.review1),
        review2: asId(plan.listSlots?.review2),
        review3: asId(plan.listSlots?.review3),
      },
      sentenceSlots: slotsFromIds(SENTENCE_SLOT_KEYS, sentenceIds),
      passageSlots: slotsFromIds(PASSAGE_SLOT_KEYS, passageIds),
    },
    conceptSlots: {
      newConceptId: asId(plan.newConceptId),
      reviewConceptIds: asArray(plan.reviewConceptIds).map(asId).filter(Boolean),
    },
    snapshots: {
      lists: {
        newConcept: compactList(snaps.newConceptList),
        review1: compactList(snaps.review1List),
        review2: compactList(snaps.review2List),
        review3: compactList(snaps.review3List),
      },
      sentences: asArray(snaps.sentences).map(compactSentence).filter(Boolean),
      passages,
      passage: passages[0] ?? null,
    },
    instructor: String(plan.instructor ?? '').trim() || null,
  }
}

export function canonicalToPlan(canonical) {
  const data = canonical && typeof canonical === 'object' ? canonical : {}
  const snapshots = data.snapshots ?? {}
  const lists = snapshots.lists ?? {}
  const passages = Array.isArray(snapshots.passages)
    ? snapshots.passages
    : snapshots.passage
      ? [snapshots.passage]
      : []
  const sentenceSlots = data.slots?.sentenceSlots ?? {}
  const passageSlots = data.slots?.passageSlots ?? {}
  const listSlots = data.slots?.listSlots ?? {}
  return {
    listSlots: {
      newConcept: asId(listSlots.newConcept) || asId(lists.newConcept?.id),
      review1: asId(listSlots.review1) || asId(lists.review1?.id),
      review2: asId(listSlots.review2) || asId(lists.review2?.id),
      review3: asId(listSlots.review3) || asId(lists.review3?.id),
    },
    sentenceIds: idsFromSlots(sentenceSlots, SENTENCE_SLOT_KEYS).length
      ? idsFromSlots(sentenceSlots, SENTENCE_SLOT_KEYS)
      : asArray(snapshots.sentences).map((item) => asId(item?.id)).filter(Boolean),
    passageIds: idsFromSlots(passageSlots, PASSAGE_SLOT_KEYS).length
      ? idsFromSlots(passageSlots, PASSAGE_SLOT_KEYS)
      : passages.map((item) => asId(item?.id)).filter(Boolean),
    newConceptId: asId(data.conceptSlots?.newConceptId) || asId(lists.newConcept?.conceptID),
    reviewConceptIds: asArray(data.conceptSlots?.reviewConceptIds).map(asId).filter(Boolean),
    snapshots: {
      newConceptList: compactList(lists.newConcept),
      review1List: compactList(lists.review1),
      review2List: compactList(lists.review2),
      review3List: compactList(lists.review3),
      sentences: asArray(snapshots.sentences).map(compactSentence).filter(Boolean),
      passages: passages.map(compactPassage).filter(Boolean),
    },
    instructor: String(data.instructor ?? '').trim() || null,
  }
}

function legacyToCanonical(raw) {
  const data = parseLessonData(raw)
  if (!data || !Object.keys(data).length) return {}
  return {
    slots: {
      listSlots: {
        newConcept: asId(data.slots?.listSlots?.newConcept),
        review1: asId(data.slots?.listSlots?.review1),
        review2: asId(data.slots?.listSlots?.review2),
        review3: asId(data.slots?.listSlots?.review3),
      },
      sentenceSlots: {
        ...slotsFromIds(SENTENCE_SLOT_KEYS, []),
        ...(data.slots?.sentenceSlots ?? {}),
      },
      passageSlots: {
        ...slotsFromIds(PASSAGE_SLOT_KEYS, []),
        ...(data.slots?.passageSlots ?? {}),
      },
    },
    conceptSlots: {
      newConceptId: asId(data.conceptSlots?.newConceptId),
      reviewConceptIds: asArray(data.conceptSlots?.reviewConceptIds).map(asId).filter(Boolean),
    },
    snapshots: legacySnapshotsToCanonical(data.snapshots),
    instructor: String(data.instructor ?? '').trim() || null,
    name: data.name,
    notes: data.notes,
  }
}

export function getLessonPlan(lesson) {
  if (!lesson) return {}
  if (lesson.plan && typeof lesson.plan === 'object' && !Array.isArray(lesson.plan)) {
    const fromPlan = planToCanonical(lesson.plan)
    return {
      ...fromPlan,
      name: lesson.name || fromPlan.name,
      notes: lesson.comments || fromPlan.notes,
    }
  }
  return legacyToCanonical(lesson.lessonData)
}

export function getLessonScores(lesson) {
  const fromField = parseJsonObject(lesson?.scores)
  const map = Object.fromEntries(
    Object.entries(fromField).filter(([key]) => key !== 'summary'),
  )
  if (Object.keys(map).length) return map
  const legacy = parseLessonData(lesson?.lessonData)
  const scores = legacy.scores && typeof legacy.scores === 'object' && !Array.isArray(legacy.scores)
    ? legacy.scores
    : {}
  return Object.fromEntries(Object.entries(scores).filter(([key]) => key !== 'summary'))
}

export function getLessonScoreSummary(lesson) {
  const fromScores = parseJsonObject(lesson?.scores)
  if (fromScores.summary && typeof fromScores.summary === 'object') return fromScores.summary
  const legacy = parseLessonData(lesson?.lessonData)
  return legacy.scoreSummary && typeof legacy.scoreSummary === 'object' ? legacy.scoreSummary : null
}

export function serializeScores(scores, summary) {
  const map = scores && typeof scores === 'object' && !Array.isArray(scores) ? scores : {}
  const payload = summary ? { ...map, summary } : map
  return JSON.stringify(payload)
}

export function planFieldSelection(prefix = 'plan') {
  const listFields = ['id', 'name', 'concept', 'conceptID', 'words']
  const sentenceFields = ['id', 'text', 'wordCount', 'conceptID', 'focusConcept']
  const passageFields = ['id', 'title', 'text', 'concept', 'conceptID', 'focusConcept', 'wordCount']
  const listPrefixes = [
    `${prefix}.snapshots.newConceptList`,
    `${prefix}.snapshots.review1List`,
    `${prefix}.snapshots.review2List`,
    `${prefix}.snapshots.review3List`,
  ]
  return [
    `${prefix}.listSlots.newConcept`,
    `${prefix}.listSlots.review1`,
    `${prefix}.listSlots.review2`,
    `${prefix}.listSlots.review3`,
    `${prefix}.sentenceIds`,
    `${prefix}.passageIds`,
    `${prefix}.newConceptId`,
    `${prefix}.reviewConceptIds`,
    `${prefix}.instructor`,
    ...listPrefixes.flatMap((path) => listFields.map((field) => `${path}.${field}`)),
    ...sentenceFields.map((field) => `${prefix}.snapshots.sentences.${field}`),
    ...passageFields.map((field) => `${prefix}.snapshots.passages.${field}`),
  ]
}

export { LIST_SLOT_KEYS, SENTENCE_SLOT_KEYS, PASSAGE_SLOT_KEYS }
