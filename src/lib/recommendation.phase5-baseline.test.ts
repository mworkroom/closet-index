import { describe, expect, it } from 'vitest'
import {
  phase5BaselineExpectedResults,
  phase5BaselineOutfit,
  phase5BaselineWearLog,
  phase5RecommendationBaselineFixture,
} from './fixtures/phase5-recommendation-baseline'
import { recommendOutfits } from './recommendation'
import type { AppData, RecommendationInput } from './types'

const input: RecommendationInput = {
  tempOut: 20,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'place-a',
  transportModeId: 'transport-a',
}

function summarize(data: AppData, nextInput: RecommendationInput = input) {
  return recommendOutfits(data, nextInput).map((result) => ({
    id: result.outfit.id,
    level: result.level,
    reasons: result.reasons,
    warnings: result.warnings,
    okRange: result.okRange,
    okObservationCount: result.okObservationCount,
    wearCount: result.wearCount,
    lastWornOn: result.lastWornOn,
  }))
}

describe('Phase 5 pre-change recommendation baseline', () => {
  it('freezes the complete current result order and explanation payload', () => {
    expect(summarize(phase5RecommendationBaselineFixture)).toEqual(
      phase5BaselineExpectedResults,
    )
  })

  it.each([
    { temp: 18, level: 'high' },
    { temp: 22, level: 'high' },
    { temp: 16, level: 'possible' },
    { temp: 24, level: 'possible' },
    { temp: 15, level: 'caution' },
    { temp: 25, level: 'caution' },
  ] as const)('freezes the single-OK temperature boundary at $temp°C', ({ temp, level }) => {
    const data: AppData = {
      ...structuredClone(phase5RecommendationBaselineFixture),
      outfits: [phase5BaselineOutfit('boundary', 'ok')],
      wearLogs: [phase5BaselineWearLog('boundary-1', 'boundary', '2026-01-01')],
    }

    expect(
      recommendOutfits(data, { ...input, tempOut: temp })[0]?.level,
    ).toBe(level)
  })

  it('freezes departure and return endpoint warnings independently', () => {
    const data: AppData = {
      ...structuredClone(phase5RecommendationBaselineFixture),
      outfits: [phase5BaselineOutfit('endpoints', 'ok')],
      wearLogs: [
        phase5BaselineWearLog('cold', 'endpoints', '2026-01-01', {
          tempOut: 20,
          tempBack: 15,
          feelingOut: 'ok',
          feelingBack: 'cold',
        }),
        phase5BaselineWearLog('hot', 'endpoints', '2026-02-01', {
          tempOut: 28,
          tempBack: null,
          feelingOut: 'hot',
          feelingBack: null,
        }),
      ],
    }

    const result = recommendOutfits(data, {
      ...input,
      tempOut: 28,
      tempBack: 14,
    })[0]

    expect(result.level).toBe('caution')
    expect(result.warnings).toEqual([
      '출발 28°C — 28°C에서 더웠던 기록 있음',
      '귀가 14°C — 15°C에서 추웠던 기록 있음',
    ])
  })

  it('freezes temp_back_inferred as ordinary endpoint evidence', () => {
    const data: AppData = {
      ...structuredClone(phase5RecommendationBaselineFixture),
      outfits: [phase5BaselineOutfit('inferred', 'ok')],
      wearLogs: [
        phase5BaselineWearLog('inferred-1', 'inferred', '2026-01-01', {
          tempOut: null,
          tempBack: 15,
          tempBackInferred: true,
          feelingOut: null,
          feelingBack: 'cold',
        }),
      ],
    }

    const result = recommendOutfits(data, {
      ...input,
      tempOut: 18,
      tempBack: 14,
    })[0]

    expect(result.warnings).toContain(
      '귀가 14°C — 15°C에서 추웠던 기록 있음',
    )
  })

  it('counts a Wear Log with missing temperatures but excludes it from temperature observations', () => {
    const result = recommendOutfits(phase5RecommendationBaselineFixture, input).find(
      (entry) => entry.outfit.id === 'outfit-ok-many',
    )

    expect(result?.wearCount).toBe(3)
    expect(result?.okObservationCount).toBe(2)
    expect(result?.lastWornOn).toBe('2026-04-01')
  })

  it('does not create Place or Transport reasons when the current values are missing', () => {
    const result = recommendOutfits(phase5RecommendationBaselineFixture, {
      ...input,
      placeId: null,
      transportModeId: null,
    }).find((entry) => entry.outfit.id === 'outfit-ok-many')

    expect(result?.reasons).not.toContain(
      expect.stringContaining('같은 장소에서'),
    )
    expect(result?.reasons).not.toContain(
      expect.stringContaining('같은 교통수단으로'),
    )
  })

  it('does not count historical missing Place or Transport as a match', () => {
    const result = recommendOutfits(phase5RecommendationBaselineFixture, input).find(
      (entry) => entry.outfit.id === 'outfit-ok-many',
    )

    expect(result?.reasons).toContain('같은 장소에서 2회 착용')
    expect(result?.reasons).toContain('같은 교통수단으로 2회 착용')
  })

  it('uses Outfit ID as the deterministic final tie-breaker regardless of input order', () => {
    const data: AppData = {
      ...structuredClone(phase5RecommendationBaselineFixture),
      outfits: [
        phase5BaselineOutfit('z-outfit', 'ok'),
        phase5BaselineOutfit('a-outfit', 'ok'),
      ],
      wearLogs: [],
    }

    expect(recommendOutfits(data, input).map((result) => result.outfit.id)).toEqual([
      'a-outfit',
      'z-outfit',
    ])
  })
})

