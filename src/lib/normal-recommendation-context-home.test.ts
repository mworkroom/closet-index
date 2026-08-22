import { describe, expect, it } from 'vitest'
import {
  isLocalNormalContextN2Enabled,
  rankHomeNormalRecommendationsWithSafetyFirstN2,
} from './normal-recommendation-context-home'
import { applyRecentPurchaseW2Home } from './recent-purchase-w2-home'
import { partitionRecommendations, recommendOutfits } from './recommendation'
import type {
  AppData,
  Item,
  Outfit,
  OutfitRating,
  RecommendationInput,
  RecommendationLevel,
  RecommendationResult,
  WearLog,
} from './types'

const input: RecommendationInput = {
  tempOut: 30,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'nearby',
  transportModeId: 'short',
}
const fixtureBottomId = 'item-fixture-complete-bottom'
const fixtureShoesId = 'item-fixture-complete-shoes'

function outfit(id: string, rating: OutfitRating = 'ok'): Outfit {
  return {
    id,
    displayName: id,
    rating,
    archivedAt: null,
    itemIds: [`item-${id}`, fixtureBottomId, fixtureShoesId],
  }
}

function item(id: string, acquiredOn = '2026-07-01'): Item {
  return {
    id: `item-${id}`,
    name: id,
    category: 'Top-T-shirts',
    semanticColor: null,
    displayHex: '#111111',
    seasons: [],
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn,
    currentQuantity: null,
  }
}

function result(
  id: string,
  level: RecommendationLevel = 'high',
  rating: OutfitRating = 'ok',
  overrides: Partial<RecommendationResult> = {},
): RecommendationResult {
  return {
    outfit: outfit(id, rating),
    level,
    evidence: 'observed',
    similarEvidence: null,
    contextEvidence: {} as RecommendationResult['contextEvidence'],
    reasons: [`${id} reason`],
    warnings: [`${id} warning`],
    okRange: { min: 28, max: 32 },
    okObservationCount: 1,
    targetTemp: 30,
    wearCount: 1,
    lastWornOn: '2026-07-01',
    latestAcquiredOn: null,
    latestAcquiredItemNames: [],
    ...overrides,
  }
}

function wear(
  id: string,
  outfitId: string,
  overrides: Partial<WearLog> = {},
): WearLog {
  return {
    id,
    outfitId,
    wornOn: '2026-07-01',
    tempOut: 30,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: 'ok',
    feelingBack: null,
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId: 'nearby',
    transportModeId: 'short',
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: `token-${id}`,
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function stateLog(
  id: string,
  outfitId: string,
  state:
    | 'exact'
    | 'transport'
    | 'cross'
    | 'unknown'
    | 'mixed'
    | 'issue',
): WearLog[] {
  if (state === 'exact') return [wear(`${id}-exact`, outfitId)]
  if (state === 'transport') {
    return [wear(`${id}-transport`, outfitId, { placeId: 'other' })]
  }
  if (state === 'cross') {
    return [
      wear(`${id}-cross`, outfitId, {
        placeId: 'cinema',
        transportModeId: 'car',
      }),
    ]
  }
  if (state === 'unknown') {
    return [wear(`${id}-unknown`, outfitId, { tempOut: 20 })]
  }
  if (state === 'mixed') {
    return [
      wear(`${id}-mixed-ok`, outfitId),
      wear(`${id}-mixed-hot`, outfitId, { feelingOut: 'hot' }),
    ]
  }
  return [wear(`${id}-issue`, outfitId, { feelingOut: 'hot' })]
}

function dataFor(
  recommendations: readonly RecommendationResult[],
  wearLogs: WearLog[],
): AppData {
  return {
    items: [
      ...recommendations.map((entry) => item(entry.outfit.id)),
      {
        ...item('fixture-complete-bottom', '2020-01-01'),
        category: 'Bottom-Pants',
        acquiredOn: null,
      },
      {
        ...item('fixture-complete-shoes', '2020-01-01'),
        category: 'Shoes',
        acquiredOn: null,
      },
    ],
    outfits: recommendations.map((entry) => entry.outfit),
    wearLogs,
    places: [
      { id: 'nearby', name: 'Nearby', kind: 'specific_venue' },
      { id: 'other', name: 'Other', kind: 'specific_venue' },
      { id: 'cinema', name: 'Cinema', kind: 'specific_venue' },
    ],
    placeHvacProfiles: [],
    transportModes: [
      { id: 'short', name: '도보 · 근거리' },
      { id: 'car', name: '차' },
    ],
  }
}

function rank(
  recommendations: RecommendationResult[],
  states: Array<Parameters<typeof stateLog>[2]>,
  scenarioInput = input,
  enabled = true,
) {
  const logs = recommendations.flatMap((entry, index) =>
    stateLog(entry.outfit.id, entry.outfit.id, states[index]),
  )
  const groups = {
    recentPurchases: [] as RecommendationResult[],
    recommendations,
    trialRecommendations: [] as RecommendationResult[],
  }
  return {
    groups,
    result: rankHomeNormalRecommendationsWithSafetyFirstN2({
      data: dataFor(recommendations, logs),
      input: scenarioInput,
      baselineGroups: groups,
      enabled,
    }),
  }
}

function ids(results: readonly RecommendationResult[]) {
  return results.map((entry) => entry.outfit.id)
}

describe('safety-first N2 normal recommendation HOME integration', () => {
  it('1. ranks high exact support above high fallback', () => {
    const fallback = result('fallback')
    const exact = result('exact')
    const ranked = rank([fallback, exact], ['cross', 'exact']).result
    expect(ids(ranked.groups.recommendations)).toEqual(['exact', 'fallback'])
    expect(ranked.evidenceByOutfitId.get('exact')?.label).toBe(
      '직접 근거 · 30°C에서 OK 1회',
    )
  })

  it('2. ranks high current-Transport support below high exact support', () => {
    const transport = result('transport')
    const exact = result('exact')
    const ranked = rank([transport, exact], ['transport', 'exact']).result
    expect(ids(ranked.groups.recommendations)).toEqual(['exact', 'transport'])
    expect(ranked.evidenceByOutfitId.get('transport')?.label).toBe(
      '같은 이동수단 근거 · 다른 장소',
    )
  })

  it('3. ranks high cross-context below high current-Transport support', () => {
    const cross = result('cross')
    const transport = result('transport')
    const ranked = rank([cross, transport], ['cross', 'transport']).result
    expect(ids(ranked.groups.recommendations)).toEqual(['transport', 'cross'])
    expect(ranked.evidenceByOutfitId.get('cross')?.label).toBe(
      '다른 조건 근거 · 차 이동 기록',
    )
  })

  it('4. ranks high unknown below high cross-context', () => {
    const unknown = result('unknown')
    const cross = result('cross')
    const ranked = rank([unknown, cross], ['unknown', 'cross']).result
    expect(ids(ranked.groups.recommendations)).toEqual(['cross', 'unknown'])
    expect(ranked.evidenceByOutfitId.get('unknown')?.label).toBe(
      '현재 조건 기록 없음',
    )
  })

  it('5. never ranks caution exact support above high fallback', () => {
    const cautionExact = result('caution-exact', 'caution')
    const highFallback = result('high-fallback', 'high')
    expect(
      ids(rank([cautionExact, highFallback], ['exact', 'cross']).result.groups.recommendations),
    ).toEqual(['high-fallback', 'caution-exact'])
  })

  it('6. never ranks caution exact support above possible fallback', () => {
    const cautionExact = result('caution-exact', 'caution')
    const possibleFallback = result('possible-fallback', 'possible')
    expect(
      ids(rank([cautionExact, possibleFallback], ['exact', 'cross']).result.groups.recommendations),
    ).toEqual(['possible-fallback', 'caution-exact'])
  })

  it('7. allows possible exact support above possible fallback', () => {
    const fallback = result('fallback', 'possible')
    const exact = result('exact', 'possible')
    expect(
      ids(rank([fallback, exact], ['cross', 'exact']).result.groups.recommendations),
    ).toEqual(['exact', 'fallback'])
  })

  it('8. does not let Favorite fallback outrank exact support in the same level', () => {
    const favorite = result('favorite-fallback', 'high', 'favorite')
    const exact = result('exact', 'high', 'ok')
    expect(
      ids(rank([favorite, exact], ['cross', 'exact']).result.groups.recommendations),
    ).toEqual(['exact', 'favorite-fallback'])
  })

  it('9. preserves Favorite-first baseline order inside the same context tier', () => {
    const favorite = result('favorite', 'high', 'favorite')
    const regular = result('regular', 'high', 'ok')
    expect(
      ids(rank([favorite, regular], ['cross', 'cross']).result.groups.recommendations),
    ).toEqual(['favorite', 'regular'])
  })

  it('10. keeps exact issue visible without positive promotion', () => {
    const issue = result('issue')
    const unknown = result('unknown')
    const ranked = rank([issue, unknown], ['issue', 'unknown']).result
    expect(ids(ranked.groups.recommendations)).toEqual(['unknown', 'issue'])
    expect(ranked.evidenceByOutfitId.get('issue')?.label).toBe(
      '현재 조건에서 문제 기록',
    )
  })

  it('11. keeps exact mixed visible without positive promotion', () => {
    const mixed = result('mixed')
    const unknown = result('unknown')
    const ranked = rank([mixed, unknown], ['mixed', 'unknown']).result
    expect(ids(ranked.groups.recommendations)).toEqual(['unknown', 'mixed'])
    expect(ranked.evidenceByOutfitId.get('mixed')?.label).toBe(
      '현재 조건 결과 혼재',
    )
  })

  it('12. removes no candidate and preserves RecommendationResult objects', () => {
    const candidates = [
      result('exact'),
      result('transport'),
      result('cross'),
      result('unknown'),
      result('mixed'),
      result('issue'),
    ]
    const ranked = rank(candidates, [
      'exact',
      'transport',
      'cross',
      'unknown',
      'mixed',
      'issue',
    ]).result.groups.recommendations
    expect(new Set(ranked)).toEqual(new Set(candidates))
    expect(ids(ranked).sort()).toEqual(ids(candidates).sort())
  })

  it('13. leaves W2 Recent Purchase cards, source order, and 365-day behavior unchanged', () => {
    const recent = result('recent', 'high', 'ok', {
      latestAcquiredOn: '2025-08-08',
      latestAcquiredItemNames: ['recent'],
    })
    const normal = result('normal')
    const data = dataFor(
      [recent, normal],
      [
        ...stateLog('recent', 'recent', 'exact'),
        ...stateLog('normal', 'normal', 'cross'),
      ],
    )
    data.items = [
      item('recent', '2025-08-08'),
      item('normal', '2024-01-01'),
      {
        ...item('fixture-complete-bottom', '2020-01-01'),
        category: 'Bottom-Pants',
        acquiredOn: null,
      },
      {
        ...item('fixture-complete-shoes', '2020-01-01'),
        category: 'Shoes',
        acquiredOn: null,
      },
    ]
    const results = recommendOutfits(data, input)
    const baseline = partitionRecommendations(results)
    const w2 = applyRecentPurchaseW2Home({
      data,
      input,
      results,
      baselineGroups: baseline,
      enabled: true,
      asOfDate: '2026-08-08',
    })
    const ranked = rankHomeNormalRecommendationsWithSafetyFirstN2({
      data,
      input,
      baselineGroups: w2.groups,
      enabled: true,
    })
    expect(ranked.groups.recentPurchases).toBe(w2.groups.recentPurchases)
    expect(ranked.groups.recentPurchases).toEqual(w2.groups.recentPurchases)
    expect(w2.simulation?.selections[0]).toMatchObject({
      sourceItemId: 'item-recent',
      ageDays: 365,
    })
  })

  it('14. leaves trial recommendations unchanged by identity', () => {
    const normal = result('normal')
    const trial = result('trial', 'high', 'ok', { evidence: 'untried' })
    const groups = {
      recentPurchases: [],
      recommendations: [normal],
      trialRecommendations: [trial],
    }
    const ranked = rankHomeNormalRecommendationsWithSafetyFirstN2({
      data: dataFor([normal, trial], stateLog('normal', 'normal', 'exact')),
      input,
      baselineGroups: groups,
      enabled: true,
    })
    expect(ranked.groups.trialRecommendations).toBe(groups.trialRecommendations)
    expect(ranked.groups.trialRecommendations[0]).toBe(trial)
  })

  it('15. preserves the baseline object and order when Place is null', () => {
    const run = rank([result('a'), result('b')], ['cross', 'exact'], {
      ...input,
      placeId: null,
    })
    expect(run.result.groups).toBe(run.groups)
    expect(run.result.groups.recommendations).toBe(run.groups.recommendations)
    expect(run.result.evidenceByOutfitId.size).toBe(0)
  })

  it('16. preserves baseline order and emits no labels when Transport is null', () => {
    const a = result('a')
    const b = result('b')
    const run = rank([a, b], ['cross', 'exact'], {
      ...input,
      transportModeId: null,
    })
    expect(run.result.groups).toBe(run.groups)
    expect(run.result.groups.recommendations).toBe(run.groups.recommendations)
    expect(run.result.evidenceByOutfitId.size).toBe(0)
  })

  it('17. does not create exact or current-Transport support from inferred return', () => {
    const inferred = result('inferred')
    const groups = {
      recentPurchases: [],
      recommendations: [inferred],
      trialRecommendations: [],
    }
    const data = dataFor(
      [inferred],
      [
        wear('inferred-return', inferred.outfit.id, {
          tempOut: 20,
          feelingOut: null,
          tempBack: 30,
          tempBackInferred: true,
          feelingBack: 'ok',
        }),
      ],
    )
    const ranked = rankHomeNormalRecommendationsWithSafetyFirstN2({
      data,
      input,
      baselineGroups: groups,
      enabled: true,
    })
    const evidence = ranked.evidenceByOutfitId.get(inferred.outfit.id)
    expect(evidence?.tier).toBe('unknown')
    expect(evidence?.exactMatchedWearLogCount).toBe(0)
    expect(evidence?.currentTransportMatchedWearLogCount).toBe(0)
    expect(evidence?.context.exactContext.inferredReturnEndpointCount).toBe(1)
  })

  it('18. keeps longWalkCondition independent from context state', () => {
    const candidate = result('candidate')
    const without = rank([candidate], ['exact']).result.evidenceByOutfitId.get(
      candidate.outfit.id,
    )
    const withLongWalk = rank([candidate], ['exact'], {
      ...input,
      longWalkCondition: 'yes',
    }).result.evidenceByOutfitId.get(candidate.outfit.id)
    expect(withLongWalk?.tier).toBe(without?.tier)
    expect(withLongWalk?.context).toEqual(without?.context)
  })

  it('19. returns the exact baseline object and arrays when disabled', () => {
    const run = rank([result('a'), result('b')], ['cross', 'exact'], input, false)
    expect(run.result.groups).toBe(run.groups)
    expect(run.result.groups.recommendations).toBe(run.groups.recommendations)
    expect(run.result.groups).toEqual(run.groups)
    expect(run.result.evidenceByOutfitId.size).toBe(0)
  })

  it('20. defaults false and cannot be enabled in a production build', () => {
    expect(isLocalNormalContextN2Enabled(true, undefined)).toBe(false)
    expect(isLocalNormalContextN2Enabled(true, 'false')).toBe(false)
    expect(isLocalNormalContextN2Enabled(true, 'true')).toBe(true)
    expect(isLocalNormalContextN2Enabled(false, 'true')).toBe(false)
  })

  it('21. is stable across duplicate rows and Wear Log input order', () => {
    const exact = result('exact')
    const cross = result('cross')
    const recommendations = [cross, exact]
    const logs = [
      ...stateLog('cross', 'cross', 'cross'),
      ...stateLog('exact', 'exact', 'exact'),
    ]
    const groups = {
      recentPurchases: [],
      recommendations,
      trialRecommendations: [],
    }
    const selected = (wearLogs: WearLog[]) =>
      ids(
        rankHomeNormalRecommendationsWithSafetyFirstN2({
          data: dataFor(recommendations, wearLogs),
          input,
          baselineGroups: groups,
          enabled: true,
        }).groups.recommendations,
      )
    expect(selected([...logs].reverse())).toEqual(
      selected([...logs, structuredClone(logs[0])]),
    )
  })
})
