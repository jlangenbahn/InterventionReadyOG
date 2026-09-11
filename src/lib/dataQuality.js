/**
 * Data-quality audit client: run catalog mutations and sequential approve/reject.
 */
import { client } from './amplifyClient'
import { listAll } from './paginate'
import { assignedConceptLinks, saveWordConcepts } from './wordConcepts'
import { DICTIONARY_BATCH_LIMIT, parseDictionaryData } from './dictionaryData'

function throwIfErrors(result) {
  if (result?.errors?.length) {
    throw new Error(result.errors.map((item) => item.message).join(', '))
  }
}

function findingsModel() {
  const model = client.models.DataQualityFinding
  if (!model) {
    throw new Error('Data quality is still deploying. Wait for Amplify to finish, then try again.')
  }
  return model
}

async function runNamedMutation(name, fallbackMessage, args = {}, selectionSet) {
  const run = client.mutations?.[name]
  if (typeof run !== 'function') {
    throw new Error(`${fallbackMessage} is still deploying. Wait for Amplify to finish, then try again.`)
  }
  const result = selectionSet ? await run(args, { selectionSet }) : await run(args)
  throwIfErrors(result)
  const data = result?.data ?? {}
  return {
    createdCount: Number(data.createdCount ?? 0),
    message: String(data.message || fallbackMessage),
    entries: data.entries ?? null,
  }
}

export async function fetchDataQualityFindings() {
  return listAll(findingsModel())
}

export async function runDataQualityAudit(sampleSize) {
  const size = Number(sampleSize)
  return runNamedMutation('runDataQualityAudit', 'Data quality audit', {
    sampleSize: size === 10 || size === 25 || size === 100 ? size : 25,
  })
}

export const ADD_WORD_SIZES = [10, 25, 100]

export async function addCatalogWords(count) {
  const size = Number(count)
  return runNamedMutation('addCatalogWords', 'Add catalog words', {
    count: size === 10 || size === 25 || size === 100 ? size : 25,
  })
}

export async function runSpellCheck(wordIds = []) {
  const ids = [...new Set((wordIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  return runNamedMutation('runSpellCheck', 'Spell check', {
    wordIds: ids,
  })
}

/** Concept ids sent to OG-description generation per AppSync mutation. */
export const DESCRIPTION_BATCH_SIZE = 25

export function conceptsMissingOgDescription(concepts = []) {
  return (concepts ?? []).filter(
    (concept) => concept?.id && !String(concept.ogDescription ?? '').trim(),
  )
}

export function conceptOgCoverage(concepts = []) {
  let withDescriptions = 0
  let missingDescriptions = 0
  for (const concept of concepts ?? []) {
    if (!concept?.id) continue
    if (String(concept.ogDescription ?? '').trim()) withDescriptions += 1
    else missingDescriptions += 1
  }
  return { withDescriptions, missingDescriptions, total: withDescriptions + missingDescriptions }
}

export async function generateConceptDescriptions(conceptIds = []) {
  const ids = (conceptIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)
  return runNamedMutation('generateConceptDescriptions', 'OG description generation', {
    conceptIds: ids,
  })
}

export async function generateDictionaryDefinitions(wordIds = []) {
  const ids = [...new Set((wordIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))].slice(
    0,
    DICTIONARY_BATCH_LIMIT,
  )
  let result
  try {
    result = await runNamedMutation(
      'generateDictionaryDefinitions',
      'Dictionary definition generation',
      { wordIds: ids },
      ['createdCount', 'message', 'entries'],
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (!/entries/i.test(message)) throw err
    result = await runNamedMutation(
      'generateDictionaryDefinitions',
      'Dictionary definition generation',
      { wordIds: ids },
      ['createdCount', 'message'],
    )
  }
  const rawEntries = Array.isArray(result.entries)
    ? result.entries
    : parseDictionaryEntries(result.entries)
  return {
    ...result,
    entries: (rawEntries ?? []).map((item) => ({
      id: item.wordId || item.id,
      word: item.word,
      dictionaryData: parseDictionaryData(item.dictionaryData ?? item),
    })),
  }
}

function parseDictionaryEntries(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  try {
    let current = JSON.parse(raw)
    if (typeof current === 'string') current = JSON.parse(current)
    return Array.isArray(current) ? current : []
  } catch {
    return []
  }
}

export const DICTIONARY_MEGA_BATCH_TYPE = 'DICTIONARY_MEGA_BATCH'

const BATCH_JOB_SELECTION = ['id', 'type', 'status', 'totalCount', 'processedCount', 'startTime']

function batchJobModel() {
  return client.models.BatchJob
}

export function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatEstimatedRemaining(job, now = Date.now()) {
  const processed = Number(job?.processedCount ?? 0)
  const total = Number(job?.totalCount ?? 0)
  if (!job?.startTime || processed <= 0 || total <= processed) return null
  const start = new Date(job.startTime).getTime()
  if (!Number.isFinite(start)) return null
  const elapsed = Math.max(0, now - start)
  return formatDurationMs((elapsed / processed) * (total - processed))
}

function normalizeBatchJob(item) {
  if (!item?.id) return null
  return {
    id: item.id,
    type: String(item.type || ''),
    status: String(item.status || ''),
    totalCount: Number(item.totalCount ?? 0),
    processedCount: Number(item.processedCount ?? 0),
    startTime: item.startTime || null,
  }
}

function pickActiveDictionaryJob(items = []) {
  const jobs = (items ?? [])
    .map(normalizeBatchJob)
    .filter((job) => job && job.type === DICTIONARY_MEGA_BATCH_TYPE)
  const inProgress = jobs
    .filter((job) => job.status === 'IN_PROGRESS')
    .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))
  return inProgress[0] ?? null
}

export async function fetchActiveDictionaryMegaBatch() {
  const model = batchJobModel()
  if (!model) return null
  let items = []
  if (typeof model.listBatchJobByType === 'function') {
    let nextToken
    do {
      const result = await model.listBatchJobByType(
        { type: DICTIONARY_MEGA_BATCH_TYPE },
        { limit: 1000, nextToken, selectionSet: BATCH_JOB_SELECTION },
      )
      throwIfErrors(result)
      items.push(...(result.data ?? []))
      nextToken = result.nextToken
    } while (nextToken)
  } else {
    items = await listAll(model, { selectionSet: BATCH_JOB_SELECTION })
  }
  return pickActiveDictionaryJob(items)
}

export async function fetchDictionaryMegaBatch(id) {
  const jobId = String(id ?? '').trim()
  const model = batchJobModel()
  if (!jobId || !model) return null
  const result = await model.get({ id: jobId }, { selectionSet: BATCH_JOB_SELECTION })
  throwIfErrors(result)
  return normalizeBatchJob(result.data)
}

export async function startDictionaryMegaBatch() {
  const run = client.mutations?.startDictionaryMegaBatch
  if (typeof run !== 'function') {
    throw new Error('Dictionary mega batch is still deploying. Wait for Amplify to finish, then try again.')
  }
  let result
  try {
    result = await run({}, { selectionSet: BATCH_JOB_SELECTION })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (!/selectionSet|startTime|processedCount/i.test(message)) throw err
    result = await run({})
  }
  throwIfErrors(result)
  const job = normalizeBatchJob(result.data)
  if (!job) throw new Error('Dictionary mega batch did not return a job record.')
  return job
}

export function subscribeDictionaryMegaBatch(onJob) {
  const model = batchJobModel()
  if (!model?.onCreate || !model?.onUpdate) return () => {}
  const handle = (payload) => {
    const record = payload?.id ? payload : payload?.data
    const job = normalizeBatchJob(record)
    if (!job || job.type !== DICTIONARY_MEGA_BATCH_TYPE) return
    onJob(job)
  }
  const createSub = model.onCreate().subscribe({
    next: handle,
    error: (err) => console.error('BatchJob onCreate failed', err),
  })
  const updateSub = model.onUpdate().subscribe({
    next: handle,
    error: (err) => console.error('BatchJob onUpdate failed', err),
  })
  return () => {
    createSub.unsubscribe()
    updateSub.unsubscribe()
  }
}

export async function fetchWordDictionaryEntries(wordIds = []) {
  const ids = [...new Set((wordIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!ids.length) return []
  if (!client.models.Word) {
    throw new Error('The word catalog is still deploying. Wait for Amplify to finish, then try again.')
  }
  const results = await Promise.all(
    ids.map((id) =>
      client.models.Word.get({ id }, { selectionSet: ['id', 'word', 'dictionaryData'] }),
    ),
  )
  for (const result of results) throwIfErrors(result)
  return results
    .map((result) => result?.data)
    .filter((item) => item?.id)
    .map((item) => ({
      id: item.id,
      word: item.word,
      dictionaryData: item.dictionaryData,
    }))
}

export async function approveDataQualityFinding(finding, wordsByConceptId) {
  if (!finding?.id) throw new Error('Finding is required')
  const wordId = finding.wordId
  const action = String(finding.actionType || '').toUpperCase()

  if (action === 'SPELLING') {
    const next = String(finding.suggestedSpelling || '').trim()
    if (!wordId || !next) throw new Error('Finding is missing a word or suggested spelling.')
    if (!client.models.Word) {
      throw new Error('The word catalog is still deploying. Wait for Amplify to finish, then try again.')
    }
    throwIfErrors(await client.models.Word.update({ id: wordId, word: next }))
    throwIfErrors(
      await findingsModel().update({
        id: finding.id,
        status: 'APPROVED',
      }),
    )
    return
  }

  const conceptId = finding.recommendedConceptId
  if (!wordId || !conceptId) throw new Error('Finding is missing a word or concept.')

  const links = assignedConceptLinks(wordId, wordsByConceptId)
  const hasConcept = links.some((link) => link.conceptId === conceptId)

  if (action === 'ADD' && !hasConcept) {
    await saveWordConcepts({
      wordId,
      nextConceptIds: [...links.map((link) => link.conceptId), conceptId],
      currentLinks: links,
    })
  } else if (action === 'REMOVE' && hasConcept) {
    await saveWordConcepts({
      wordId,
      nextConceptIds: links.filter((link) => link.conceptId !== conceptId).map((link) => link.conceptId),
      currentLinks: links,
    })
  }

  throwIfErrors(
    await findingsModel().update({
      id: finding.id,
      status: 'APPROVED',
    }),
  )
}

export async function approveDataQualityFindings(findings, wordsByConceptId) {
  const rows = (findings ?? []).filter((item) => item?.id)
  for (const finding of rows) {
    await approveDataQualityFinding(finding, wordsByConceptId)
  }
  return rows.length
}

export async function rejectDataQualityFinding(finding) {
  if (!finding?.id) throw new Error('Finding is required')
  throwIfErrors(
    await findingsModel().update({
      id: finding.id,
      status: 'REJECTED',
    }),
  )
}

export async function rejectDataQualityFindings(findings) {
  const rows = (findings ?? []).filter((item) => item?.id)
  for (const finding of rows) {
    await rejectDataQualityFinding(finding)
  }
  return rows.length
}
