import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePhase5ContextEvidence } from './phase5-context-audit-core.mjs'
import { analyzeTransportThermalPolicyReview } from './phase5-transport-policy-review.mjs'

function log(id, outfitId, overrides = {}) {
  return {
    id,
    outfitId,
    wornOn: '2026-01-01',
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

test('adds baseline-compatible and inferred-return sensitivity transport thermal passes', () => {
  const result = analyzePhase5ContextEvidence([
    log('walk-24', 'outfit-a', {
      tempOut: 24,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      transportModeId: 'walk',
      placeId: 'cafe',
    }),
    log('car-28', 'outfit-a', {
      tempOut: 28,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      transportModeId: 'car',
      placeId: 'cafe',
    }),
    log('car-33', 'outfit-a', {
      tempOut: 33,
      tempBack: 35,
      tempBackInferred: true,
      feelingOut: 'ok',
      feelingBack: 'ok',
      transportModeId: 'car',
      placeId: 'cafe',
    }),
  ])

  const baseline = result.transportThermal.baselineCompatible
  const confidence = result.transportThermal.higherConfidence
  assert.equal(baseline.dataAvailability.thermalObservationCount, 4)
  assert.equal(confidence.dataAvailability.thermalObservationCount, 3)
  assert.equal(
    baseline.rangeBorrowing.find((entry) => entry.threshold === 1)
      .overallHighEndpointBorrowedFromOtherTransport,
    1,
  )
  assert.equal(
    confidence.rangeBorrowing.find((entry) => entry.threshold === 1)
      .overallHighEndpointBorrowedFromOtherTransport,
    1,
  )
})

test('reports same-Place and different-Place cross-Transport conflicts separately', () => {
  const result = analyzePhase5ContextEvidence([
    log('walk-ok', 'outfit-a', {
      tempOut: 30,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      transportModeId: 'walk',
      placeId: 'same',
    }),
    log('car-hot-same', 'outfit-a', {
      tempOut: 31,
      tempBack: null,
      feelingOut: 'hot',
      feelingBack: null,
      transportModeId: 'car',
      placeId: 'same',
    }),
    log('bus-cold-different', 'outfit-a', {
      tempOut: 29,
      tempBack: null,
      feelingOut: 'cold',
      feelingBack: null,
      transportModeId: 'bus',
      placeId: 'different',
    }),
  ])

  const conflicts = result.transportThermal.baselineCompatible
    .crossTransportConflicts
  assert.equal(conflicts.samePlace, 1)
  assert.equal(conflicts.differentPlace, 2)
  assert.equal(conflicts.oneOrBothPlacesNull, 0)
})

test('applies distinct current-Transport Wear Log thresholds to range and warning borrowing', () => {
  const result = analyzePhase5ContextEvidence([
    log('walk-1', 'outfit-a', {
      tempOut: 24,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      transportModeId: 'walk',
    }),
    log('walk-2', 'outfit-a', {
      tempOut: 25,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      transportModeId: 'walk',
    }),
    log('walk-3', 'outfit-a', {
      tempOut: 26,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      transportModeId: 'walk',
    }),
    log('car-cold', 'outfit-a', {
      tempOut: 20,
      tempBack: null,
      feelingOut: 'cold',
      feelingBack: null,
      transportModeId: 'car',
    }),
    log('car-hot', 'outfit-a', {
      tempOut: 30,
      tempBack: null,
      feelingOut: 'hot',
      feelingBack: null,
      transportModeId: 'car',
    }),
  ])

  const baseline = result.transportThermal.baselineCompatible
  assert.deepEqual(
    baseline.dataAvailability.transportGroupThresholds.map((entry) => [
      entry.threshold,
      entry.groups,
    ]),
    [
      [1, 2],
      [2, 2],
      [3, 1],
    ],
  )
  assert.deepEqual(
    baseline.warningBorrowing.map((entry) => [
      entry.threshold,
      entry.coldWarningBoundaryBorrowedOnlyFromOtherTransport,
      entry.hotWarningBoundaryBorrowedOnlyFromOtherTransport,
    ]),
    [
      [1, 1, 1],
      [2, 1, 1],
      [3, 1, 1],
    ],
  )
})

test('reviews same-Place range and warning borrowing at thresholds 1, 2, and 3', () => {
  const logs = [
    log('walk-24', 'outfit-a', {
      tempOut: 24,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'walk',
    }),
    log('car-28', 'outfit-a', {
      tempOut: 28,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'car',
    }),
    log('car-33', 'outfit-a', {
      tempOut: 33,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'car',
    }),
    log('car-cold', 'outfit-a', {
      tempOut: 20,
      tempBack: null,
      feelingOut: 'cold',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'car',
    }),
    log('car-hot', 'outfit-a', {
      tempOut: 30,
      tempBack: null,
      feelingOut: 'hot',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'car',
    }),
  ]
  const result = analyzeTransportThermalPolicyReview(logs)
  const baseline = result.publicReport.baselineCompatible

  assert.deepEqual(baseline.samePlaceCounts, [
    {
      threshold: 1,
      highEndpoint: 1,
      lowEndpoint: 1,
      coldWarning: 1,
      hotWarning: 1,
      totalCases: 4,
    },
    {
      threshold: 2,
      highEndpoint: 0,
      lowEndpoint: 1,
      coldWarning: 0,
      hotWarning: 0,
      totalCases: 1,
    },
    {
      threshold: 3,
      highEndpoint: 0,
      lowEndpoint: 1,
      coldWarning: 0,
      hotWarning: 0,
      totalCases: 1,
    },
  ])
  assert.deepEqual(baseline.policySimulation.affectedPairCounts, {
    'report-only': 0,
    'weak-1-strong-2': 2,
    'minimum-2': 1,
    'exact-context-only': 1,
  })
})

test('keeps private labels out of the committed public review and is deterministic', () => {
  const logs = [
    log('walk-24', 'outfit-a', {
      tempOut: 24,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'walk',
    }),
    log('car-33', 'outfit-a', {
      tempOut: 33,
      tempBack: null,
      feelingOut: 'ok',
      feelingBack: null,
      placeId: 'cafe',
      transportModeId: 'car',
    }),
  ]
  const labels = {
    outfit: { 'outfit-a': ' recognizable outfit ' },
    place: { cafe: 'private cafe' },
    transport: { walk: 'Walk', car: 'Car' },
  }
  const forward = analyzeTransportThermalPolicyReview(logs, labels)
  const reverse = analyzeTransportThermalPolicyReview([...logs].reverse(), labels)

  assert.deepEqual(forward, reverse)
  assert.equal(
    JSON.stringify(forward.publicReport).includes('private cafe'),
    false,
  )
  assert.equal(
    forward.privateReview.baselineCompatible.some(
      (entry) => entry.place === 'private cafe',
    ),
    true,
  )
})
