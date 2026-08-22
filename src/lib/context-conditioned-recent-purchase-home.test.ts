import { describe, expect, it } from 'vitest'
import {
  applyContextConditionedRecentPurchaseC1N3,
  isLocalRecentPurchaseC1N3Enabled,
  type HomeRecommendationPartitions,
} from './context-conditioned-recent-purchase-home'
import { deriveInitialNoveltyDate } from './recent-purchase-semantics'
import { partitionRecommendations, recommendOutfits } from './recommendation'
import type {
  AppData,
  Item,
  Outfit,
  PurchaseEvent,
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
const fixtureBottomId = 'fixture-complete-bottom'
const fixtureShoesId = 'fixture-complete-shoes'

function item(
  id: string,
  category = 'Top-T-shirts',
  acquiredOn = '2026-07-01',
): Item {
  return {
    id,
    name: id,
    category,
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

function outfit(id: string, itemIds = [`item-${id}`]): Outfit {
  return {
    id,
    displayName: id,
    rating: 'ok',
    archivedAt: null,
    itemIds: [...new Set([...itemIds, fixtureBottomId, fixtureShoesId])],
  }
}

function wear(
  id: string,
  outfitId: string,
  temperature: number | null = 33,
  feeling: ThermalFeeling = 'ok',
  overrides: Partial<WearLog> = {},
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
    placeId: 'nearby',
    transportModeId: 'short-walk',
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

function dataFor(
  outfits: Outfit[],
  wearLogs: WearLog[],
  extraItems: Item[] = [],
): AppData {
  const items = [
    ...new Map(
      [
        ...outfits.flatMap((entry, outfitIndex) =>
          entry.itemIds.map((itemId, itemIndex) =>
            item(
              itemId,
              'Top-T-shirts',
              `2026-07-${String(28 - outfitIndex - itemIndex).padStart(2, '0')}`,
            ),
          ),
        ),
        ...extraItems,
        {
          ...item(fixtureBottomId, 'Bottom-Pants', '2020-01-01'),
          acquiredOn: null,
        },
        {
          ...item(fixtureShoesId, 'Shoes', '2020-01-01'),
          acquiredOn: null,
        },
      ].map((entry) => [entry.id, entry]),
    ).values(),
  ]
  return {
    items,
    outfits,
    wearLogs,
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
}

function run(
  data: AppData,
  input = nearbyInput,
  enabled = true,
) {
  const results = recommendOutfits(data, input)
  const baselineGroups = partitionRecommendations(results)
  return {
    results,
    baselineGroups,
    integrated: applyContextConditionedRecentPurchaseC1N3({
      data,
      input,
      results,
      baselineGroups,
      enabled,
    }),
  }
}

function exactData(count: number) {
  const outfits = Array.from({ length: count }, (_, index) =>
    outfit(`exact-${index + 1}`),
  )
  return dataFor(
    outfits,
    outfits.map((entry, index) =>
      wear(`exact-log-${index + 1}`, entry.id),
    ),
  )
}

function manualResult(id: string, evidence: 'observed' | 'untried' = 'observed') {
  return {
    outfit: outfit(id),
    level: 'high',
    evidence,
    similarEvidence: null,
    contextEvidence: {} as RecommendationResult['contextEvidence'],
    reasons: [],
    warnings: [],
    okRange: { min: 31, max: 35 },
    okObservationCount: 1,
    targetTemp: 33,
    wearCount: evidence === 'observed' ? 1 : 0,
    lastWornOn: evidence === 'observed' ? '2026-07-01' : null,
    latestAcquiredOn: '2026-07-01',
    latestAcquiredItemNames: [`item-${id}`],
  } satisfies RecommendationResult
}

describe('disabled HOME Recent Purchase C1 + N3 integration', () => {
  it('1. returns three cards for three exact-support source Items', () => {
    expect(run(exactData(3)).integrated.groups.recentPurchases).toHaveLength(3)
  })

  it('2. returns two cards for two exact-support source Items', () => {
    expect(run(exactData(2)).integrated.groups.recentPurchases).toHaveLength(2)
  })

  it('3. returns one card for one exact-support source Item', () => {
    expect(run(exactData(1)).integrated.groups.recentPurchases).toHaveLength(1)
  })

  it('4. returns zero cards when no Outfit has exact support', () => {
    const target = outfit('cross')
    const data = dataFor(
      [target],
      [wear('cross-log', target.id, 33, 'ok', { placeId: 'cinema', transportModeId: 'car' })],
    )
    expect(run(data).integrated.groups.recentPurchases).toEqual([])
  })

  it('5. rejects cross-context-only Car plus cinema evidence nearby', () => {
    const target = outfit('cross')
    const integrated = run(
      dataFor(
        [target],
        [wear('cross-log', target.id, 31, 'ok', { placeId: 'cinema', transportModeId: 'car' })],
      ),
    ).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'cross_context_only',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('6. accepts the same Outfit for cinema plus Car', () => {
    const target = outfit('cinema')
    const data = dataFor(
      [target],
      [wear('cinema-log', target.id, 31, 'ok', { placeId: 'cinema', transportModeId: 'car' })],
    )
    const integrated = run(data, {
      ...nearbyInput,
      placeId: 'cinema',
      transportModeId: 'car',
    }).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'exact_support',
    )
    expect(integrated.groups.recentPurchases).toHaveLength(1)
  })

  it('7. rejects current-Transport-only support', () => {
    const target = outfit('transport')
    const integrated = run(
      dataFor(
        [target],
        [wear('transport-log', target.id, 33, 'ok', { placeId: 'other' })],
      ),
    ).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'current_transport_support',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('8. rejects exact issue', () => {
    const target = outfit('issue')
    const integrated = run(
      dataFor([target], [wear('issue-log', target.id, 33, 'hot')]),
    ).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'exact_issue',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('9. rejects exact mixed evidence', () => {
    const target = outfit('mixed')
    const integrated = run(
      dataFor(
        [target],
        [wear('mixed-ok', target.id), wear('mixed-hot', target.id, 34, 'hot')],
      ),
    ).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'exact_mixed',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('10. rejects unknown evidence', () => {
    const target = outfit('unknown')
    const integrated = run(
      dataFor([target], [wear('old-log', target.id, 20, 'ok')]),
    ).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'unknown',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('11. rejects untried Outfits', () => {
    const target = outfit('untried')
    const integrated = run(dataFor([target], [])).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'untried',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('12. rejects inferred-return-only support', () => {
    const target = outfit('inferred')
    const input = { ...nearbyInput, tempOut: 20, tempBack: 33 }
    const integrated = run(
      dataFor(
        [target],
        [wear('inferred-log', target.id, 20, null, { tempBack: 33, tempBackInferred: true, feelingBack: 'ok' })],
      ),
      input,
    ).integrated
    expect(integrated.simulation?.decisions[0].candidate.context.state).toBe(
      'unknown',
    )
    expect(integrated.groups.recentPurchases).toEqual([])
  })

  it('13. rejects Top-T-shirts-innerwear as the novelty source', () => {
    const target = outfit('inner-only', ['inner'])
    const data = dataFor(
      [target],
      [wear('inner-log', target.id)],
      [item('inner', 'Top-T-shirts-innerwear')],
    )
    expect(run(data).integrated.groups.recentPurchases).toEqual([])
  })

  it('14. keeps an Outfit containing innerwear under another source', () => {
    const target = outfit('inner-plus', ['inner', 'visible'])
    const data = dataFor(
      [target],
      [wear('inner-plus-log', target.id)],
      [
        item('inner', 'Top-T-shirts-innerwear', '2026-07-28'),
        item('visible', 'Top-Blouse', '2026-07-20'),
      ],
    )
    const integrated = run(data).integrated
    expect(integrated.groups.recentPurchases).toHaveLength(1)
    expect(integrated.simulation?.selections[0].sourceItemId).toBe('visible')
  })

  it('15. assigns at most one card to a source Item', () => {
    const shared = item('shared')
    const first = outfit('shared-first', [shared.id])
    const second = outfit('shared-second', [shared.id])
    const integrated = run(
      dataFor(
        [first, second],
        [wear('first-log', first.id), wear('second-log', second.id)],
        [shared],
      ),
    ).integrated
    expect(integrated.groups.recentPurchases).toHaveLength(1)
    expect(integrated.simulation?.selections[0].result.outfit.id).toBe(
      'shared-first',
    )
  })

  it('16. includes one Outfit at most once even with two sources', () => {
    const target = outfit('two-sources', ['new-a', 'new-b'])
    const integrated = run(
      dataFor(
        [target],
        [wear('two-source-log', target.id)],
        [item('new-a'), item('new-b', 'Top-Blouse', '2026-07-02')],
      ),
    ).integrated
    expect(integrated.groups.recentPurchases).toHaveLength(1)
    expect(new Set(integrated.groups.recentPurchases.map((entry) => entry.outfit.id)).size).toBe(1)
  })

  it('17. does not reset initial novelty with repurchase events', () => {
    const source = item('repurchased', 'Top-T-shirts', '2024-06-01')
    const purchaseEvent: PurchaseEvent = {
      id: 'repurchase',
      itemId: source.id,
      purchasedOn: '2026-07-01',
      quantity: 1,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    }
    expect(
      deriveInitialNoveltyDate({
        item: source,
        purchaseEvents: [purchaseEvent],
        earliestKnownWearOn: null,
        notionCreatedAt: null,
        databaseCreatedAt: null,
      }),
    ).toMatchObject({
      initialNoveltyDate: '2024-06-01',
      latestRepurchaseOn: '2026-07-01',
    })
  })

  it('18. uses the exact current C0 partition when Place is missing', () => {
    const result = run(exactData(2), { ...nearbyInput, placeId: null })
    expect(result.integrated.groups).toBe(result.baselineGroups)
    expect(result.integrated.usedCurrentFallback).toBe(true)
  })

  it('19. uses the exact current C0 partition when Transport is missing', () => {
    const result = run(exactData(2), {
      ...nearbyInput,
      transportModeId: null,
    })
    expect(result.integrated.groups).toBe(result.baselineGroups)
    expect(result.integrated.usedCurrentFallback).toBe(true)
  })

  it('20. returns excluded Recent Purchase candidates to normal order', () => {
    const exact = outfit('exact')
    const cross = outfit('cross')
    const data = dataFor(
      [exact, cross],
      [
        wear('exact-log', exact.id),
        wear('cross-log', cross.id, 33, 'ok', { placeId: 'cinema', transportModeId: 'car' }),
      ],
    )
    const { results, integrated } = run(data)
    expect(integrated.movedToRecommendations.map((entry) => entry.outfit.id)).toContain('cross')
    expect(integrated.groups.recommendations).toEqual(
      results.filter(
        (entry) =>
          entry.evidence === 'observed' && entry.outfit.id !== 'exact',
      ),
    )
  })

  it('21. keeps trial recommendations unchanged', () => {
    const exact = manualResult('exact')
    const trial = manualResult('trial', 'untried')
    const baselineGroups: HomeRecommendationPartitions = {
      recentPurchases: [exact],
      recommendations: [],
      trialRecommendations: [trial],
    }
    const data = dataFor(
      [exact.outfit, trial.outfit],
      [wear('exact-log', exact.outfit.id)],
    )
    const integrated = applyContextConditionedRecentPurchaseC1N3({
      data,
      input: nearbyInput,
      results: [exact, trial],
      baselineGroups,
      enabled: true,
    })
    expect(integrated.groups.trialRecommendations).toBe(
      baselineGroups.trialRecommendations,
    )
  })

  it('22. returns the exact baseline partition when feature-off', () => {
    const result = run(exactData(3), nearbyInput, false)
    expect(result.integrated.groups).toBe(result.baselineGroups)
    expect(result.integrated.groups).toEqual(result.baselineGroups)
    expect(result.integrated.groups.recentPurchases).toBe(
      result.baselineGroups.recentPurchases,
    )
    expect(result.integrated.groups.recommendations).toBe(
      result.baselineGroups.recommendations,
    )
    expect(result.integrated.groups.trialRecommendations).toBe(
      result.baselineGroups.trialRecommendations,
    )
  })

  it('23. cannot enable the feature outside development', () => {
    expect(isLocalRecentPurchaseC1N3Enabled(true, undefined)).toBe(false)
    expect(isLocalRecentPurchaseC1N3Enabled(true, 'false')).toBe(false)
    expect(isLocalRecentPurchaseC1N3Enabled(true, 'true')).toBe(true)
    expect(isLocalRecentPurchaseC1N3Enabled(false, 'true')).toBe(false)
  })

  it('24. is stable across input ordering and duplicate Wear Log rows', () => {
    const first = outfit('first')
    const second = outfit('second')
    const logs = [wear('first-log', first.id), wear('second-log', second.id)]
    const base = dataFor([first, second], logs)
    const duplicated = {
      ...structuredClone(base),
      outfits: [...structuredClone(base.outfits)].reverse(),
      wearLogs: [
        ...structuredClone(base.wearLogs).reverse(),
        structuredClone(base.wearLogs[0]),
      ],
    }
    const selectedIds = (data: AppData) =>
      run(data).integrated.groups.recentPurchases.map(
        (entry) => entry.outfit.id,
      )
    expect(selectedIds(duplicated)).toEqual(selectedIds(base))
  })
})
