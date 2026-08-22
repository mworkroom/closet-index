import { describe, expect, it } from 'vitest'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
  type AuthoritativeNoveltyOverride,
  type InitialNoveltyEvidence,
} from './recent-purchase-semantics'
import { recommendOutfits } from './recommendation'
import {
  aggregateItemDerivedEvidence,
  buildSparseEligibilityCandidates,
  calculateScopedItemDerivedEvidence,
  simulateSparseRecentPurchaseEligibility,
} from './sparse-outfit-item-evidence'
import { getItemCategoryGroupId } from './item-categories'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  WearLog,
} from './types'

const input: RecommendationInput = {
  tempOut: 33,
  tempBack: null,
  rainCondition: 'no',
  longWalkCondition: 'no',
  placeId: 'nearby',
  transportModeId: 'short-walk',
}

function item(id: string, category: string, acquiredOn = '2026-07-01'): Item {
  return {
    id,
    name: id,
    category,
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

function outfit(id: string, itemIds: string[]): Outfit {
  return {
    id,
    displayName: id,
    rating: 'ok',
    archivedAt: null,
    itemIds,
  }
}

function log(
  id: string,
  outfitId: string,
  temperature: number,
  feeling: WearLog['feelingOut'] = 'ok',
  options: Partial<WearLog> = {},
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
    ...options,
  }
}

function data(
  items: Item[],
  outfits: Outfit[],
  wearLogs: WearLog[],
): AppData {
  const itemById = new Map(items.map((entry) => [entry.id, entry]))
  const completionItems: Item[] = []
  const completedOutfits = outfits.map((entry) => {
    const groups = new Set(
      entry.itemIds
        .map((itemId) => itemById.get(itemId))
        .filter((candidate): candidate is Item => Boolean(candidate))
        .map((candidate) => getItemCategoryGroupId(candidate.category)),
    )
    const completionIds: string[] = []
    const addCompletion = (suffix: string, category: string) => {
      const completion = {
        ...item(`fixture-${entry.id}-${suffix}`, category, '2020-01-01'),
        acquiredOn: null,
      }
      completionItems.push(completion)
      completionIds.push(completion.id)
    }

    if (!groups.has('dress')) {
      if (!groups.has('top')) addCompletion('top', 'Top-Shirts')
      if (!groups.has('bottom')) addCompletion('bottom', 'Bottom-Pants')
    }
    if (!groups.has('shoes')) addCompletion('shoes', 'Shoes')

    return {
      ...entry,
      itemIds: [...entry.itemIds, ...completionIds],
    }
  })

  return {
    items: [...items, ...completionItems],
    outfits: completedOutfits,
    wearLogs,
    places: [
      { id: 'nearby', name: 'nearby', kind: 'specific_venue' },
      { id: 'cinema', name: 'cinema', kind: 'specific_venue' },
    ],
    placeHvacProfiles: [],
    transportModes: [
      { id: 'short-walk', name: 'short walk' },
      { id: 'car', name: 'Car' },
    ],
  }
}

function overlayFor(
  items: Item[],
  overrides: AuthoritativeNoveltyOverride[] = [],
) {
  const baseline = new Map<string, InitialNoveltyEvidence>(
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
  return applyAuthoritativeNoveltyOverrides(baseline, overrides)
}

function targetDecision(
  source: AppData,
  model: 'S0' | 'S1' | 'S2' | 'S3',
  rule: 'all-core' | 'at-least-two' | 'weighted-majority' = 'all-core',
) {
  const overlay = overlayFor(source.items)
  const candidates = buildSparseEligibilityCandidates({
    data: source,
    input,
    results: recommendOutfits(source, input),
    noveltyOverlay: overlay,
  })
  return simulateSparseRecentPurchaseEligibility({
    candidates,
    noveltyOverlay: overlay,
    model,
    aggregationRule: rule,
  }).decisions.find((decision) => decision.candidate.result.outfit.id === 'target')!
}

describe('sparse Outfit Item-derived evidence', () => {
  it('recovers one 28°C OK Outfit when all core Items have 31–33°C exact support', () => {
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const accessory = item('accessory', 'Bags')
    const source = data(
      [top, bottom, accessory],
      [
        outfit('target', ['top', 'bottom']),
        outfit('top-history', ['top', 'accessory']),
        outfit('bottom-history', ['bottom', 'accessory']),
      ],
      [
        log('target-28', 'target', 28),
        log('top-33', 'top-history', 33),
        log('bottom-31', 'bottom-history', 31),
      ],
    )

    expect(targetDecision(source, 'S0').eligible).toBe(false)
    expect(targetDecision(source, 'S1')).toMatchObject({
      eligible: true,
      basis: 'exact-context-items',
    })
  })

  it('does not borrow jacket Car and cinema evidence as short-walk exact support', () => {
    const jacket = item('jacket', 'Outer-Jacket')
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const source = data(
      [jacket, top, bottom],
      [
        outfit('target', ['jacket', 'top', 'bottom']),
        outfit('jacket-history', ['jacket']),
        outfit('top-history', ['top']),
        outfit('bottom-history', ['bottom']),
      ],
      [
        log('target-28', 'target', 28),
        log('jacket-car', 'jacket-history', 33, 'ok', {
          placeId: 'cinema',
          transportModeId: 'car',
        }),
        log('top-short', 'top-history', 33),
        log('bottom-short', 'bottom-history', 33),
      ],
    )

    expect(targetDecision(source, 'S1').eligible).toBe(false)
    expect(targetDecision(source, 'S3').basis).toBe('overall-items')
  })

  it('does not override one direct 33°C hot issue with Item support', () => {
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const source = data(
      [top, bottom],
      [
        outfit('target', ['top', 'bottom']),
        outfit('top-history', ['top']),
        outfit('bottom-history', ['bottom']),
      ],
      [
        log('target-hot', 'target', 33, 'hot'),
        log('top-ok', 'top-history', 33),
        log('bottom-ok', 'bottom-history', 33),
      ],
    )

    expect(targetDecision(source, 'S1')).toMatchObject({
      eligible: false,
      basis: 'direct-issue',
    })
  })

  it('compares an untried Outfit with exact-context core Item support in S2', () => {
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const source = data(
      [top, bottom],
      [
        outfit('target', ['top', 'bottom']),
        outfit('top-history', ['top']),
        outfit('bottom-history', ['bottom']),
      ],
      [log('top-ok', 'top-history', 33), log('bottom-ok', 'bottom-history', 33)],
    )

    expect(targetDecision(source, 'S2')).toMatchObject({
      eligible: true,
      basis: 'exact-context-items',
    })
  })

  it('keeps cross-context-only untried evidence unknown in S2 and upper-bound in S3', () => {
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const source = data(
      [top, bottom],
      [
        outfit('target', ['top', 'bottom']),
        outfit('top-history', ['top']),
        outfit('bottom-history', ['bottom']),
      ],
      [
        log('top-car', 'top-history', 33, 'ok', {
          placeId: 'cinema',
          transportModeId: 'car',
        }),
        log('bottom-car', 'bottom-history', 33, 'ok', {
          placeId: 'cinema',
          transportModeId: 'car',
        }),
      ],
    )

    expect(targetDecision(source, 'S2').eligible).toBe(false)
    expect(targetDecision(source, 'S3')).toMatchObject({
      eligible: true,
      basis: 'overall-items',
    })
  })

  it('does not label two cooler direct OK logs negative but keeps them outside the 0–1 fallback', () => {
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const source = data(
      [top, bottom],
      [
        outfit('target', ['top', 'bottom']),
        outfit('top-history', ['top']),
        outfit('bottom-history', ['bottom']),
      ],
      [
        log('target-28', 'target', 28),
        log('target-29', 'target', 29),
        log('top-ok', 'top-history', 33),
        log('bottom-ok', 'bottom-history', 33),
      ],
    )

    const decision = targetDecision(source, 'S2')
    expect(decision.candidate.direct.outcomeNearTarget).toBe('unknown')
    expect(decision).toMatchObject({
      eligible: false,
      basis: 'outside-model-log-threshold',
    })
  })

  it('does not let Top-T-shirts-innerwear become the only thermal support', () => {
    const inner = item('inner', 'Top-T-shirts-innerwear')
    const source = data(
      [inner],
      [outfit('target', ['inner']), outfit('inner-history', ['inner'])],
      [log('inner-ok', 'inner-history', 33)],
    )
    const evidence = calculateScopedItemDerivedEvidence({
      data: source,
      targetOutfit: source.outfits[0],
      input,
    })
    expect(
      aggregateItemDerivedEvidence(evidence, 'exactContext', 'all-core'),
    ).toMatchObject({ eligible: false, hasNonInnerwearSupport: false })
  })

  it('does not let accessory-only evidence create eligibility', () => {
    const bag = item('bag', 'Bags')
    const source = data(
      [bag],
      [outfit('target', ['bag']), outfit('bag-history', ['bag'])],
      [log('bag-ok', 'bag-history', 33)],
    )
    expect(targetDecision(source, 'S2').eligible).toBe(false)
  })

  it('lets a relevant direct issue win over derived evidence under every aggregation rule', () => {
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const source = data(
      [top, bottom],
      [
        outfit('target', ['top', 'bottom']),
        outfit('top-history', ['top']),
        outfit('bottom-history', ['bottom']),
      ],
      [
        log('target-cold', 'target', 33, 'cold'),
        log('top-ok', 'top-history', 33),
        log('bottom-ok', 'bottom-history', 33),
      ],
    )
    for (const rule of [
      'all-core',
      'at-least-two',
      'weighted-majority',
    ] as const) {
      expect(targetDecision(source, 'S3', rule).basis).toBe('direct-issue')
    }
  })

  it('deduplicates Wear Log endpoints and is independent of input order', () => {
    const top = item('top', 'Top-T-shirts')
    const target = outfit('target', ['top'])
    const history = outfit('history', ['top'])
    const evidenceLog = log('same-log', 'history', 33)
    const first = data([top], [target, history], [evidenceLog, evidenceLog])
    const second = data([top], [history, target], [evidenceLog])
    const summarize = (source: AppData) =>
      calculateScopedItemDerivedEvidence({
        data: source,
        targetOutfit: target,
        input,
      }).items[0].scopes.exactContext

    expect(summarize(first)).toEqual(summarize(second))
    expect(summarize(first).distinctWearLogCount).toBe(1)
    expect(summarize(first).observationCount).toBe(1)
  })
})
