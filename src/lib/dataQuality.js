/**
 * Data-quality audit client: placeholder mutation plus sequential approve.
 */
import { client } from './amplifyClient'
import { listAll } from './paginate'
import { assignedConceptLinks, saveWordConcepts } from './wordConcepts'

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

export async function fetchDataQualityFindings() {
  return listAll(findingsModel())
}

export async function runDataQualityAudit() {
  const runAudit = client.mutations?.runDataQualityAudit
  if (typeof runAudit !== 'function') {
    throw new Error('Data quality audit is still deploying. Wait for Amplify to finish, then try again.')
  }
  const result = await runAudit({})
  throwIfErrors(result)
  const data = result?.data ?? {}
  return {
    createdCount: Number(data.createdCount ?? 0),
    message: String(data.message || 'Audit finished.'),
  }
}

export async function approveDataQualityFinding(finding, wordsByConceptId) {
  if (!finding?.id) throw new Error('Finding is required')
  const wordId = finding.wordId
  const conceptId = finding.recommendedConceptId
  if (!wordId || !conceptId) throw new Error('Finding is missing a word or concept.')

  const links = assignedConceptLinks(wordId, wordsByConceptId)
  const hasConcept = links.some((link) => link.conceptId === conceptId)
  const action = String(finding.actionType || '').toUpperCase()

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
