import { describe, expect, it } from 'vitest'
import { calculateContextEvidence } from './context-evidence'
import {
  buildRecentPurchaseAuditCandidates,
  deriveInitialNoveltyDate,
  simulateRecentPurchasePolicies,
  type InitialNoveltyEvidence,
  type RecentPurchaseAuditCandidate,
} from './recent-purchase-semantics'
import type {
  Item,
  Outfit,
  PurchaseEvent,
  RecommendationResult,
} from './types'

function item(
  id: string,
  acquiredOn: string | null,
  options: Partial<Item> = {},
): Item {
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
    ...options,
  }
}

function purchaseEvent(
  id: string,
  itemId: string,
  purchasedOn: string,
): PurchaseEvent {
  return {
    id,
    itemId,
    purchasedOn,
    quantity: 1,
    createdAt: `${purchasedOn}T00:00:00Z`,
    updatedAt: `${purchasedOn}T00:00:00Z`,
  }
}

function novelty(
  sourceItem: Item,
  options: {
    events?: PurchaseEvent[]
    earliestKnownWearOn?: string | null
    notionCreatedAt?: string | null
  } = {},
) {
  return deriveInitialNoveltyDate({
    item: sourceItem,
    purchaseEvents: options.events ?? [],
    earliestKnownWearOn: options.earliestKnownWearOn ?? null,
    notionCreatedAt: options.notionCreatedAt ?? null,
    databaseCreatedAt: '2026-07-26T00:00:00Z',
  })
}

function result(
  id: string,
  itemIds: string[],
  latestAcquiredOn: string,
  options: Partial<RecommendationResult> = {},
): RecommendationResult {
  const outfit: Outfit = {
    id,
    displayName: id,
    rating: 'ok',
    archivedAt: null,
    itemIds,
  }
  return {
    outfit,
    level: 'high',
    evidence: 'observed',
    similarEvidence: null,
    contextEvidence: calculateContextEvidence([], {
      placeId: null,
      transportModeId: null,
    }),
    reasons: [],
    warnings: [],
    okRange: { min: 20, max: 40 },
    okObservationCount: 1,
    targetTemp: 30,
    wearCount: 1,
    lastWornOn: '2026-07-01',
    latestAcquiredOn,
    latestAcquiredItemNames: [itemIds[0]],
    ...options,
  }
}

function candidates(
  results: RecommendationResult[],
  items: Item[],
  noveltyByItemId: Map<string, InitialNoveltyEvidence>,
) {
  return buildRecentPurchaseAuditCandidates(results, items, noveltyByItemId)
}

describe('initial novelty provenance', () => {
  it('keeps initial acquisition stable across second and third Purchase Events', () => {
    const source = item('old-item', '2022-01-10', { currentQuantity: 4 })
    const events = [
      purchaseEvent('event-2', source.id, '2025-03-01'),
      purchaseEvent('event-3', source.id, '2026-07-01'),
    ]

    const evidence = novelty(source, { events })
    expect(evidence).toMatchObject({
      initialNoveltyDate: '2022-01-10',
      source: 'acquired_on',
      kind: 'first_acquisition',
      latestRepurchaseOn: '2026-07-01',
      purchaseEventCount: 2,
    })
  })

  it('does not let quantity changes, event edits, or event deletion redefine novelty', () => {
    const before = novelty(item('old-item', '2022-01-10', { currentQuantity: 1 }), {
      events: [purchaseEvent('event', 'old-item', '2026-07-01')],
    })
    const edited = novelty(item('old-item', '2022-01-10', { currentQuantity: 9 }), {
      events: [purchaseEvent('event', 'old-item', '2026-07-02')],
    })
    const deleted = novelty(item('old-item', '2022-01-10', { currentQuantity: 9 }))

    expect([before, edited, deleted].map((entry) => entry.initialNoveltyDate)).toEqual([
      '2022-01-10',
      '2022-01-10',
      '2022-01-10',
    ])
  })

  it('recognizes handmade completion without a Purchase Event', () => {
    expect(
      novelty(
        item('handmade', '2026-07-12', { category: 'Top-Cardigan-made' }),
      ),
    ).toMatchObject({
      initialNoveltyDate: '2026-07-12',
      kind: 'handmade_initial_completion',
      confidence: 'high',
    })
  })

  it('does not fabricate first acquisition from incomplete imported event history', () => {
    expect(
      novelty(item('imported', null), {
        events: [purchaseEvent('later-replenishment', 'imported', '2026-07-01')],
        notionCreatedAt: '2026-04-01T00:00:00Z',
      }),
    ).toMatchObject({
      initialNoveltyDate: null,
      kind: 'unknown',
      incompleteHistory: true,
      exactFirstAcquisitionKnown: false,
    })
  })

  it('marks acquiredOn as repurchase when a Wear Log proves earlier ownership', () => {
    expect(
      novelty(item('reset-item', '2026-05-14'), {
        earliestKnownWearOn: '2024-08-01',
        notionCreatedAt: '2026-04-25T00:00:00Z',
      }),
    ).toMatchObject({
      initialNoveltyDate: '2024-08-01',
      source: 'earliest_known_wear_upper_bound',
      kind: 'repurchase_or_replenishment',
      confidence: 'low',
      exactFirstAcquisitionKnown: false,
      latestRepurchaseOn: '2026-05-14',
    })
  })
})

describe('R0/R1/R2/R3 recent-purchase simulations', () => {
  const repeated = item('repeated-item', '2026-07-20')
  const newA = item('new-a', '2026-07-18')
  const newB = item('new-b', '2026-07-17')
  const allItems = [repeated, newA, newB]
  const noveltyByItemId = new Map(
    allItems.map((entry) => [
      entry.id,
      novelty(entry, {
        earliestKnownWearOn:
          entry.id === 'repeated-item' ? '2024-01-01' : null,
      }),
    ]),
  )
  const baselineResults = [
    result('repeat-1', ['repeated-item'], '2026-07-20'),
    result('repeat-2', ['repeated-item'], '2026-07-20'),
    result('repeat-3', ['repeated-item'], '2026-07-20'),
    result('new-a-best', ['new-a'], '2026-07-18'),
    result('new-a-second', ['new-a'], '2026-07-18'),
    result('new-b-only', ['new-b'], '2026-07-17'),
  ]

  it('keeps R0 duplicates but prevents one source Item from occupying all R2 slots', () => {
    const simulations = simulateRecentPurchasePolicies({
      candidates: candidates(baselineResults, allItems, noveltyByItemId),
      noveltyByItemId,
    })
    const r0 = simulations.find((entry) => entry.policy === 'R0')!
    const r2 = simulations.find((entry) => entry.policy === 'R2')!

    expect(r0.selections.map((entry) => entry.result.outfit.id)).toEqual([
      'repeat-1',
      'repeat-2',
      'repeat-3',
    ])
    expect(r2.selections.map((entry) => entry.result.outfit.id)).toEqual([
      'new-a-best',
      'new-b-only',
    ])
    expect(new Set(r2.selections.map((entry) => entry.sourceItemId)).size).toBe(2)
  })

  it('returns fewer than three cards when fewer distinct genuine new Items qualify', () => {
    const r2 = simulateRecentPurchasePolicies({
      candidates: candidates(
        baselineResults.filter((entry) => !entry.outfit.itemIds.includes('new-b')),
        allItems,
        noveltyByItemId,
      ),
      noveltyByItemId,
    }).find((entry) => entry.policy === 'R2')!
    expect(r2.selections).toHaveLength(1)
  })

  it('keeps unknown evidence exploratory and compares direct-issue variants', () => {
    const directOutcomes = new Map([
      ['new-a-best', 'direct_issue' as const],
      ['new-a-second', 'unknown' as const],
      ['new-b-only', 'direct_support' as const],
    ])
    const simulations = simulateRecentPurchasePolicies({
      candidates: candidates(baselineResults, allItems, noveltyByItemId),
      noveltyByItemId,
      directOutcomeByOutfitId: directOutcomes,
    })
    const r2 = simulations.find((entry) => entry.policy === 'R2')!
    const supportPreferred = simulations.find(
      (entry) => entry.policy === 'R3' && entry.variant === 'support-preferred',
    )!
    const issueLast = simulations.find(
      (entry) => entry.policy === 'R3' && entry.variant === 'issue-last',
    )!
    const issueExcluded = simulations.find(
      (entry) => entry.policy === 'R3' && entry.variant === 'issue-excluded',
    )!

    expect(r2.selections[0].result.outfit.id).toBe('new-a-best')
    expect(supportPreferred.selections[0].result.outfit.id).toBe('new-a-best')
    expect(supportPreferred.selections[0].directOutcome).toBe('direct_issue')
    expect(issueLast.selections[0].result.outfit.id).toBe('new-a-second')
    expect(issueLast.selections[0].directOutcome).toBe('unknown')
    expect(issueExcluded.selections[0].result.outfit.id).toBe('new-a-second')
    expect(issueExcluded.selections[0].directOutcome).toBe('unknown')
  })

  it('is deterministic regardless of candidate input order', () => {
    const built = candidates(baselineResults, allItems, noveltyByItemId)
    const run = (values: RecentPurchaseAuditCandidate[]) =>
      simulateRecentPurchasePolicies({
        candidates: values,
        noveltyByItemId,
      }).map((simulation) => ({
        policy: simulation.policy,
        variant: simulation.variant,
        ids: simulation.selections.map((entry) => entry.result.outfit.id),
      }))

    expect(run([...built].reverse())).toEqual(run(built))
  })

  it('does not mutate normal or trial recommendation arrays', () => {
    const normal = [baselineResults[4]]
    const trial = [
      result('trial', ['new-b'], '2026-07-17', { evidence: 'untried' }),
    ]
    const normalBefore = [...normal]
    const trialBefore = [...trial]
    simulateRecentPurchasePolicies({
      candidates: candidates(baselineResults, allItems, noveltyByItemId),
      noveltyByItemId,
    })
    expect(normal).toEqual(normalBefore)
    expect(trial).toEqual(trialBefore)
  })
})
