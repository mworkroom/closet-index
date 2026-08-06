import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePhase5ContextEvidence } from './phase5-context-audit-core.mjs'

function log(id, outfitId, overrides = {}) {
  return {
    id,
    outfitId,
    placeId: 'place-a',
    transportModeId: 'transport-a',
    tempOut: 20,
    tempBack: 20,
    tempBackInferred: false,
    feelingOut: 'ok',
    feelingBack: 'ok',
    ...overrides,
  }
}

test('counts distinct Wear Logs and not duplicated relation-shaped rows', () => {
  const duplicated = log('same-log', 'outfit-a')
  const result = analyzePhase5ContextEvidence([duplicated, duplicated])

  assert.equal(result.input.sourceRows, 2)
  assert.equal(result.input.distinctWearLogs, 1)
  assert.equal(result.input.duplicateWearLogRowsIgnored, 1)
  assert.deepEqual(
    result.exactOutfitPlaceTransport.repetitionDistribution,
    { 1: 1 },
  )
})

test('reports completeness and exact versus Outfit plus Place distributions', () => {
  const result = analyzePhase5ContextEvidence([
    log('a-1', 'outfit-a'),
    log('a-2', 'outfit-a', { transportModeId: null }),
    log('a-3', 'outfit-a', { placeId: null }),
    log('b-1', 'outfit-b'),
    log('b-2', 'outfit-b'),
  ])

  assert.equal(result.completeness.placePresent.count, 4)
  assert.equal(result.completeness.transportPresent.count, 4)
  assert.equal(result.completeness.placeAndTransportPresent.count, 3)
  assert.deepEqual(
    result.exactOutfitPlaceTransport.repetitionDistribution,
    { 1: 1, 2: 1 },
  )
  assert.deepEqual(result.outfitPlace.repetitionDistribution, { 2: 2 })
  assert.equal(
    result.exactOutfitPlaceTransport.thresholds.find(
      (entry) => entry.threshold === 2,
    ).groups,
    1,
  )
})

test('distinguishes success, issue, unknown, cold, hot, and current error rating', () => {
  const result = analyzePhase5ContextEvidence(
    [
      log('success', 'outfit-error'),
      log('cold', 'outfit-error', { feelingOut: 'cold', feelingBack: null }),
      log('hot', 'outfit-error', { feelingOut: null, feelingBack: 'hot' }),
      log('unknown', 'outfit-error', { feelingOut: null, feelingBack: null }),
    ],
    [{ id: 'outfit-error', rating: 'error' }],
  )

  assert.deepEqual(result.exactOutfitPlaceTransport.repeatedOutcomeCases, [
    {
      caseId: 'case-001',
      wearLogCount: 4,
      successCount: 1,
      issueCount: 2,
      unknownCount: 1,
      coldCount: 1,
      hotCount: 1,
      currentOutfitRatedError: true,
    },
  ])
})

test('detects context information that total Outfit wear count cannot express', () => {
  const result = analyzePhase5ContextEvidence([
    log('a-1', 'outfit-a'),
    log('a-2', 'outfit-a'),
    log('b-1', 'outfit-b'),
    log('b-2', 'outfit-b', {
      placeId: 'place-b',
      transportModeId: 'transport-b',
    }),
  ])

  assert.equal(
    result.contextDistinctness.totalWearCountCohortsWithAtLeastTwoOutfits,
    1,
  )
  assert.equal(
    result.contextDistinctness.cohortsWithDifferentMaxExactContextCounts,
    1,
  )
  assert.equal(
    result.contextDistinctness.providesInformationDistinctFromTotalWearCount,
    true,
  )
})
