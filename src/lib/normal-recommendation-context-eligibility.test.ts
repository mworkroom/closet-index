import { describe, expect, it } from 'vitest'
import { recommendOutfits } from './recommendation'
import { simulateNormalRecommendationContextModels } from './normal-recommendation-context-eligibility'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  ThermalFeeling,
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

function item(id: string): Item {
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
    acquiredOn: '2024-01-01',
    currentQuantity: null,
  }
}

function outfit(id: string): Outfit {
  return {
    id,
    displayName: id,
    rating: 'ok',
    archivedAt: null,
    itemIds: [`item-${id}`],
  }
}

function wear(
  id: string,
  outfitId: string,
  {
    temperature = 30,
    feeling = 'ok',
    placeId = 'nearby',
    transportModeId = 'short',
  }: {
    temperature?: number
    feeling?: ThermalFeeling
    placeId?: string | null
    transportModeId?: string | null
  } = {},
): WearLog {
  return {
    id,
    outfitId,
    wornOn: '2026-07-01',
    tempOut: temperature,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: feeling,
    feelingBack: null,
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId,
    transportModeId,
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: `token-${id}`,
    createdAt: '2026-07-01T00:00:00Z',
  }
}

function fixture(): AppData {
  const outfits = [
    outfit('exact'),
    outfit('transport'),
    outfit('cross'),
    outfit('unknown'),
    outfit('issue'),
    outfit('mixed'),
  ]
  return {
    items: outfits.map((entry) => item(entry.id)),
    outfits,
    wearLogs: [
      wear('exact-log', 'exact'),
      wear('transport-log', 'transport', { placeId: 'other' }),
      wear('cross-log', 'cross', {
        placeId: 'cinema',
        transportModeId: 'car',
      }),
      wear('unknown-log', 'unknown', { temperature: 20 }),
      wear('issue-exact', 'issue', { feeling: 'hot' }),
      wear('issue-overall-ok', 'issue', {
        placeId: 'cinema',
        transportModeId: 'car',
      }),
      wear('mixed-ok', 'mixed'),
      wear('mixed-hot', 'mixed', { feeling: 'hot' }),
    ],
    places: [
      { id: 'nearby', name: 'Nearby', kind: 'specific_venue' },
      { id: 'other', name: 'Other', kind: 'specific_venue' },
      { id: 'cinema', name: 'Cinema', kind: 'specific_venue' },
    ],
    placeHvacProfiles: [],
    transportModes: [
      { id: 'short', name: 'Short walk' },
      { id: 'car', name: 'Car' },
    ],
  }
}

function run(scenarioInput = input) {
  const data = fixture()
  const results = recommendOutfits(data, scenarioInput)
  const baseline = results.filter((result) => result.evidence === 'observed')
  return {
    baseline,
    models: simulateNormalRecommendationContextModels({
      data,
      input: scenarioInput,
      baselineRecommendations: baseline,
    }),
  }
}

describe('normal recommendation context eligibility comparison', () => {
  it('keeps N0 exactly equal to the baseline order and membership', () => {
    const { baseline, models } = run()
    const n0 = models[0]
    expect(n0.model).toBe('N0')
    expect(n0.ordered).toEqual(baseline)
    expect(n0.ordered.every((entry, index) => entry === baseline[index])).toBe(
      true,
    )
  })

  it('treats the supplied baseline order as authoritative for N0', () => {
    const data = fixture()
    const baseline = recommendOutfits(data, input)
      .filter((result) => result.evidence === 'observed')
      .reverse()
    const n0 = simulateNormalRecommendationContextModels({
      data,
      input,
      baselineRecommendations: baseline,
    })[0]
    expect(n0.ordered).toEqual(baseline)
    expect(n0.ordered.every((entry, index) => entry === baseline[index])).toBe(
      true,
    )
  })

  it('keeps only exact and current-Transport support in N1', () => {
    const n1 = run().models[1]
    expect(n1.ordered.map((entry) => entry.outfit.id)).toEqual([
      'exact',
      'transport',
    ])
    expect(n1.verified).toEqual(n1.ordered)
    expect(n1.fallback).toEqual([])
  })

  it('keeps fallback separate and below verified support in N2', () => {
    const n2 = run().models[2]
    expect(n2.ordered.map((entry) => entry.outfit.id)).toEqual([
      'exact',
      'transport',
      'cross',
      'unknown',
      'mixed',
      'issue',
    ])
    expect(n2.verified.map((entry) => entry.outfit.id)).toEqual([
      'exact',
      'transport',
    ])
    expect(n2.fallback.map((entry) => entry.outfit.id)).toEqual([
      'cross',
      'unknown',
    ])
  })

  it('keeps exact mixed and issue visible after unknown without calling them fallback', () => {
    const n2 = run().models[2]
    expect(n2.excluded).toEqual([])
    expect(n2.fallback.map((entry) => entry.outfit.id)).toEqual([
      'cross',
      'unknown',
    ])
    expect(n2.decisions.find((entry) => entry.result.outfit.id === 'mixed')?.tier)
      .toBe('exact_mixed')
    expect(n2.decisions.find((entry) => entry.result.outfit.id === 'issue')?.tier)
      .toBe('exact_issue')
  })

  it('preserves level then authoritative baseline order inside a context tier', () => {
    const data = fixture()
    const results = recommendOutfits(data, input)
    const exact = results.find((entry) => entry.outfit.id === 'exact')!
    const cross = results.find((entry) => entry.outfit.id === 'cross')!
    const closerCross = {
      ...cross,
      outfit: { ...cross.outfit, id: 'cross-closer' },
      level: 'high' as const,
      okRange: { min: 30, max: 30 },
    }
    const fartherCross = {
      ...cross,
      outfit: { ...cross.outfit, id: 'cross-farther' },
      level: 'possible' as const,
      okRange: { min: 25, max: 25 },
    }
    const duplicatedData: AppData = {
      ...data,
      wearLogs: [
        ...data.wearLogs,
        {
          ...data.wearLogs.find((log) => log.outfitId === 'cross')!,
          outfitId: 'cross-closer',
          id: 'cross-closer-log',
        },
        {
          ...data.wearLogs.find((log) => log.outfitId === 'cross')!,
          outfitId: 'cross-farther',
          id: 'cross-farther-log',
        },
      ],
    }
    const n2 = simulateNormalRecommendationContextModels({
      data: duplicatedData,
      input,
      baselineRecommendations: [fartherCross, closerCross, exact],
    })[2]
    expect(n2.fallback.map((entry) => entry.outfit.id)).toEqual([
      'cross-closer',
      'cross-farther',
    ])
  })

  it('preserves the original RecommendationResult objects', () => {
    const { baseline, models } = run()
    for (const model of models) {
      for (const result of model.ordered) {
        expect(baseline).toContain(result)
      }
    }
  })

  it('does not mutate the baseline array', () => {
    const data = fixture()
    const baseline = recommendOutfits(data, input).filter(
      (result) => result.evidence === 'observed',
    )
    const before = [...baseline]
    simulateNormalRecommendationContextModels({
      data,
      input,
      baselineRecommendations: baseline,
    })
    expect(baseline).toEqual(before)
    expect(baseline.every((entry, index) => entry === before[index])).toBe(true)
  })

  it('keeps longWalkCondition independent from context classification', () => {
    const withoutLongWalk = run(input).models[2].decisions.map((decision) => ({
      id: decision.result.outfit.id,
      state: decision.context.state,
      tier: decision.tier,
    }))
    const withLongWalk = run({
      ...input,
      longWalkCondition: 'yes',
    }).models[2].decisions.map((decision) => ({
      id: decision.result.outfit.id,
      state: decision.context.state,
      tier: decision.tier,
    }))
    expect(withLongWalk).toEqual(withoutLongWalk)
  })

  it('is deterministic across duplicate Wear Log rows', () => {
    const data = fixture()
    const baseline = recommendOutfits(data, input).filter(
      (result) => result.evidence === 'observed',
    )
    const selected = (source: AppData) =>
      simulateNormalRecommendationContextModels({
        data: source,
        input,
        baselineRecommendations: baseline,
      })[2].ordered.map((entry) => entry.outfit.id)
    expect(
      selected({
        ...data,
        wearLogs: [...data.wearLogs, structuredClone(data.wearLogs[0])],
      }),
    ).toEqual(selected(data))
  })
})
