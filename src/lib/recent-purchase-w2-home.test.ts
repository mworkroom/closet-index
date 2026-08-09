import { describe, expect, it } from 'vitest'
import { partitionRecommendations, recommendOutfits } from './recommendation'
import { deriveInitialNoveltyDate } from './recent-purchase-semantics'
import {
  applyRecentPurchaseW2Home,
  isLocalRecentPurchaseW2Enabled,
} from './recent-purchase-w2-home'
import type {
  AppData,
  Item,
  Outfit,
  PurchaseEvent,
  RecommendationInput,
  ThermalFeeling,
  WearLog,
} from './types'

const asOfDate = '2026-08-08'
const input: RecommendationInput = {
  tempOut: 33,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'nearby',
  transportModeId: 'short-walk',
}

function item(
  id: string,
  acquiredOn = '2026-07-01',
  category = 'Top-T-shirts',
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
    itemIds,
  }
}

function wear(
  id: string,
  outfitId: string,
  temperature = 33,
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
    observedHvacMemo: null,
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
  sourceItems: Item[] = [],
): AppData {
  const generatedItems = outfits.flatMap((entry) =>
    entry.itemIds.map((itemId) => item(itemId)),
  )
  return {
    items: [
      ...new Map(
        [...generatedItems, ...sourceItems].map((entry) => [entry.id, entry]),
      ).values(),
    ],
    outfits,
    wearLogs,
    places: [
      { id: 'nearby', name: 'Nearby', kind: 'specific_venue' },
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
  scenarioInput = input,
  enabled = true,
) {
  const results = recommendOutfits(data, scenarioInput)
  const baselineGroups = partitionRecommendations(results)
  return {
    results,
    baselineGroups,
    integrated: applyRecentPurchaseW2Home({
      data,
      input: scenarioInput,
      results,
      baselineGroups,
      enabled,
      asOfDate,
    }),
  }
}

function exactOutfit(
  id: string,
  acquiredOn = '2026-07-01',
) {
  const target = outfit(id)
  return dataFor(
    [target],
    [wear(`${id}-log`, target.id)],
    [item(target.itemIds[0], acquiredOn)],
  )
}

describe('disabled HOME Recent Purchase W2 integration', () => {
  it('1. includes a source Item exactly 365 calendar days old', () => {
    const result = run(exactOutfit('day-365', '2025-08-08')).integrated
    expect(result.groups.recentPurchases).toHaveLength(1)
    expect(result.simulation?.selections[0].ageDays).toBe(365)
  })

  it('2. expires a source Item 366 calendar days old', () => {
    const result = run(exactOutfit('day-366', '2025-08-07')).integrated
    expect(result.groups.recentPurchases).toEqual([])
  })

  it('3. includes a source Item 250 days old', () => {
    const result = run(exactOutfit('day-250', '2025-12-01')).integrated
    expect(result.groups.recentPurchases).toHaveLength(1)
    expect(result.simulation?.selections[0].ageDays).toBe(250)
  })

  it('4. ranks recent exact support before newer exploration', () => {
    const exact = outfit('exact')
    const cross = outfit('cross')
    const result = run(
      dataFor(
        [cross, exact],
        [
          wear('cross-log', cross.id, 33, 'ok', {
            placeId: 'other',
            transportModeId: 'car',
          }),
          wear('exact-log', exact.id),
        ],
        [
          item(cross.itemIds[0], '2026-08-01'),
          item(exact.itemIds[0], '2026-01-01'),
        ],
      ),
    ).integrated
    expect(result.groups.recentPurchases.map((entry) => entry.outfit.id)).toEqual([
      exact.id,
      cross.id,
    ])
  })

  it('5. ranks current-Transport support below exact support', () => {
    const exact = outfit('exact')
    const transport = outfit('transport')
    const result = run(
      dataFor(
        [transport, exact],
        [
          wear('transport-log', transport.id, 33, 'ok', { placeId: 'other' }),
          wear('exact-log', exact.id),
        ],
      ),
    ).integrated
    expect(result.simulation?.selections.map((entry) => entry.tier)).toEqual([
      'exact_support',
      'current_transport_support',
    ])
  })

  it('6. keeps a recent cross-context-only Outfit exploration-eligible', () => {
    const target = outfit('cross')
    const result = run(
      dataFor(
        [target],
        [
          wear('cross-log', target.id, 33, 'ok', {
            placeId: 'other',
            transportModeId: 'car',
          }),
        ],
      ),
    ).integrated
    expect(result.simulation?.selections[0].tier).toBe('cross_context_only')
  })

  it('7. keeps a recent unknown Outfit exploration-eligible', () => {
    const target = outfit('unknown')
    const result = run(
      dataFor(
        [target],
        [
          wear('cold-side', target.id, 20, 'ok', {
            placeId: 'other',
            transportModeId: 'car',
          }),
          wear('hot-side', target.id, 40, 'ok', {
            placeId: 'other',
            transportModeId: 'car',
          }),
        ],
      ),
    ).integrated
    expect(result.simulation?.selections[0].tier).toBe('unknown')
  })

  it('8. excludes exact issue', () => {
    const target = outfit('issue')
    const result = run(
      dataFor(
        [target],
        [
          wear('issue', target.id, 33, 'hot'),
          wear('overall-ok', target.id, 33, 'ok', {
            placeId: 'other',
            transportModeId: 'car',
          }),
        ],
      ),
    ).integrated
    expect(result.simulation?.decisions[0].candidate.context.state).toBe(
      'exact_issue',
    )
    expect(result.groups.recentPurchases).toEqual([])
  })

  it('9. excludes exact mixed evidence', () => {
    const target = outfit('mixed')
    const result = run(
      dataFor(
        [target],
        [wear('mixed-ok', target.id), wear('mixed-hot', target.id, 34, 'hot')],
      ),
    ).integrated
    expect(result.simulation?.decisions[0].candidate.context.state).toBe(
      'exact_mixed',
    )
    expect(result.groups.recentPurchases).toEqual([])
  })

  it('10. does not let repurchase reset an expired source', () => {
    const source = item('repurchased', '2024-01-01')
    const event: PurchaseEvent = {
      id: 'repurchase-event',
      itemId: source.id,
      purchasedOn: '2026-08-01',
      quantity: 1,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }
    const target = outfit('repurchased-outfit', [source.id])
    expect(
      deriveInitialNoveltyDate({
        item: source,
        purchaseEvents: [event],
        earliestKnownWearOn: null,
        notionCreatedAt: null,
        databaseCreatedAt: null,
      }).initialNoveltyDate,
    ).toBe('2024-01-01')
    expect(
      run(dataFor([target], [wear('repurchased-log', target.id)], [source]))
        .integrated.groups.recentPurchases,
    ).toEqual([])
  })

  it('11. does not let Top-T-shirts-innerwear anchor a card', () => {
    const target = outfit('inner-only', ['inner'])
    expect(
      run(
        dataFor(
          [target],
          [wear('inner-log', target.id)],
          [item('inner', '2026-07-01', 'Top-T-shirts-innerwear')],
        ),
      ).integrated.groups.recentPurchases,
    ).toEqual([])
  })

  it('12. keeps an Outfit containing innerwear under another source', () => {
    const target = outfit('inner-plus', ['inner', 'visible'])
    const result = run(
      dataFor(
        [target],
        [wear('inner-plus-log', target.id)],
        [
          item('inner', '2026-07-20', 'Top-T-shirts-innerwear'),
          item('visible', '2026-07-01', 'Top-Blouse'),
        ],
      ),
    ).integrated
    expect(result.simulation?.selections[0].sourceItemId).toBe('visible')
  })

  it('13. gives a duplicate source Item one card only', () => {
    const source = item('shared')
    const first = outfit('shared-first', [source.id])
    const second = outfit('shared-second', [source.id])
    const result = run(
      dataFor(
        [first, second],
        [wear('first-log', first.id), wear('second-log', second.id)],
        [source],
      ),
    ).integrated
    expect(result.groups.recentPurchases).toHaveLength(1)
  })

  it('14. gives an Outfit with duplicate eligible sources one card only', () => {
    const target = outfit('two-sources', ['source-a', 'source-b'])
    const result = run(
      dataFor(
        [target],
        [wear('target-log', target.id)],
        [item('source-a'), item('source-b')],
      ),
    ).integrated
    expect(result.groups.recentPurchases).toHaveLength(1)
  })

  it('15. returns zero cards when no valid recent source exists', () => {
    expect(
      run(exactOutfit('expired', '2024-01-01')).integrated.groups
        .recentPurchases,
    ).toEqual([])
  })

  it('16. returns exactly two cards for two valid sources', () => {
    const first = outfit('first')
    const second = outfit('second')
    expect(
      run(
        dataFor(
          [first, second],
          [wear('first-log', first.id), wear('second-log', second.id)],
        ),
      ).integrated.groups.recentPurchases,
    ).toHaveLength(2)
  })

  it('17. returns an expired exact-support Outfit to normal recommendations', () => {
    const result = run(exactOutfit('expired-exact', '2024-01-01'))
    expect(result.integrated.groups.recentPurchases).toEqual([])
    expect(result.integrated.groups.recommendations[0].outfit.id).toBe(
      'expired-exact',
    )
    expect(result.integrated.movedToRecommendations[0].outfit.id).toBe(
      'expired-exact',
    )
  })

  it('18. uses M-A overall eligibility when Place is missing', () => {
    const result = run(exactOutfit('missing-place'), { ...input, placeId: null })
      .integrated
    expect(result.groups.recentPurchases).toHaveLength(1)
    expect(result.simulation?.selections[0].tier).toBe(
      'missing_context_overall',
    )
    expect(result.usedMissingContextFallback).toBe(true)
  })

  it('19. uses M-A overall eligibility when Transport is missing', () => {
    const result = run(exactOutfit('missing-transport'), {
      ...input,
      transportModeId: null,
    }).integrated
    expect(result.groups.recentPurchases).toHaveLength(1)
    expect(result.simulation?.selections[0].tier).toBe(
      'missing_context_overall',
    )
    expect(result.usedMissingContextFallback).toBe(true)
  })

  it('20. preserves exact partition equality and identity when disabled', () => {
    const result = run(exactOutfit('feature-off'), input, false)
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

  it('21. cannot enable the W2 flag in a production build', () => {
    expect(isLocalRecentPurchaseW2Enabled(true, undefined)).toBe(false)
    expect(isLocalRecentPurchaseW2Enabled(true, 'false')).toBe(false)
    expect(isLocalRecentPurchaseW2Enabled(true, 'true')).toBe(true)
    expect(isLocalRecentPurchaseW2Enabled(false, 'true')).toBe(false)
  })

  it('22. is stable across input ordering and duplicate Wear Log rows', () => {
    const first = outfit('stable-a', ['z-source'])
    const second = outfit('stable-b', ['a-source'])
    const base = dataFor(
      [first, second],
      [wear('stable-a-log', first.id), wear('stable-b-log', second.id)],
      [item('z-source'), item('a-source')],
    )
    const changed: AppData = {
      ...structuredClone(base),
      outfits: [...structuredClone(base.outfits)].reverse(),
      wearLogs: [
        ...structuredClone(base.wearLogs).reverse(),
        structuredClone(base.wearLogs[0]),
      ],
    }
    const selected = (data: AppData) =>
      run(data).integrated.groups.recentPurchases.map(
        (entry) => entry.outfit.id,
      )
    expect(selected(changed)).toEqual(selected(base))
  })
})
