import { describe, expect, it } from 'vitest'
import { calculateContextEvidence } from './context-evidence'
import { isLocalDirectEvidenceE2Enabled } from './direct-evidence-home-ranking'
import {
  CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES,
  applyAuthoritativeNoveltyOverrides,
  buildRecentPurchaseAuditCandidates,
  deriveInitialNoveltyDate,
  isCurrentRecentPurchaseSourceCategory,
  isN3RecentPurchaseSourceCategory,
  simulateNoveltySourceEligibilityModels,
  type AuthoritativeNoveltyOverride,
  type InitialNoveltyEvidence,
  type RecentPurchaseAuditCandidate,
} from './recent-purchase-semantics'
import type { Item, Outfit, RecommendationResult } from './types'

function item(
  id: string,
  acquiredOn: string | null,
  category = 'Top-T-shirts',
): Item {
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

function novelty(source: Item) {
  return deriveInitialNoveltyDate({
    item: source,
    purchaseEvents: [],
    earliestKnownWearOn: null,
    notionCreatedAt: null,
    databaseCreatedAt: null,
  })
}

function result(
  id: string,
  itemIds: string[],
  latestAcquiredOn: string,
  evidence: RecommendationResult['evidence'] = 'observed',
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
    evidence,
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
    latestAcquiredItemNames: [],
  }
}

const linen = item('linen', '2026-05-14', 'Outer-Jacket')
const crocs = item('crocs', '2026-06-01', 'Shoes-Sandals')
const cabra = item('cabra', '2026-06-02', 'Top-T-shirts')
const inner = item(
  'inner',
  '2026-08-01',
  'Top-T-shirts-innerwear',
)
const newA = item('new-a', '2026-07-20')
const newB = item('new-b', '2026-07-10', 'Bottom-Skirt')
const unrelatedInnerwearText = item(
  'unrelated-innerwear-text',
  '2026-07-05',
  'Top-T-shirts-innerwear-visible',
)
const allItems = [
  linen,
  crocs,
  cabra,
  inner,
  newA,
  newB,
  unrelatedInnerwearText,
]
const baselineNoveltyByItemId = new Map<string, InitialNoveltyEvidence>(
  allItems.map((entry) => [entry.id, novelty(entry)]),
)
const overrides: AuthoritativeNoveltyOverride[] = [
  {
    itemId: linen.id,
    confirmedInitialNoveltyDate: '2024-06-27',
    confirmedRepurchaseDates: ['2026-05-14'],
    reason: 'human-confirmed initial and repurchase dates',
  },
  {
    itemId: crocs.id,
    confirmedRepurchaseDates: ['2026-06-01'],
    knownOldItem: true,
    reason: 'human-confirmed old Item with unknown initial date',
  },
  {
    itemId: cabra.id,
    confirmedRepurchaseDates: ['2026-06-02'],
    knownOldItem: true,
    reason: 'human-confirmed old Item with unknown initial date',
  },
  {
    itemId: inner.id,
    noveltySourceEligible: false,
    reason: 'exact Top-T-shirts-innerwear source exclusion',
  },
]
const baselineResults = [
  result('inner-only', [inner.id], '2026-08-01'),
  result('new-a-with-inner', [newA.id, inner.id], '2026-08-01'),
  result('new-a-second', [newA.id], '2026-07-20'),
  result('linen-with-new-b', [linen.id, newB.id], '2026-07-10'),
  result(
    'unrelated-innerwear-text',
    [unrelatedInnerwearText.id],
    '2026-07-05',
  ),
  result('cabra-only', [cabra.id], '2026-06-02'),
  result('crocs-only', [crocs.id], '2026-06-01'),
  result('linen-only', [linen.id], '2026-05-14'),
]

function candidates(results = baselineResults) {
  return buildRecentPurchaseAuditCandidates(
    results,
    allItems,
    baselineNoveltyByItemId,
  )
}

function run(candidateRows: RecentPurchaseAuditCandidate[] = candidates()) {
  return simulateNoveltySourceEligibilityModels({
    candidates: candidateRows,
    items: allItems,
    baselineNoveltyByItemId,
    authoritativeOverrides: overrides,
  })
}

describe('authoritative novelty overlay', () => {
  it('uses the user-confirmed initial date instead of the later repurchase date', () => {
    const overlay = applyAuthoritativeNoveltyOverrides(
      baselineNoveltyByItemId,
      overrides,
    )
    expect(overlay.noveltyByItemId.get(linen.id)).toMatchObject({
      initialNoveltyDate: '2024-06-27',
      latestRepurchaseOn: '2026-05-14',
      source: 'authoritative_override',
      exactFirstAcquisitionKnown: true,
    })
  })

  it('keeps a known-old Item without an invented first date', () => {
    const overlay = applyAuthoritativeNoveltyOverrides(
      baselineNoveltyByItemId,
      overrides,
    )
    expect(overlay.noveltyByItemId.get(crocs.id)).toMatchObject({
      initialNoveltyDate: null,
      kind: 'repurchase_or_replenishment',
      latestRepurchaseOn: '2026-06-01',
      exactFirstAcquisitionKnown: false,
    })
  })

  it('never lets a confirmed repurchase reset novelty', () => {
    const linenOnly = run(
      candidates([result('linen-only', [linen.id], '2026-05-14')]),
    )
    expect(linenOnly.find((entry) => entry.model === 'N0')?.selections[0]).toMatchObject({
      noveltyDate: '2026-05-14',
      dateKind: 'repurchase',
    })
    expect(linenOnly.find((entry) => entry.model === 'N1')?.selections[0]).toMatchObject({
      noveltyDate: '2024-06-27',
      dateKind: 'initial',
    })
  })
})

describe('exact novelty-source category eligibility', () => {
  it('confirms the current exact-match bug and the N3-only correction', () => {
    expect(isCurrentRecentPurchaseSourceCategory(inner.category)).toBe(true)
    expect(isN3RecentPurchaseSourceCategory(inner.category)).toBe(false)
  })

  it.each(CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES)(
    'keeps the existing exact category %s excluded',
    (category) => {
      expect(isCurrentRecentPurchaseSourceCategory(category)).toBe(false)
      expect(isN3RecentPurchaseSourceCategory(category)).toBe(false)
    },
  )

  it('does not introduce a broad contains-innerwear exclusion', () => {
    expect(
      isN3RecentPurchaseSourceCategory(unrelatedInnerwearText.category),
    ).toBe(true)
  })

  it('prevents innerwear from anchoring N3 but keeps its Outfit under another source', () => {
    const models = run()
    const n3 = models.find((entry) => entry.model === 'N3')!
    expect(n3.selections.some((entry) => entry.sourceItemId === inner.id)).toBe(
      false,
    )
    expect(n3.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceItemId: newA.id,
          result: expect.objectContaining({
            outfit: expect.objectContaining({ id: 'new-a-with-inner' }),
          }),
        }),
      ]),
    )
  })

  it('keeps an Outfit containing a repurchased Item under another valid source', () => {
    const n3 = run().find((entry) => entry.model === 'N3')!
    expect(n3.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceItemId: newB.id,
          result: expect.objectContaining({
            outfit: expect.objectContaining({ id: 'linen-with-new-b' }),
          }),
        }),
      ]),
    )
  })
})

describe('N0-N3 selection contracts', () => {
  it('allows N0/N1 source duplication but gives one card per source and Outfit in N2/N3', () => {
    const models = run()
    expect(
      models.find((entry) => entry.model === 'N0')?.selections.slice(0, 2),
    ).toSatisfy((selections: typeof models[number]['selections']) =>
      selections.every((entry) => entry.sourceItemId === inner.id),
    )
    for (const modelName of ['N2', 'N3'] as const) {
      const selections = models.find(
        (entry) => entry.model === modelName,
      )!.selections
      expect(new Set(selections.map((entry) => entry.sourceItemId)).size).toBe(
        selections.length,
      )
      expect(
        new Set(selections.map((entry) => entry.result.outfit.id)).size,
      ).toBe(selections.length)
    }
  })

  it('returns fewer than three cards when fewer than three valid sources remain', () => {
    const sparseCandidates = candidates([
      result('new-a-with-inner', [newA.id, inner.id], '2026-08-01'),
      result('new-a-second', [newA.id], '2026-07-20'),
      result('crocs-only', [crocs.id], '2026-06-01'),
    ])
    const n3 = run(sparseCandidates).find((entry) => entry.model === 'N3')!
    expect(n3.selections.map((entry) => entry.sourceItemId)).toEqual([newA.id])
  })

  it('is deterministic regardless of candidate input order', () => {
    const built = candidates()
    const summarize = (rows: RecentPurchaseAuditCandidate[]) =>
      run(rows).map((model) => ({
        model: model.model,
        pairs: model.selections.map((entry) => [
          entry.sourceItemId,
          entry.result.outfit.id,
        ]),
      }))
    expect(summarize([...built].reverse())).toEqual(summarize(built))
  })

  it('does not mutate normal or trial groups and keeps production flags off by default', () => {
    const normal = [result('normal', [newA.id], '2026-07-20')]
    const trial = [result('trial', [newB.id], '2026-07-10', 'untried')]
    const normalBefore = structuredClone(normal)
    const trialBefore = structuredClone(trial)
    run()
    expect(normal).toEqual(normalBefore)
    expect(trial).toEqual(trialBefore)
    expect(isLocalDirectEvidenceE2Enabled(false, 'true')).toBe(false)
    expect(isLocalDirectEvidenceE2Enabled(true, undefined)).toBe(false)
  })
})
