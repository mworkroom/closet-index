import { describe, expect, it } from 'vitest'
import { phase5BaselineWearLog } from './fixtures/phase5-recommendation-baseline'
import {
  compareTransportTaxonomyModels,
  TEST_TRANSPORT_BUCKETS,
  type TransportTaxonomyCandidate,
} from './transport-taxonomy-simulation.mjs'
import type { WearLog } from './types'

const HISTORICAL_WALK = 'transport-walk'
const CAR = 'transport-car'

function wear(
  id: string,
  outfitId: string,
  temperature: number | null,
  transportModeId: string | null,
  overrides: Partial<WearLog> = {},
) {
  return phase5BaselineWearLog(id, outfitId, '2026-07-01', {
    tempOut: temperature,
    tempBack: null,
    feelingOut: temperature === null ? null : 'ok',
    feelingBack: null,
    placeId: 'place-cafe',
    transportModeId,
    ...overrides,
  })
}

function candidate(
  id: string,
  baselineOrder: number,
  logs: WearLog[],
): TransportTaxonomyCandidate {
  return { id, baselineOrder, level: 'high', logs }
}

function compare(
  candidates: TransportTaxonomyCandidate[],
  overrides: Partial<Parameters<typeof compareTransportTaxonomyModels>[0]> = {},
) {
  return compareTransportTaxonomyModels({
    candidates,
    input: {
      tempOut: 33,
      tempBack: null,
      placeId: 'place-cafe',
      transportModeId: HISTORICAL_WALK,
    },
    splitTransportModeId: TEST_TRANSPORT_BUCKETS.walkShort,
    historicalWalkModeId: HISTORICAL_WALK,
    carModeId: CAR,
    ...overrides,
  })
}

describe('test-only Transport taxonomy simulation', () => {
  it('preserves the original mixed Walk fixture to expose the unsplit ambiguity', () => {
    const borrowed = candidate('borrowed', 0, [
      wear('walk-24', 'borrowed', 24, HISTORICAL_WALK),
      wear('car-28', 'borrowed', 28, CAR),
      wear('car-33', 'borrowed', 33, CAR),
    ])
    const supported = candidate('supported', 1, [
      wear('walk-33', 'supported', 33, HISTORICAL_WALK),
    ])
    const result = compare([borrowed, supported], {
      walkClassificationByWearLogId: {
        'walk-24': TEST_TRANSPORT_BUCKETS.walkShort,
        'walk-33': TEST_TRANSPORT_BUCKETS.walkShort,
      },
    })

    expect(result.model0.topSixOrder).toEqual(['borrowed', 'supported'])
    expect(result.model1.topSixOrder).toEqual(['supported', 'borrowed'])
    expect(result.model1.candidates.find((entry) => entry.id === 'borrowed')).toMatchObject({
      currentTransportDistinctWearLogCount: 1,
      borrowedOnly: true,
      directlyAdjusted: true,
      confidence: 'transport-weak',
    })
  })

  it('keeps Car support outside the walk_short evidence bucket', () => {
    const result = compare([
      candidate('short', 0, [
        wear('short-24', 'short', 24, HISTORICAL_WALK),
        wear('car-28', 'short', 28, CAR),
        wear('car-33', 'short', 33, CAR),
      ]),
    ], {
      walkClassificationByWearLogId: {
        'short-24': TEST_TRANSPORT_BUCKETS.walkShort,
      },
    })
    const split = result.model2.candidates[0]

    expect(split.overallRange).toEqual({ min: 22, max: 35 })
    expect(split.currentTransportRange).toEqual({ min: 22, max: 26 })
    expect(split.currentTransportDistinctWearLogCount).toBe(1)
    expect(split.borrowedOnly).toBe(true)
    expect(split.directlyAdjusted).toBe(true)
    expect(split.matchedWearLogIds.currentTransport).toEqual(['short-24'])
  })

  it('uses only sustained observations for walk_sustained support', () => {
    const result = compare([
      candidate('sustained', 0, [
        wear('sustained-29', 'sustained', 29, HISTORICAL_WALK),
        wear('sustained-31', 'sustained', 31, HISTORICAL_WALK),
        wear('short-35', 'sustained', 35, HISTORICAL_WALK),
      ]),
    ], {
      input: {
        tempOut: 33,
        tempBack: null,
        placeId: 'place-cafe',
        transportModeId: HISTORICAL_WALK,
      },
      splitTransportModeId: TEST_TRANSPORT_BUCKETS.walkSustained,
      walkClassificationByWearLogId: {
        'sustained-29': TEST_TRANSPORT_BUCKETS.walkSustained,
        'sustained-31': TEST_TRANSPORT_BUCKETS.walkSustained,
        'short-35': TEST_TRANSPORT_BUCKETS.walkShort,
      },
    })
    const split = result.model2.candidates[0]

    expect(split.currentTransportDistinctWearLogCount).toBe(2)
    expect(split.currentTransportRange).toEqual({ min: 27, max: 33 })
    expect(split.overallRange).toEqual({ min: 27, max: 37 })
    expect(split.borrowedOnly).toBe(false)
    expect(split.matchedWearLogIds.currentTransport).toEqual([
      'sustained-29',
      'sustained-31',
    ])
  })

  it('keeps a new walk_short bucket unknown when only Car and sustained history exists', () => {
    const result = compare([
      candidate('cold-start', 0, [
        wear('sustained-30', 'cold-start', 30, HISTORICAL_WALK),
        wear('car-33', 'cold-start', 33, CAR),
      ]),
    ], {
      walkClassificationByWearLogId: {
        'sustained-30': TEST_TRANSPORT_BUCKETS.walkSustained,
      },
    })
    const split = result.model2.candidates[0]

    expect(split.currentTransportDistinctWearLogCount).toBe(0)
    expect(split.currentTransportRange).toBeNull()
    expect(split.status).toBe('unknown')
    expect(split.directlyAdjusted).toBe(false)
  })

  it('keeps the Car-to-cinema fixture unchanged by the Walk split', () => {
    const candidates = [
      candidate('warm-layer', 0, [wear('car-warm', 'warm-layer', 33, CAR)]),
      candidate('light', 1, [wear('car-light', 'light', 33, CAR)]),
    ]
    const result = compare(candidates, {
      input: {
        tempOut: 33,
        tempBack: null,
        placeId: 'place-cinema',
        transportModeId: CAR,
      },
      splitTransportModeId: TEST_TRANSPORT_BUCKETS.car,
    })

    expect(result.model0.fullOrder).toEqual(['warm-layer', 'light'])
    expect(result.model1.fullOrder).toEqual(result.model0.fullOrder)
    expect(result.model2.fullOrder).toEqual(result.model0.fullOrder)
    expect(result.model2.directlyAdjustedOutfitCount).toBe(0)
  })

  it('keeps Place null, Transport null, and historical null Transport distinct', () => {
    const logs = [
      wear('short-30', 'candidate', 30, HISTORICAL_WALK),
      wear('null-33', 'candidate', 33, null),
    ]
    const classifications = {
      'short-30': TEST_TRANSPORT_BUCKETS.walkShort,
    }
    const noPlace = compare([candidate('candidate', 0, logs)], {
      input: {
        tempOut: 33,
        tempBack: null,
        placeId: null,
        transportModeId: HISTORICAL_WALK,
      },
      walkClassificationByWearLogId: classifications,
    }).model2.candidates[0]
    const noTransport = compare([candidate('candidate', 0, logs)], {
      input: {
        tempOut: 33,
        tempBack: null,
        placeId: 'place-cafe',
        transportModeId: null,
      },
      splitTransportModeId: null,
      walkClassificationByWearLogId: classifications,
    }).model2.candidates[0]

    expect(noPlace.currentTransportDistinctWearLogCount).toBe(1)
    expect(noPlace.exactContextDistinctWearLogCount).toBe(0)
    expect(noPlace.matchedWearLogIds.currentTransport).toEqual(['short-30'])
    expect(noTransport.currentTransportDistinctWearLogCount).toBe(0)
    expect(noTransport.directlyAdjusted).toBe(false)
  })

  it('reports inferred-return-only effects without changing classification buckets', () => {
    const result = compare([
      candidate('inferred', 0, [
        wear('short-24', 'inferred', 24, HISTORICAL_WALK),
        wear('car-inferred', 'inferred', 28, CAR, {
          tempBack: 33,
          tempBackInferred: true,
          feelingBack: 'ok',
        }),
      ]),
    ], {
      walkClassificationByWearLogId: {
        'short-24': TEST_TRANSPORT_BUCKETS.walkShort,
      },
    })

    expect(result.model2.candidates[0].inferredReturnAffected).toBe(true)
    expect(result.model2.candidates[0].matchedWearLogIds.currentTransport).toEqual([
      'short-24',
    ])
  })

  it('is deterministic and never counts one matched Wear Log ID twice', () => {
    const duplicated = wear('short-24', 'a', 24, HISTORICAL_WALK, {
      tempBack: 24,
      feelingBack: 'ok',
    })
    const a = candidate('a', 0, [duplicated, duplicated])
    const b = candidate('b', 1, [wear('short-33', 'b', 33, HISTORICAL_WALK)])
    const options = {
      walkClassificationByWearLogId: {
        'short-24': TEST_TRANSPORT_BUCKETS.walkShort,
        'short-33': TEST_TRANSPORT_BUCKETS.walkShort,
      },
    }

    const forward = compare([a, b], options)
    const reversed = compare([
      { ...b, logs: [...b.logs].reverse() },
      { ...a, logs: [...a.logs].reverse() },
    ], options)
    expect(reversed).toEqual(forward)
    expect(
      forward.model2.candidates.find((entry) => entry.id === 'a')?.matchedWearLogIds
        .currentTransport,
    ).toEqual(['short-24'])
    expect(
      forward.model2.candidates.find((entry) => entry.id === 'a')
        ?.currentTransportDistinctWearLogCount,
    ).toBe(1)
  })

  it('remaps only explicitly confirmed decisions and leaves review outcomes unclassified', () => {
    const result = compare([
      candidate('reviewed', 0, [
        wear('confirmed-short', 'reviewed', 33, HISTORICAL_WALK),
        wear('confirmed-sustained', 'reviewed', 31, HISTORICAL_WALK),
        wear('ambiguous', 'reviewed', 30, HISTORICAL_WALK),
        wear('not-relevant', 'reviewed', 29, HISTORICAL_WALK),
        wear('not-reviewed', 'reviewed', 28, HISTORICAL_WALK),
      ]),
    ], {
      walkClassificationByWearLogId: {
        'confirmed-short': 'walk_short',
        'confirmed-sustained': 'walk_sustained',
        ambiguous: 'ambiguous',
        'not-relevant': 'not relevant',
      },
    })
    const split = result.model2.candidates[0]

    expect(split.currentTransportDistinctWearLogCount).toBe(1)
    expect(split.exactContextDistinctWearLogCount).toBe(1)
    expect(split.matchedWearLogIds.currentTransport).toEqual([
      'confirmed-short',
    ])
    expect(split.matchedWearLogIds.overall).toEqual([
      'ambiguous',
      'confirmed-short',
      'confirmed-sustained',
      'not-relevant',
      'not-reviewed',
    ])
  })
})
