import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeTransportTaxonomyCoverage } from './phase5-transport-taxonomy-audit.mjs'

function log(id, outfitId, wornOn, overrides = {}) {
  return {
    id,
    outfitId,
    wornOn,
    placeId: 'place-starbucks-a',
    transportModeId: 'transport-walk',
    tempOut: 30,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: 'ok',
    feelingBack: null,
    ...overrides,
  }
}

const outfits = [{ id: 'outfit-a' }, { id: 'outfit-b' }]
const places = [
  { id: 'place-starbucks-a', name: '스타벅스 가까운점' },
  { id: 'place-starbucks-b', name: 'Starbucks 다른점' },
  { id: 'place-cgv', name: 'CGV 영화관' },
]
const transports = [
  { id: 'transport-walk', name: '도보', active: true },
  { id: 'transport-car', name: '차', active: true },
  { id: 'transport-bus', name: '버스', active: false },
]
const labels = {
  outfit: { 'outfit-a': '개인 착장 A', 'outfit-b': '개인 착장 B' },
}

test('audits distinct historical Walk records without exposing private labels', () => {
  const duplicated = log('walk-a', 'outfit-a', '2026-07-01')
  const result = analyzeTransportTaxonomyCoverage(
    [
      duplicated,
      duplicated,
      log('walk-b', 'outfit-a', '2026-07-02', {
        tempOut: 33,
        tempBack: 31,
        tempBackInferred: true,
        feelingBack: 'hot',
      }),
      log('car-cgv', 'outfit-b', '2026-08-01', {
        placeId: 'place-cgv',
        transportModeId: 'transport-car',
      }),
      log('walk-null-place', 'outfit-b', '2026-01-01', { placeId: null }),
    ],
    outfits,
    places,
    transports,
    labels,
  )

  assert.equal(result.publicReport.historicalWalk.distinctWearLogCount, 3)
  assert.equal(result.publicReport.historicalWalk.distinctOutfitCount, 2)
  assert.equal(result.publicReport.historicalWalk.nullPlaceDistinctWearLogCount, 1)
  assert.equal(result.publicReport.historicalWalk.inferredReturnDistinctWearLogCount, 1)
  assert.deepEqual(result.publicReport.activeTransportModes, [
    { name: '도보', distinctWearLogCount: 3 },
    { name: '차', distinctWearLogCount: 1 },
  ])
  assert.equal(JSON.stringify(result.publicReport).includes('스타벅스 가까운점'), false)
  assert.equal(JSON.stringify(result.publicReport).includes('개인 착장 A'), false)
  assert.deepEqual(result.privateReview.plausibleStarbucksLabels, [
    '스타벅스 가까운점',
    'Starbucks 다른점',
  ])
  assert.deepEqual(result.privateReview.nearbyStarbucksByPlace[0], {
    place: '스타벅스 가까운점',
    firstWornOn: '2026-07-01',
    lastWornOn: '2026-07-02',
    distinctWearLogCount: 2,
    distinctOutfitCount: 1,
    byYear: { 2026: 2 },
    juneThroughAugustDistinctWearLogCount: 2,
    tempOutAtLeast28DistinctWearLogCount: 2,
    tempOutAtLeast30DistinctWearLogCount: 2,
    currentWalkDistinctWearLogCount: 2,
    otherTransportDistinctWearLogCount: 0,
    exactGroupThresholds: [
      { threshold: 1, groups: 1 },
      { threshold: 2, groups: 1 },
      { threshold: 3, groups: 0 },
    ],
    exactGroups: [
      {
        outfit: '개인 착장 A',
        place: '스타벅스 가까운점',
        transport: '도보',
        distinctWearLogCount: 2,
        wornOn: ['2026-07-01', '2026-07-02'],
      },
    ],
  })
  assert.equal(
    result.privateReview.nearbyHotWeatherWalkClassificationRows.length,
    2,
  )
  assert.equal(
    result.privateReview.nearbyHotWeatherWalkClassificationRows[0].decision,
    '',
  )
})

test('reports Starbucks threshold zero as the full Outfit Place Transport universe', () => {
  const result = analyzeTransportTaxonomyCoverage(
    [
      log('walk-a', 'outfit-a', '2025-07-01'),
      log('walk-b', 'outfit-a', '2026-07-02'),
      log('car-a', 'outfit-b', '2026-05-01', {
        transportModeId: 'transport-car',
        tempOut: 27,
      }),
    ],
    outfits,
    places,
    transports,
    labels,
  )
  const nearby = result.publicReport.nearbyStarbucks

  assert.deepEqual(nearby.byYear, { 2025: 1, 2026: 2 })
  assert.equal(nearby.juneThroughAugustDistinctWearLogCount, 2)
  assert.equal(nearby.tempOutAtLeast28DistinctWearLogCount, 2)
  assert.equal(nearby.tempOutAtLeast30DistinctWearLogCount, 2)
  assert.equal(nearby.currentWalkDistinctWearLogCount, 2)
  assert.equal(nearby.otherTransportDistinctWearLogCount, 1)
  assert.deepEqual(nearby.exactGroupThresholds, [
    { threshold: 0, groups: 8, zeroEvidenceGroups: 6 },
    { threshold: 1, groups: 2, zeroEvidenceGroups: 0 },
    { threshold: 2, groups: 1, zeroEvidenceGroups: 0 },
    { threshold: 3, groups: 0, zeroEvidenceGroups: 0 },
  ])
  assert.equal(nearby.confirmedWalkShortDistinctWearLogCount, 0)
})

test('recognizes approved short and sustained labels after the manual transition', () => {
  const approvedTransports = [
    { id: 'transport-walk-short', name: '도보 · 근거리', active: true },
    { id: 'transport-walk-sustained', name: '도보 · 지속', active: true },
    { id: 'transport-car', name: '차', active: true },
  ]
  const result = analyzeTransportTaxonomyCoverage(
    [
      log('short-a', 'outfit-a', '2026-07-01', {
        transportModeId: 'transport-walk-short',
      }),
      log('sustained-a', 'outfit-b', '2026-07-02', {
        transportModeId: 'transport-walk-sustained',
      }),
    ],
    outfits,
    places,
    approvedTransports,
    labels,
  )

  assert.equal(result.publicReport.historicalWalk.matchingModeCount, 2)
  assert.equal(result.publicReport.historicalWalk.distinctWearLogCount, 2)
  assert.equal(
    result.publicReport.nearbyStarbucks.confirmedWalkShortDistinctWearLogCount,
    1,
  )
  assert.deepEqual(result.publicReport.activeTransportModes, [
    { name: '도보 · 근거리', distinctWearLogCount: 1 },
    { name: '도보 · 지속', distinctWearLogCount: 1 },
    { name: '차', distinctWearLogCount: 0 },
  ])
})
