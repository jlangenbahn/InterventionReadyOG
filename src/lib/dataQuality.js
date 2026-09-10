/**
 * Data-quality audit client: run catalog mutations and sequential approve/reject.
 */
import { client } from './amplifyClient'
import { listAll } from './paginate'
import { assignedConceptLinks, saveWordConcepts } from './wordConcepts'
import { DICTIONARY_BATCH_LIMIT } from './dictionaryData'

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

async function runNamedMutation(name, fallbackMessage, args = {}) {
  const run = client.mutations?.[name]
  if (typeof run !== 'function') {
    throw new Error(`${fallbackMessage} is still deploying. Wait for Amplify to finish, then try again.`)
  }
  const result = await run(args)
  throwIfErrors(result)
  const data = result?.data ?? {}
  return {
    createdCount: Number(data.createdCount ?? 0),
    message: String(data.message || fallbackMessage),
  }
}

export async function fetchDataQualityFindings() {
  return listAll(findingsModel())
}

export async function runDataQualityAudit() {
  return runNamedMutation('runDataQualityAudit', 'Data quality audit')
}

export async function runSpellCheck() {
  return runNamedMutation('runSpellCheck', 'Spell check')
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
  return runNamedMutation('generateDictionaryDefinitions', 'Dictionary definition generation', {
    wordIds: ids,
  })
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
