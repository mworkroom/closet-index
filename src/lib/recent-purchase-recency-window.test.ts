import { describe, expect, it } from 'vitest'
import {
  buildContextEligibilityCandidates,
} from './context-conditioned-recent-purchase'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
} from './recent-purchase-semantics'
import {
  noveltyAgeDays,
  simulateRecencyBoundedRecentPurchases,
  type MissingContextRecencyBehavior,
  type RecencyWindowModel,
} from './recent-purchase-recency-window'
import { partitionRecommendations, recommendOutfits } from './recommendation'
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
const completeInput: RecommendationInput = {
  tempOut: 30,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'nearby',
  transportModeId: 'short',
}
const fixtureBottomId = 'fixture-complete-bottom'
const fixtureShoesId = 'fixture-complete-shoes'

function item(
  id: string,
  acquiredOn: string,
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
    itemIds: [...new Set([...itemIds, fixtureBottomId, fixtureShoesId])],
  }
}

function wear(
  id: string,
  outfitId: string,
  feeling: ThermalFeeling = 'ok',
  overrides: Partial<WearLog> = {},
): WearLog {
  return {
    id,
    outfitId,
    wornOn: '2026-07-01',
    tempOut: 30,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: feeling,
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

function dataFor(
  outfits: Outfit[],
  wearLogs: WearLog[],
  sourceItems?: Item[],
): AppData {
  const generatedItems = outfits.flatMap((entry, index) =>
      entry.itemIds.map((itemId) => item(itemId, `2026-07-${20 - index}`)),
    )
  const items = [
    ...new Map(
      [
        ...(sourceItems ?? generatedItems),
        {
          ...item(fixtureBottomId, '2020-01-01', 'Bottom-Pants'),
          acquiredOn: null,
        },
        {
          ...item(fixtureShoesId, '2020-01-01', 'Shoes'),
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
      { id: 'other', name: 'Other', kind: 'specific_venue' },
    ],
    placeHvacProfiles: [],
    transportModes: [
      { id: 'short', name: 'Short' },
      { id: 'car', name: 'Car' },
    ],
  }
}

function overlayFor(data: AppData, purchaseEvents: PurchaseEvent[] = []) {
  const eventsByItem = new Map<string, PurchaseEvent[]>()
  for (const event of purchaseEvents) {
    const events = eventsByItem.get(event.itemId) ?? []
    events.push(event)
    eventsByItem.set(event.itemId, events)
  }
  return applyAuthoritativeNoveltyOverrides(
    new Map(
      data.items.map((source) => [
        source.id,
        deriveInitialNoveltyDate({
          item: source,
          purchaseEvents: eventsByItem.get(source.id) ?? [],
          earliestKnownWearOn: null,
          notionCreatedAt: null,
          databaseCreatedAt: null,
        }),
      ]),
    ),
    [],
  )
}

function run(
  data: AppData,
  model: RecencyWindowModel,
  input = completeInput,
  missingContextBehavior: MissingContextRecencyBehavior = 'overall',
  purchaseEvents: PurchaseEvent[] = [],
) {
  const results = recommendOutfits(data, input)
  const noveltyOverlay = overlayFor(data, purchaseEvents)
  return {
    results,
    simulation: simulateRecencyBoundedRecentPurchases({
      candidates: buildContextEligibilityCandidates({
        data,
        input,
        results,
        noveltyOverlay,
      }),
      noveltyOverlay,
      model,
      asOfDate,
      hasCompleteContext:
        input.placeId !== null && input.transportModeId !== null,
      missingContextBehavior,
    }),
  }
}

describe('recency-bounded Recent Purchase exploration audit', () => {
  it('1. keeps a 90-day cross-context Item under 180 and 365 days', () => {
    const target = outfit('recent-90')
    const data = dataFor(
      [target],
      [wear('log-90', target.id, 'ok', { placeId: 'other', transportModeId: 'car' })],
      [item('item-recent-90', '2026-05-10')],
    )
    expect(noveltyAgeDays('2026-05-10', asOfDate)).toBe(90)
    expect(run(data, 'W1').simulation.selections).toHaveLength(1)
    expect(run(data, 'W2').simulation.selections).toHaveLength(1)
  })

  it('2. excludes a 250-day Item under 180 and keeps it under 365', () => {
    const target = outfit('age-250')
    const data = dataFor(
      [target],
      [wear('log-250', target.id)],
      [item('item-age-250', '2025-12-01')],
    )
    expect(noveltyAgeDays('2025-12-01', asOfDate)).toBe(250)
    expect(run(data, 'W1').simulation.selections).toEqual([])
    expect(run(data, 'W2').simulation.selections).toHaveLength(1)
  })

  it('3. excludes a 400-day exact-support Item under both windows', () => {
    const target = outfit('age-400')
    const data = dataFor(
      [target],
      [wear('log-400', target.id)],
      [item('item-age-400', '2025-07-04')],
    )
    expect(noveltyAgeDays('2025-07-04', asOfDate)).toBe(400)
    expect(run(data, 'W1').simulation.selections).toEqual([])
    expect(run(data, 'W2').simulation.selections).toEqual([])
  })

  it('4. keeps an expired exact-support linen Outfit in normal recommendations', () => {
    const linen = outfit('linen')
    const data = dataFor(
      [linen],
      [wear('linen-log', linen.id)],
      [item('item-linen', '2025-07-04', 'Top-Shirts')],
    )
    const simulation = run(data, 'W2').simulation
    expect(simulation.selections).toEqual([])
    expect(simulation.normalRecommendations.map((entry) => entry.outfit.id)).toEqual([
      linen.id,
    ])
  })

  it('5. ranks a recent cross-context Item below exact support', () => {
    const exact = outfit('exact')
    const cross = outfit('cross')
    const data = dataFor(
      [cross, exact],
      [
        wear('cross-log', cross.id, 'ok', { placeId: 'other', transportModeId: 'car' }),
        wear('exact-log', exact.id),
      ],
      [
        item('item-cross', '2026-07-20'),
        item('item-exact', '2026-05-01'),
      ],
    )
    const selections = run(data, 'W1').simulation.selections
    expect(selections.map((entry) => entry.result.outfit.id)).toEqual([
      exact.id,
      cross.id,
    ])
    expect(selections.map((entry) => entry.tier)).toEqual([
      'exact_support',
      'cross_context_only',
    ])
  })

  it('6. excludes recent exact issue', () => {
    const target = outfit('issue')
    const data = dataFor(
      [target],
      [
        wear('issue-ok', target.id, 'ok', { placeId: 'other', transportModeId: 'car' }),
        wear('issue-hot', target.id, 'hot'),
      ],
    )
    const simulation = run(data, 'W1').simulation
    expect(simulation.decisions[0].candidate.context.state).toBe('exact_issue')
    expect(simulation.selections).toEqual([])
  })

  it('7. excludes recent exact mixed evidence', () => {
    const target = outfit('mixed')
    const data = dataFor(
      [target],
      [wear('mixed-ok', target.id), wear('mixed-hot', target.id, 'hot')],
    )
    const simulation = run(data, 'W1').simulation
    expect(simulation.decisions[0].candidate.context.state).toBe('exact_mixed')
    expect(simulation.selections).toEqual([])
  })

  it('8. returns zero cards when no valid recent source exists', () => {
    const target = outfit('expired')
    const data = dataFor(
      [target],
      [wear('expired-log', target.id)],
      [item('item-expired', '2024-01-01')],
    )
    expect(run(data, 'W2').simulation.selections).toEqual([])
  })

  it('9. returns exactly two cards for two valid recent sources', () => {
    const first = outfit('first')
    const second = outfit('second')
    const data = dataFor(
      [first, second],
      [wear('first-log', first.id), wear('second-log', second.id)],
    )
    expect(run(data, 'W1').simulation.selections).toHaveLength(2)
  })

  it('10. gives a duplicate source Item one card only', () => {
    const first = outfit('shared-first', ['shared'])
    const second = outfit('shared-second', ['shared'])
    const data = dataFor(
      [first, second],
      [wear('shared-first-log', first.id), wear('shared-second-log', second.id)],
      [item('shared', '2026-07-01')],
    )
    expect(run(data, 'W1').simulation.selections).toHaveLength(1)
  })

  it('11. does not let Top-T-shirts-innerwear anchor a card', () => {
    const target = outfit('innerwear', ['innerwear'])
    const data = dataFor(
      [target],
      [wear('innerwear-log', target.id)],
      [item('innerwear', '2026-07-01', 'Top-T-shirts-innerwear')],
    )
    expect(run(data, 'W1').simulation.selections).toEqual([])
  })

  it('12. does not let repurchase reset an expired novelty window', () => {
    const target = outfit('repurchase')
    const source = item('item-repurchase', '2025-01-01')
    const event: PurchaseEvent = {
      id: 'repurchase-event',
      itemId: source.id,
      purchasedOn: '2026-08-01',
      quantity: 1,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }
    const data = dataFor([target], [wear('repurchase-log', target.id)], [source])
    expect(run(data, 'W2', completeInput, 'overall', [event]).simulation.selections).toEqual([])
  })

  it('13. compares missing-context overall and hidden behavior', () => {
    const target = outfit('missing')
    const data = dataFor([target], [wear('missing-log', target.id)])
    const missingPlace = { ...completeInput, placeId: null }
    expect(run(data, 'W1', missingPlace, 'overall').simulation.selections).toHaveLength(1)
    expect(run(data, 'W1', missingPlace, 'hide').simulation.selections).toEqual([])
    const missingTransport = { ...completeInput, transportModeId: null }
    expect(run(data, 'W2', missingTransport, 'overall').simulation.selections).toHaveLength(1)
    expect(run(data, 'W2', missingTransport, 'hide').simulation.selections).toEqual([])
  })

  it('14. leaves the feature-off HOME partition deeply equal and identical', () => {
    const target = outfit('baseline')
    const data = dataFor([target], [wear('baseline-log', target.id)])
    const results = recommendOutfits(data, completeInput)
    const baseline = partitionRecommendations(results)
    run(data, 'W1')
    expect(partitionRecommendations(results)).toEqual(baseline)
    expect(baseline.recentPurchases[0]).toBe(results[0])
  })

  it('15. is stable across input ordering and duplicate Wear Log rows', () => {
    const first = outfit('stable-a', ['z-source'])
    const second = outfit('stable-b', ['a-source'])
    const logs = [wear('stable-a-log', first.id), wear('stable-b-log', second.id)]
    const data = dataFor(
      [first, second],
      logs,
      [item('z-source', '2026-07-01'), item('a-source', '2026-07-01')],
    )
    const changed: AppData = {
      ...structuredClone(data),
      outfits: [...structuredClone(data.outfits)].reverse(),
      wearLogs: [
        ...structuredClone(data.wearLogs).reverse(),
        structuredClone(data.wearLogs[0]),
      ],
    }
    const selectedIds = (source: AppData) =>
      run(source, 'W1').simulation.selections.map(
        (selection) => selection.result.outfit.id,
      )
    expect(selectedIds(data)[0]).toBe(first.id)
    expect(selectedIds(changed)).toEqual(selectedIds(data))
  })
})
