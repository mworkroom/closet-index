import { describe, expect, it } from 'vitest'
import { calculateContextEvidence } from './context-evidence'
import {
  buildContextEligibilityCandidates,
  calculateOutfitContextEligibility,
  simulateContextRecentPurchases,
} from './context-conditioned-recent-purchase'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
  type InitialNoveltyEvidence,
} from './recent-purchase-semantics'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  RecommendationResult,
  ThermalFeeling,
  WearLog,
} from './types'

const nearbyInput: RecommendationInput = {
  tempOut: 33,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'nearby',
  transportModeId: 'short-walk',
}

function wear(
  id: string,
  temperature: number | null,
  feeling: ThermalFeeling,
  options: Partial<WearLog> = {},
): WearLog {
  return {
    id,
    outfitId: 'target',
    wornOn: '2026-07-01',
    tempOut: temperature,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: feeling,
    feelingBack: null,
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId: 'nearby',
    transportModeId: 'short-walk',
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    observedHvacMemo: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: `token-${id}`,
    createdAt: '2026-07-01T00:00:00Z',
    ...options,
  }
}

function item(id: string, acquiredOn = '2026-07-01'): Item {
  return {
    id,
    name: id,
    category: 'Top-T-shirts',
    semanticColor: null,
    displayHex: '#000000',
    seasons: [],
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn,
    currentQuantity: null,
  }
}

function outfit(id: string, itemIds = [id]): Outfit {
  return {
    id,
    displayName: id,
    rating: 'ok',
    archivedAt: null,
    itemIds,
  }
}

function result(
  source: Outfit,
  options: Partial<RecommendationResult> = {},
): RecommendationResult {
  return {
    outfit: source,
    level: 'high',
    evidence: 'observed',
    similarEvidence: null,
    contextEvidence: calculateContextEvidence([], {
      placeId: null,
      transportModeId: null,
    }),
    reasons: [],
    warnings: [],
    okRange: { min: 30, max: 35 },
    okObservationCount: 1,
    targetTemp: 33,
    wearCount: 1,
    lastWornOn: '2026-07-01',
    latestAcquiredOn: '2026-07-01',
    latestAcquiredItemNames: source.itemIds,
    ...options,
  }
}

function fixture(
  rows: Array<{
    outfit: Outfit
    result?: RecommendationResult
    logs: WearLog[]
  }>,
  extraItems: Item[] = [],
) {
  const items = [
    ...new Map(
      [
        ...rows.flatMap((row) => row.outfit.itemIds.map((id) => item(id))),
        ...extraItems,
      ].map((entry) => [entry.id, entry]),
    ).values(),
  ]
  const data: AppData = {
    items,
    outfits: rows.map((row) => row.outfit),
    wearLogs: rows.flatMap((row) =>
      row.logs.map((log) => ({ ...log, outfitId: row.outfit.id })),
    ),
    places: [
      { id: 'nearby', name: 'Nearby', kind: 'specific_venue' },
      { id: 'cinema', name: 'Cinema', kind: 'specific_venue' },
      { id: 'other', name: 'Other', kind: 'specific_venue' },
    ],
    placeHvacProfiles: [],
    transportModes: [
      { id: 'short-walk', name: 'Short walk' },
      { id: 'car', name: 'Car' },
    ],
  }
  const novelty = new Map<string, InitialNoveltyEvidence>(
    items.map((entry) => [
      entry.id,
      deriveInitialNoveltyDate({
        item: entry,
        purchaseEvents: [],
        earliestKnownWearOn: null,
        notionCreatedAt: null,
        databaseCreatedAt: null,
      }),
    ]),
  )
  const noveltyOverlay = applyAuthoritativeNoveltyOverrides(novelty, [])
  const results = rows.map((row) => row.result ?? result(row.outfit))
  return { data, noveltyOverlay, results }
}

function candidates(
  rows: Array<{ outfit: Outfit; result?: RecommendationResult; logs: WearLog[] }>,
  input = nearbyInput,
) {
  const built = fixture(rows)
  return {
    ...built,
    candidates: buildContextEligibilityCandidates({
      data: built.data,
      input,
      results: built.results,
      noveltyOverlay: built.noveltyOverlay,
    }),
  }
}

describe('Outfit context eligibility states', () => {
  it('does not let Car plus cinema OK qualify nearby short walk', () => {
    const evidence = calculateOutfitContextEligibility(
      [
        wear('car-cinema', 31, 'ok', {
          placeId: 'cinema',
          transportModeId: 'car',
        }),
        wear('historical-null-transport', 33, 'ok', {
          placeId: 'nearby',
          transportModeId: null,
        }),
      ],
      nearbyInput,
    )
    expect(evidence.state).toBe('cross_context_only')
    expect(evidence.exactContext.matchedWearLogIds).toEqual([])
    expect(evidence.overall.expandedOkRange).toEqual({ min: 29, max: 35 })
  })

  it('qualifies the same history for Car plus cinema', () => {
    const evidence = calculateOutfitContextEligibility(
      [
        wear('car-cinema', 31, 'ok', {
          placeId: 'cinema',
          transportModeId: 'car',
        }),
      ],
      { ...nearbyInput, placeId: 'cinema', transportModeId: 'car' },
    )
    expect(evidence.state).toBe('exact_support')
    expect(evidence.exactContext.matchedWearLogIds).toEqual(['car-cinema'])
  })

  it('accepts one exact-context OK observation', () => {
    expect(
      calculateOutfitContextEligibility(
        [wear('one-ok', 33, 'ok')],
        nearbyInput,
      ).state,
    ).toBe('exact_support')
  })

  it('classifies one exact-context hot observation as an issue', () => {
    expect(
      calculateOutfitContextEligibility(
        [wear('one-hot', 33, 'hot')],
        nearbyInput,
      ).state,
    ).toBe('exact_issue')
  })

  it('keeps exact OK and hot observations mixed and ineligible', () => {
    const target = outfit('mixed')
    const built = candidates([
      {
        outfit: target,
        logs: [wear('ok', 33, 'ok'), wear('hot', 34, 'hot')],
      },
    ])
    expect(built.candidates[0].context.state).toBe('exact_mixed')
    expect(
      simulateContextRecentPurchases({
        candidates: built.candidates,
        noveltyOverlay: built.noveltyOverlay,
        model: 'C2',
      }).selections,
    ).toEqual([])
  })

  it('keeps same-Transport another-Place support below exact support', () => {
    const exact = outfit('exact')
    const transport = outfit('transport')
    const built = candidates([
      { outfit: transport, logs: [wear('transport-ok', 33, 'ok', { placeId: 'other' })] },
      { outfit: exact, logs: [wear('exact-ok', 33, 'ok')] },
    ])
    expect(built.candidates.map((entry) => entry.context.state)).toEqual([
      'current_transport_support',
      'exact_support',
    ])
    const simulation = simulateContextRecentPurchases({
      candidates: built.candidates,
      noveltyOverlay: built.noveltyOverlay,
      model: 'C2',
      limit: 2,
    })
    expect(simulation.selections.map((entry) => entry.result.outfit.id)).toEqual([
      'exact',
      'transport',
    ])
  })

  it('distinguishes truly untried from cross-context-only', () => {
    const untried = calculateOutfitContextEligibility([], nearbyInput)
    const cross = calculateOutfitContextEligibility(
      [wear('car', 33, 'ok', { placeId: 'cinema', transportModeId: 'car' })],
      nearbyInput,
    )
    expect(untried.state).toBe('untried')
    expect(cross.state).toBe('cross_context_only')
  })

  it('does not let cross-context-only occupy strict C3', () => {
    const cross = outfit('cross')
    const untried = outfit('untried')
    const built = candidates([
      {
        outfit: cross,
        logs: [wear('car', 33, 'ok', { placeId: 'cinema', transportModeId: 'car' })],
      },
      {
        outfit: untried,
        result: result(untried, {
          evidence: 'untried',
          okRange: null,
          wearCount: 0,
          lastWornOn: null,
        }),
        logs: [],
      },
    ])
    const strict = simulateContextRecentPurchases({
      candidates: built.candidates,
      noveltyOverlay: built.noveltyOverlay,
      model: 'C3',
      c3TransportVariant: 'report-only',
    })
    expect(strict.selections.map((entry) => entry.result.outfit.id)).toEqual([
      'untried',
    ])
  })

  it('returns fewer than three cards when only one distinct source qualifies', () => {
    const shared = item('shared')
    const first = outfit('first', [shared.id])
    const second = outfit('second', [shared.id])
    const built = fixture(
      [
        { outfit: first, logs: [wear('first-ok', 33, 'ok')] },
        { outfit: second, logs: [wear('second-ok', 33, 'ok')] },
      ],
      [shared],
    )
    const builtCandidates = buildContextEligibilityCandidates({
      data: built.data,
      input: nearbyInput,
      results: built.results,
      noveltyOverlay: built.noveltyOverlay,
    })
    const simulation = simulateContextRecentPurchases({
      candidates: builtCandidates,
      noveltyOverlay: built.noveltyOverlay,
      model: 'C1',
    })
    expect(simulation.selections).toHaveLength(1)
    expect(simulation.returnedFewerThanLimit).toBe(true)
  })

  it('compares Place-null C0 fallback and disabled fallback without exact support', () => {
    const target = outfit('target')
    const input = { ...nearbyInput, placeId: null }
    const built = candidates(
      [{ outfit: target, logs: [wear('ok', 33, 'ok')] }],
      input,
    )
    expect(built.candidates[0].context.exactContext.enabled).toBe(false)
    expect(built.candidates[0].context.state).toBe(
      'current_transport_support',
    )
    expect(
      simulateContextRecentPurchases({
        candidates: built.candidates,
        noveltyOverlay: built.noveltyOverlay,
        model: 'C1',
        missingContextFallback: 'current-c0',
      }).selections,
    ).toHaveLength(1)
    expect(
      simulateContextRecentPurchases({
        candidates: built.candidates,
        noveltyOverlay: built.noveltyOverlay,
        model: 'C1',
        missingContextFallback: 'disabled',
      }).selections,
    ).toEqual([])
  })

  it('compares Transport-null C0 fallback and disabled fallback', () => {
    const target = outfit('target')
    const built = candidates(
      [{ outfit: target, logs: [wear('ok', 33, 'ok')] }],
      { ...nearbyInput, transportModeId: null },
    )
    expect(built.candidates[0].context.exactContext.enabled).toBe(false)
    expect(built.candidates[0].context.currentTransport.enabled).toBe(false)
    expect(
      simulateContextRecentPurchases({
        candidates: built.candidates,
        noveltyOverlay: built.noveltyOverlay,
        model: 'C2',
        missingContextFallback: 'current-c0',
      }).selections,
    ).toHaveLength(1)
    expect(
      simulateContextRecentPurchases({
        candidates: built.candidates,
        noveltyOverlay: built.noveltyOverlay,
        model: 'C2',
        missingContextFallback: 'disabled',
      }).selections,
    ).toEqual([])
  })

  it('keeps inferred-return-only observations out of eligibility', () => {
    const evidence = calculateOutfitContextEligibility(
      [
        wear('inferred', 20, null, {
          tempBack: 33,
          tempBackInferred: true,
          feelingBack: 'ok',
        }),
      ],
      { ...nearbyInput, tempOut: 20, tempBack: 33 },
    )
    expect(evidence.state).toBe('unknown')
    expect(evidence.exactContext.outcome).toBe('unknown')
    expect(evidence.exactContext.inferredReturnEndpointCount).toBe(1)
  })

  it('keeps N3 source and Outfit uniqueness deterministic', () => {
    const shared = item('shared', '2026-08-01')
    const other = item('other-source', '2026-07-01')
    const first = outfit('first', [shared.id])
    const second = outfit('second', [shared.id, other.id])
    const built = fixture(
      [
        { outfit: first, logs: [wear('first-ok', 33, 'ok')] },
        { outfit: second, logs: [wear('second-ok', 33, 'ok')] },
      ],
      [shared, other],
    )
    const builtCandidates = buildContextEligibilityCandidates({
      data: built.data,
      input: nearbyInput,
      results: built.results,
      noveltyOverlay: built.noveltyOverlay,
    })
    const run = (rows: typeof builtCandidates) =>
      simulateContextRecentPurchases({
        candidates: rows,
        noveltyOverlay: built.noveltyOverlay,
        model: 'C1',
      }).selections.map((entry) => [
        entry.sourceItemId,
        entry.result.outfit.id,
      ])
    expect(run([...builtCandidates].reverse())).toEqual(run(builtCandidates))
    const selected = run(builtCandidates)
    expect(new Set(selected.map(([sourceId]) => sourceId)).size).toBe(
      selected.length,
    )
    expect(new Set(selected.map(([, outfitId]) => outfitId)).size).toBe(
      selected.length,
    )
  })

  it('is stable across input order and duplicated Wear Log rows', () => {
    const first = wear('a', 33, 'ok')
    const second = wear('b', 34, 'ok')
    expect(
      calculateOutfitContextEligibility([second, first, first], nearbyInput),
    ).toEqual(calculateOutfitContextEligibility([first, second], nearbyInput))
  })
})
