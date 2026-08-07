import { describe, expect, it } from 'vitest'
import {
  phase5BaselineOutfit,
  phase5BaselineWearLog,
  phase5RecommendationBaselineFixture,
} from './fixtures/phase5-recommendation-baseline'
import { partitionRecommendations, recommendOutfits } from './recommendation'
import type { AppData, RecommendationInput, WearLog } from './types'

const walkInput: RecommendationInput = {
  tempOut: 33,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-cafe',
  transportModeId: 'transport-walk',
}

function wear(
  id: string,
  outfitId: string,
  temperature: number,
  transportModeId: string | null,
  overrides: Partial<WearLog> = {},
) {
  return phase5BaselineWearLog(id, outfitId, '2026-06-01', {
    tempOut: temperature,
    tempBack: null,
    feelingOut: 'ok',
    feelingBack: null,
    placeId: 'place-cafe',
    transportModeId,
    ...overrides,
  })
}

function policyFixture(): AppData {
  return {
    ...phase5RecommendationBaselineFixture,
    outfits: [
      phase5BaselineOutfit('borrowed-favorite', 'favorite'),
      phase5BaselineOutfit('supported-ok', 'ok'),
      phase5BaselineOutfit('unknown-unrated', null),
    ],
    wearLogs: [
      wear('borrowed-walk-24', 'borrowed-favorite', 24, 'transport-walk'),
      wear('borrowed-car-28', 'borrowed-favorite', 28, 'transport-car'),
      wear('borrowed-car-33', 'borrowed-favorite', 33, 'transport-car'),
      wear('supported-walk-33', 'supported-ok', 33, 'transport-walk'),
      wear('unknown-car-33', 'unknown-unrated', 33, 'transport-car'),
    ],
  }
}

describe('disabled HOME Transport thermal Policy B integration', () => {
  it('keeps results and groups deeply equal when the feature is omitted or false', () => {
    const data = policyFixture()
    const implicit = recommendOutfits(data, walkInput)
    const explicitDisabled = recommendOutfits(data, walkInput, {
      enableTransportThermalPolicyB: false,
    })

    expect(explicitDisabled).toEqual(implicit)
    expect(partitionRecommendations(explicitDisabled)).toEqual(
      partitionRecommendations(implicit),
    )
  })

  it('deprioritizes borrowed-only evidence without changing result content', () => {
    const data = policyFixture()
    const baseline = recommendOutfits(data, walkInput)
    const policyB = recommendOutfits(data, walkInput, {
      enableTransportThermalPolicyB: true,
    })

    expect(baseline.map((result) => result.outfit.id)).toEqual([
      'borrowed-favorite',
      'supported-ok',
      'unknown-unrated',
    ])
    expect(policyB.map((result) => result.outfit.id)).toEqual([
      'supported-ok',
      'unknown-unrated',
      'borrowed-favorite',
    ])
    expect(policyB).toHaveLength(baseline.length)

    const baselineById = new Map(
      baseline.map((result) => [result.outfit.id, result]),
    )
    for (const result of policyB) {
      expect(result).toEqual(baselineById.get(result.outfit.id))
    }
  })

  it('does not penalize the 33°C fixture when current Transport changes to Car', () => {
    const data = policyFixture()
    const carInput = { ...walkInput, transportModeId: 'transport-car' }

    expect(
      recommendOutfits(data, carInput, {
        enableTransportThermalPolicyB: true,
      }),
    ).toEqual(recommendOutfits(data, carInput))
  })

  it('keeps missing current Transport unknown and preserves baseline order', () => {
    const data = policyFixture()
    const missingTransport = { ...walkInput, transportModeId: null }

    expect(
      recommendOutfits(data, missingTransport, {
        enableTransportThermalPolicyB: true,
      }),
    ).toEqual(recommendOutfits(data, missingTransport))
  })

  it('never moves a penalized candidate across recommendation levels', () => {
    const data = policyFixture()
    const caution = {
      ...phase5BaselineOutfit('borrowed-caution', 'favorite'),
      itemIds: ['item-caution-shoe'],
    }
    const cautionData: AppData = {
      ...data,
      items: [
        ...data.items,
        {
          ...data.items[0],
          id: 'item-caution-shoe',
          name: '오래 걷기 부적합 신발',
          category: 'Shoes',
          longWalkOk: false,
        },
      ],
      outfits: [...data.outfits, caution],
      wearLogs: [
        ...data.wearLogs,
        wear('caution-walk-24', caution.id, 24, 'transport-walk'),
        wear('caution-car-33', caution.id, 33, 'transport-car'),
      ],
    }
    const longWalkInput = { ...walkInput, longWalkCondition: 'yes' as const }

    const baseline = recommendOutfits(cautionData, longWalkInput)
    const policyB = recommendOutfits(cautionData, longWalkInput, {
      enableTransportThermalPolicyB: true,
    })
    const baselineLevels = Object.fromEntries(
      baseline.map((result) => [result.outfit.id, result.level]),
    )

    expect(
      Object.fromEntries(
        policyB.map((result) => [result.outfit.id, result.level]),
      ),
    ).toEqual(baselineLevels)
    expect(policyB.findIndex((result) => result.level === 'caution')).toBe(
      baseline.findIndex((result) => result.level === 'caution'),
    )
    expect(policyB.at(-1)?.outfit.id).toBe('borrowed-caution')
  })
})
