import type { DirectEvidenceOutcome } from './direct-evidence-policy'
import type {
  Item,
  PurchaseEvent,
  RecommendationResult,
} from './types'

export type InitialNoveltyKind =
  | 'first_acquisition'
  | 'handmade_initial_completion'
  | 'repurchase_or_replenishment'
  | 'unknown'

export type InitialNoveltySource =
  | 'acquired_on'
  | 'earliest_known_wear_upper_bound'
  | 'authoritative_override'
  | 'none'

export type InitialNoveltyConfidence = 'high' | 'medium' | 'low' | 'none'

export interface ItemNoveltyAuditInput {
  item: Pick<Item, 'id' | 'name' | 'category' | 'acquiredOn' | 'currentQuantity'>
  purchaseEvents: readonly PurchaseEvent[]
  earliestKnownWearOn: string | null
  notionCreatedAt: string | null
  databaseCreatedAt: string | null
}

export interface InitialNoveltyEvidence {
  itemId: string
  currentAcquiredOn: string | null
  initialNoveltyDate: string | null
  source: InitialNoveltySource
  kind: InitialNoveltyKind
  confidence: InitialNoveltyConfidence
  incompleteHistory: boolean
  exactFirstAcquisitionKnown: boolean
  earliestKnownWearOn: string | null
  earliestPurchaseEventOn: string | null
  latestPurchaseEventOn: string | null
  latestRepurchaseOn: string | null
  purchaseEventCount: number
  provenance: string[]
}

export interface RecentPurchaseAuditCandidate {
  result: RecommendationResult
  baselineRank: number
  eligibleItemIds: string[]
  currentSourceItemIds: string[]
  noveltySourceItemIds: string[]
}

export type RecentPurchasePolicy = 'R0' | 'R1' | 'R2'
export type RecentPurchaseR3Variant =
  | 'baseline-only'
  | 'support-preferred'
  | 'issue-last'
  | 'issue-excluded'

export interface RecentPurchasePolicySelection {
  result: RecommendationResult
  sourceItemId: string
  noveltyDate: string
  noveltyKind: InitialNoveltyKind
  directOutcome: DirectEvidenceOutcome
  reason: string
}

export interface RecentPurchaseSimulationResult {
  policy: RecentPurchasePolicy | 'R3'
  variant: RecentPurchaseR3Variant | null
  selections: RecentPurchasePolicySelection[]
}

export interface AuthoritativeNoveltyOverride {
  itemId: string
  confirmedInitialNoveltyDate?: string | null
  confirmedRepurchaseDates?: readonly string[]
  knownOldItem?: boolean
  noveltySourceEligible?: boolean
  reason: string
}

export interface AuthoritativeNoveltyOverlay {
  noveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>
  sourceEligibilityByItemId: ReadonlyMap<
    string,
    { eligible: boolean; reason: string }
  >
  overrideByItemId: ReadonlyMap<string, AuthoritativeNoveltyOverride>
}

export type NoveltySourceEligibilityModel = 'N0' | 'N1' | 'N2' | 'N3'
export type NoveltySourceDateKind =
  | 'initial'
  | 'handmade_initial_completion'
  | 'repurchase'

export interface NoveltySourceEligibilitySelection {
  result: RecommendationResult
  sourceItemId: string
  sourceItemCategory: string
  noveltyDate: string
  dateKind: NoveltySourceDateKind
  categoryPolicyApplied: 'current-exact-match' | 'n3-exact-source-policy'
  reason: string
}

export interface NoveltySourceEligibilitySimulation {
  model: NoveltySourceEligibilityModel
  selections: NoveltySourceEligibilitySelection[]
}

export const CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES = [
  'innerwear',
  'socks',
  'acc-neck',
  'acc-waist',
  'acc-head-made',
  'acc-hands-made',
] as const

export const N3_RECENT_PURCHASE_SOURCE_EXCLUDED_CATEGORIES = [
  ...CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES,
  'top-t-shirts-innerwear',
] as const

const currentRecentPurchaseExcludedCategories = new Set<string>(
  CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES,
)
const n3RecentPurchaseSourceExcludedCategories = new Set<string>(
  N3_RECENT_PURCHASE_SOURCE_EXCLUDED_CATEGORIES,
)

function normalizedCategory(category: string) {
  return category.trim().toLocaleLowerCase('en-US')
}

export function isCurrentRecentPurchaseSourceCategory(category: string) {
  return !currentRecentPurchaseExcludedCategories.has(
    normalizedCategory(category),
  )
}

export function isN3RecentPurchaseSourceCategory(category: string) {
  return !n3RecentPurchaseSourceExcludedCategories.has(
    normalizedCategory(category),
  )
}

function countsAsRecentPurchase(item: Pick<Item, 'category'>) {
  return isCurrentRecentPurchaseSourceCategory(item.category)
}

function datePart(value: string | null) {
  return value?.slice(0, 10) ?? null
}

function sortedUniqueDates(values: readonly (string | null)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort()
}

function isHandmadeInitialCompletion(item: Pick<Item, 'category'>) {
  return item.category.trim().toLowerCase().endsWith('-made')
}

/**
 * Audit-only derivation. Purchase Events are replenishment history, so they
 * never become an Item's initial novelty date. A Wear Log earlier than
 * acquiredOn proves that acquiredOn cannot be the first wardrobe introduction;
 * the Wear Log date is retained only as an upper bound, not an invented purchase
 * date.
 */
export function deriveInitialNoveltyDate(
  input: ItemNoveltyAuditInput,
): InitialNoveltyEvidence {
  const acquiredOn = input.item.acquiredOn
  const eventDates = sortedUniqueDates(
    input.purchaseEvents.map((event) => event.purchasedOn),
  )
  const earliestPurchaseEventOn = eventDates[0] ?? null
  const latestPurchaseEventOn = eventDates.at(-1) ?? null
  const notionCreatedOn = datePart(input.notionCreatedAt)
  const databaseCreatedOn = datePart(input.databaseCreatedAt)
  const provenance = [
    acquiredOn ? `acquired_on=${acquiredOn}` : 'acquired_on=null',
    input.earliestKnownWearOn
      ? `earliest_known_wear=${input.earliestKnownWearOn}`
      : 'earliest_known_wear=none',
    earliestPurchaseEventOn
      ? `purchase_events=${earliestPurchaseEventOn}..${latestPurchaseEventOn}`
      : 'purchase_events=none',
    notionCreatedOn
      ? `notion_created_on=${notionCreatedOn}`
      : 'notion_created_on=none',
    databaseCreatedOn
      ? `database_created_on=${databaseCreatedOn}`
      : 'database_created_on=none',
  ]

  if (
    acquiredOn &&
    input.earliestKnownWearOn &&
    input.earliestKnownWearOn < acquiredOn
  ) {
    return {
      itemId: input.item.id,
      currentAcquiredOn: acquiredOn,
      initialNoveltyDate: input.earliestKnownWearOn,
      source: 'earliest_known_wear_upper_bound',
      kind: 'repurchase_or_replenishment',
      confidence: 'low',
      incompleteHistory: true,
      exactFirstAcquisitionKnown: false,
      earliestKnownWearOn: input.earliestKnownWearOn,
      earliestPurchaseEventOn,
      latestPurchaseEventOn,
      latestRepurchaseOn:
        [acquiredOn, latestPurchaseEventOn].filter(Boolean).sort().at(-1) ?? null,
      purchaseEventCount: new Set(input.purchaseEvents.map((event) => event.id)).size,
      provenance: [
        ...provenance,
        'wear_before_acquired_on proves acquired_on is not first introduction',
      ],
    }
  }

  if (!acquiredOn) {
    return {
      itemId: input.item.id,
      currentAcquiredOn: null,
      initialNoveltyDate: null,
      source: 'none',
      kind: 'unknown',
      confidence: 'none',
      incompleteHistory: true,
      exactFirstAcquisitionKnown: false,
      earliestKnownWearOn: input.earliestKnownWearOn,
      earliestPurchaseEventOn,
      latestPurchaseEventOn,
      latestRepurchaseOn: latestPurchaseEventOn,
      purchaseEventCount: new Set(input.purchaseEvents.map((event) => event.id)).size,
      provenance: [
        ...provenance,
        'purchase events are replenishment evidence and cannot fabricate first acquisition',
      ],
    }
  }

  const handmade = isHandmadeInitialCompletion(input.item)
  return {
    itemId: input.item.id,
    currentAcquiredOn: acquiredOn,
    initialNoveltyDate: acquiredOn,
    source: 'acquired_on',
    kind: handmade ? 'handmade_initial_completion' : 'first_acquisition',
    confidence: handmade ? 'high' : 'medium',
    incompleteHistory: Boolean(notionCreatedOn) && input.purchaseEvents.length === 0,
    exactFirstAcquisitionKnown: true,
    earliestKnownWearOn: input.earliestKnownWearOn,
    earliestPurchaseEventOn,
    latestPurchaseEventOn,
    latestRepurchaseOn: latestPurchaseEventOn,
    purchaseEventCount: new Set(input.purchaseEvents.map((event) => event.id)).size,
    provenance,
  }
}

export function applyAuthoritativeNoveltyOverrides(
  baselineByItemId: ReadonlyMap<string, InitialNoveltyEvidence>,
  overrides: readonly AuthoritativeNoveltyOverride[],
): AuthoritativeNoveltyOverlay {
  const noveltyByItemId = new Map(baselineByItemId)
  const sourceEligibilityByItemId = new Map<
    string,
    { eligible: boolean; reason: string }
  >()
  const overrideByItemId = new Map<string, AuthoritativeNoveltyOverride>()

  for (const override of overrides) {
    if (overrideByItemId.has(override.itemId)) {
      throw new Error(`Duplicate authoritative novelty override: ${override.itemId}`)
    }
    const baseline = baselineByItemId.get(override.itemId)
    if (!baseline) {
      throw new Error(`Unknown authoritative novelty Item: ${override.itemId}`)
    }
    if (override.confirmedInitialNoveltyDate && override.knownOldItem) {
      throw new Error(
        `${override.itemId} cannot have both a confirmed initial date and unknown-date known-old status`,
      )
    }

    const repurchaseDates = sortedUniqueDates(
      override.confirmedRepurchaseDates ?? [],
    )
    let evidence = baseline
    if (override.confirmedInitialNoveltyDate) {
      evidence = {
        ...baseline,
        initialNoveltyDate: override.confirmedInitialNoveltyDate,
        source: 'authoritative_override',
        kind: 'first_acquisition',
        confidence: 'high',
        incompleteHistory: false,
        exactFirstAcquisitionKnown: true,
        latestRepurchaseOn:
          [...repurchaseDates, baseline.latestPurchaseEventOn]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null,
        provenance: [
          ...baseline.provenance,
          `authoritative_initial_novelty=${override.confirmedInitialNoveltyDate}`,
          repurchaseDates.length > 0
            ? `authoritative_repurchases=${repurchaseDates.join(',')}`
            : 'authoritative_repurchases=none',
          `authoritative_reason=${override.reason}`,
        ],
      }
    } else if (override.knownOldItem) {
      evidence = {
        ...baseline,
        initialNoveltyDate: null,
        source: 'authoritative_override',
        kind: 'repurchase_or_replenishment',
        confidence: 'high',
        incompleteHistory: true,
        exactFirstAcquisitionKnown: false,
        latestRepurchaseOn:
          [...repurchaseDates, baseline.latestPurchaseEventOn]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null,
        provenance: [
          ...baseline.provenance,
          'authoritative_known_old_item=true',
          repurchaseDates.length > 0
            ? `authoritative_repurchases=${repurchaseDates.join(',')}`
            : 'authoritative_repurchases=none',
          `authoritative_reason=${override.reason}`,
        ],
      }
    } else {
      evidence = {
        ...baseline,
        provenance: [
          ...baseline.provenance,
          `authoritative_reason=${override.reason}`,
        ],
      }
    }

    noveltyByItemId.set(override.itemId, evidence)
    overrideByItemId.set(override.itemId, override)
    if (override.noveltySourceEligible !== undefined) {
      sourceEligibilityByItemId.set(override.itemId, {
        eligible: override.noveltySourceEligible,
        reason: override.reason,
      })
    }
  }

  return {
    noveltyByItemId,
    sourceEligibilityByItemId,
    overrideByItemId,
  }
}

function resultMatchesTargetTemperature(result: RecommendationResult) {
  return (
    result.evidence === 'observed' &&
    result.okRange !== null &&
    result.targetTemp >= result.okRange.min &&
    result.targetTemp <= result.okRange.max
  )
}

export function buildRecentPurchaseAuditCandidates(
  results: readonly RecommendationResult[],
  items: readonly Item[],
  noveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>,
): RecentPurchaseAuditCandidate[] {
  const itemById = new Map(items.map((item) => [item.id, item]))

  return results
    .map((result, baselineIndex) => {
      const outfitItems = result.outfit.itemIds
        .map((itemId) => itemById.get(itemId))
        .filter((item): item is Item => Boolean(item))
        .filter(countsAsRecentPurchase)
      return {
        result,
        baselineRank: baselineIndex + 1,
        eligibleItemIds: outfitItems.map((item) => item.id).sort(),
        currentSourceItemIds: outfitItems
          .filter((item) => item.acquiredOn === result.latestAcquiredOn)
          .map((item) => item.id)
          .sort(),
        noveltySourceItemIds: outfitItems
          .filter((item) => {
            const evidence = noveltyByItemId.get(item.id)
            if (!evidence?.initialNoveltyDate) return false
            return (
              evidence.kind === 'first_acquisition' ||
              evidence.kind === 'handmade_initial_completion'
            )
          })
          .map((item) => item.id)
          .sort(),
      }
    })
    .filter(
      (candidate) =>
        candidate.result.latestAcquiredOn !== null &&
        resultMatchesTargetTemperature(candidate.result),
    )
    .sort(
      (left, right) =>
        left.baselineRank - right.baselineRank ||
        left.result.outfit.id.localeCompare(right.result.outfit.id),
    )
}

function directOutcomeFor(
  outfitId: string,
  directOutcomeByOutfitId: ReadonlyMap<string, DirectEvidenceOutcome>,
) {
  return directOutcomeByOutfitId.get(outfitId) ?? 'unknown'
}

function selection(
  candidate: RecentPurchaseAuditCandidate,
  sourceItemId: string,
  novelty: InitialNoveltyEvidence,
  directOutcomeByOutfitId: ReadonlyMap<string, DirectEvidenceOutcome>,
  reason: string,
): RecentPurchasePolicySelection {
  if (!novelty.initialNoveltyDate) {
    throw new Error(`${sourceItemId} has no auditable novelty date`)
  }
  return {
    result: candidate.result,
    sourceItemId,
    noveltyDate: novelty.initialNoveltyDate,
    noveltyKind: novelty.kind,
    directOutcome: directOutcomeFor(
      candidate.result.outfit.id,
      directOutcomeByOutfitId,
    ),
    reason,
  }
}

function currentProductionSelection(
  candidates: readonly RecentPurchaseAuditCandidate[],
  noveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>,
  directOutcomeByOutfitId: ReadonlyMap<string, DirectEvidenceOutcome>,
  limit: number,
) {
  return [...candidates]
    .sort(
      (left, right) =>
        (right.result.latestAcquiredOn ?? '').localeCompare(
          left.result.latestAcquiredOn ?? '',
        ) ||
        left.baselineRank - right.baselineRank ||
        left.result.outfit.id.localeCompare(right.result.outfit.id),
    )
    .slice(0, limit)
    .map((candidate) => {
      const sourceItemId = candidate.currentSourceItemIds[0]
      const novelty = sourceItemId
        ? noveltyByItemId.get(sourceItemId)
        : undefined
      if (!sourceItemId || !novelty) {
        throw new Error(`${candidate.result.outfit.id} has no current source Item`)
      }
      return selection(
        candidate,
        sourceItemId,
        novelty,
        directOutcomeByOutfitId,
        `current latestAcquiredOn ${candidate.result.latestAcquiredOn}`,
      )
    })
}

function correctedOutfitSelection(
  candidates: readonly RecentPurchaseAuditCandidate[],
  noveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>,
  directOutcomeByOutfitId: ReadonlyMap<string, DirectEvidenceOutcome>,
  limit: number,
) {
  return candidates
    .map((candidate) => {
      const evidence = candidate.eligibleItemIds
        .map((itemId) => noveltyByItemId.get(itemId))
        .filter(
          (entry): entry is InitialNoveltyEvidence =>
            Boolean(entry?.initialNoveltyDate),
        )
        .sort(
          (left, right) =>
            (right.initialNoveltyDate ?? '').localeCompare(
              left.initialNoveltyDate ?? '',
            ) || left.itemId.localeCompare(right.itemId),
        )
      return { candidate, novelty: evidence[0] }
    })
    .filter(
      (
        entry,
      ): entry is {
        candidate: RecentPurchaseAuditCandidate
        novelty: InitialNoveltyEvidence
      } => Boolean(entry.novelty),
    )
    .sort(
      (left, right) =>
        (right.novelty.initialNoveltyDate ?? '').localeCompare(
          left.novelty.initialNoveltyDate ?? '',
        ) ||
        left.candidate.baselineRank - right.candidate.baselineRank ||
        left.candidate.result.outfit.id.localeCompare(
          right.candidate.result.outfit.id,
        ),
    )
    .slice(0, limit)
    .map(({ candidate, novelty }) =>
      selection(
        candidate,
        novelty.itemId,
        novelty,
        directOutcomeByOutfitId,
        `corrected novelty date ${novelty.initialNoveltyDate} from ${novelty.source}`,
      ),
    )
}

const r3OutcomeRank: Record<
  Exclude<RecentPurchaseR3Variant, 'baseline-only'>,
  Record<DirectEvidenceOutcome, number>
> = {
  'support-preferred': {
    direct_support: 0,
    mixed: 1,
    unknown: 1,
    direct_issue: 1,
  },
  'issue-last': {
    direct_support: 0,
    mixed: 0,
    unknown: 0,
    direct_issue: 1,
  },
  'issue-excluded': {
    direct_support: 0,
    mixed: 1,
    unknown: 1,
    direct_issue: 2,
  },
}

function distinctItemSelection(
  candidates: readonly RecentPurchaseAuditCandidate[],
  noveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>,
  directOutcomeByOutfitId: ReadonlyMap<string, DirectEvidenceOutcome>,
  limit: number,
  variant: RecentPurchaseR3Variant,
) {
  const sourceItems = [
    ...new Set(candidates.flatMap((candidate) => candidate.noveltySourceItemIds)),
  ]
    .map((itemId) => noveltyByItemId.get(itemId))
    .filter(
      (entry): entry is InitialNoveltyEvidence =>
        Boolean(entry?.initialNoveltyDate),
    )
    .sort(
      (left, right) =>
        (right.initialNoveltyDate ?? '').localeCompare(
          left.initialNoveltyDate ?? '',
        ) || left.itemId.localeCompare(right.itemId),
    )
  const selectedOutfitIds = new Set<string>()
  const selections: RecentPurchasePolicySelection[] = []

  for (const novelty of sourceItems) {
    let available = candidates.filter(
      (candidate) =>
        candidate.noveltySourceItemIds.includes(novelty.itemId) &&
        !selectedOutfitIds.has(candidate.result.outfit.id),
    )
    if (variant === 'issue-excluded') {
      available = available.filter(
        (candidate) =>
          directOutcomeFor(
            candidate.result.outfit.id,
            directOutcomeByOutfitId,
          ) !== 'direct_issue',
      )
    }
    available.sort((left, right) => {
      if (variant !== 'baseline-only') {
        const ranks = r3OutcomeRank[variant]
        const outcomeDifference =
          ranks[
            directOutcomeFor(
              left.result.outfit.id,
              directOutcomeByOutfitId,
            )
          ] -
          ranks[
            directOutcomeFor(
              right.result.outfit.id,
              directOutcomeByOutfitId,
            )
          ]
        if (outcomeDifference !== 0) return outcomeDifference
      }
      return (
        left.baselineRank - right.baselineRank ||
        left.result.outfit.id.localeCompare(right.result.outfit.id)
      )
    })
    const chosen = available[0]
    if (!chosen) continue
    selectedOutfitIds.add(chosen.result.outfit.id)
    const outcome = directOutcomeFor(
      chosen.result.outfit.id,
      directOutcomeByOutfitId,
    )
    selections.push(
      selection(
        chosen,
        novelty.itemId,
        novelty,
        directOutcomeByOutfitId,
        `${variant}; Item ${novelty.initialNoveltyDate}; exact context ${outcome}; baseline rank ${chosen.baselineRank}`,
      ),
    )
    if (selections.length === limit) break
  }

  return selections
}

export function simulateRecentPurchasePolicies({
  candidates,
  noveltyByItemId,
  directOutcomeByOutfitId = new Map(),
  limit = 3,
}: {
  candidates: readonly RecentPurchaseAuditCandidate[]
  noveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>
  directOutcomeByOutfitId?: ReadonlyMap<string, DirectEvidenceOutcome>
  limit?: number
}): RecentPurchaseSimulationResult[] {
  const r0: RecentPurchaseSimulationResult = {
    policy: 'R0',
    variant: null,
    selections: currentProductionSelection(
      candidates,
      noveltyByItemId,
      directOutcomeByOutfitId,
      limit,
    ),
  }
  const r1: RecentPurchaseSimulationResult = {
    policy: 'R1',
    variant: null,
    selections: correctedOutfitSelection(
      candidates,
      noveltyByItemId,
      directOutcomeByOutfitId,
      limit,
    ),
  }
  const r2: RecentPurchaseSimulationResult = {
    policy: 'R2',
    variant: null,
    selections: distinctItemSelection(
      candidates,
      noveltyByItemId,
      directOutcomeByOutfitId,
      limit,
      'baseline-only',
    ),
  }
  const r3Variants: RecentPurchaseR3Variant[] = [
    'baseline-only',
    'support-preferred',
    'issue-last',
    'issue-excluded',
  ]
  return [
    r0,
    r1,
    r2,
    ...r3Variants.map((variant): RecentPurchaseSimulationResult => ({
      policy: 'R3',
      variant,
      selections: distinctItemSelection(
        candidates,
        noveltyByItemId,
        directOutcomeByOutfitId,
        limit,
        variant,
      ),
    })),
  ]
}

function isGenuineNoveltyEvidence(
  evidence: InitialNoveltyEvidence | undefined,
): evidence is InitialNoveltyEvidence & { initialNoveltyDate: string } {
  return Boolean(
    evidence?.initialNoveltyDate &&
      (evidence.kind === 'first_acquisition' ||
        evidence.kind === 'handmade_initial_completion'),
  )
}

function noveltyDateKind(
  evidence: InitialNoveltyEvidence,
): Exclude<NoveltySourceDateKind, 'repurchase'> {
  return evidence.kind === 'handmade_initial_completion'
    ? 'handmade_initial_completion'
    : 'initial'
}

function modelSelection(
  candidate: RecentPurchaseAuditCandidate,
  item: Item,
  date: string,
  dateKind: NoveltySourceDateKind,
  model: NoveltySourceEligibilityModel,
  reason: string,
): NoveltySourceEligibilitySelection {
  return {
    result: candidate.result,
    sourceItemId: item.id,
    sourceItemCategory: item.category,
    noveltyDate: date,
    dateKind,
    categoryPolicyApplied:
      model === 'N3' ? 'n3-exact-source-policy' : 'current-exact-match',
    reason,
  }
}

function distinctCorrectedNoveltySelection({
  model,
  candidates,
  itemById,
  overlay,
  limit,
}: {
  model: 'N2' | 'N3'
  candidates: readonly RecentPurchaseAuditCandidate[]
  itemById: ReadonlyMap<string, Item>
  overlay: AuthoritativeNoveltyOverlay
  limit: number
}) {
  const sourceItems = [
    ...new Set(candidates.flatMap((candidate) => candidate.eligibleItemIds)),
  ]
    .map((itemId) => ({
      item: itemById.get(itemId),
      evidence: overlay.noveltyByItemId.get(itemId),
      explicitEligibility: overlay.sourceEligibilityByItemId.get(itemId),
    }))
    .filter(
      (
        entry,
      ): entry is {
        item: Item
        evidence: InitialNoveltyEvidence & { initialNoveltyDate: string }
        explicitEligibility:
          | { eligible: boolean; reason: string }
          | undefined
      } =>
        Boolean(entry.item) &&
        isGenuineNoveltyEvidence(entry.evidence) &&
        (model !== 'N3' ||
          (isN3RecentPurchaseSourceCategory(entry.item!.category) &&
            entry.explicitEligibility?.eligible !== false)),
    )
    .sort(
      (left, right) =>
        right.evidence.initialNoveltyDate.localeCompare(
          left.evidence.initialNoveltyDate,
        ) || left.item.id.localeCompare(right.item.id),
    )

  const selectedOutfitIds = new Set<string>()
  const selections: NoveltySourceEligibilitySelection[] = []
  for (const source of sourceItems) {
    const candidate = candidates
      .filter(
        (entry) =>
          entry.eligibleItemIds.includes(source.item.id) &&
          !selectedOutfitIds.has(entry.result.outfit.id),
      )
      .sort(
        (left, right) =>
          left.baselineRank - right.baselineRank ||
          left.result.outfit.id.localeCompare(right.result.outfit.id),
      )[0]
    if (!candidate) continue
    selectedOutfitIds.add(candidate.result.outfit.id)
    selections.push(
      modelSelection(
        candidate,
        source.item,
        source.evidence.initialNoveltyDate,
        noveltyDateKind(source.evidence),
        model,
        `${model} distinct Item-first; authoritative novelty ${source.evidence.initialNoveltyDate}; baseline rank ${candidate.baselineRank}`,
      ),
    )
    if (selections.length === limit) break
  }
  return selections
}

/**
 * Test-only N0-N3 comparison. It never mutates Items, RecommendationResults,
 * Purchase Events, or HOME partition arrays.
 */
export function simulateNoveltySourceEligibilityModels({
  candidates,
  items,
  baselineNoveltyByItemId,
  authoritativeOverrides,
  limit = 3,
}: {
  candidates: readonly RecentPurchaseAuditCandidate[]
  items: readonly Item[]
  baselineNoveltyByItemId: ReadonlyMap<string, InitialNoveltyEvidence>
  authoritativeOverrides: readonly AuthoritativeNoveltyOverride[]
  limit?: number
}): NoveltySourceEligibilitySimulation[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const overlay = applyAuthoritativeNoveltyOverrides(
    baselineNoveltyByItemId,
    authoritativeOverrides,
  )

  const n0Selections = [...candidates]
    .sort(
      (left, right) =>
        (right.result.latestAcquiredOn ?? '').localeCompare(
          left.result.latestAcquiredOn ?? '',
        ) ||
        left.baselineRank - right.baselineRank ||
        left.result.outfit.id.localeCompare(right.result.outfit.id),
    )
    .slice(0, limit)
    .map((candidate) => {
      const sourceItemId = candidate.currentSourceItemIds[0]
      const sourceItem = sourceItemId ? itemById.get(sourceItemId) : undefined
      const currentDate = candidate.result.latestAcquiredOn
      if (!sourceItem || !currentDate) {
        throw new Error(`${candidate.result.outfit.id} has no N0 source Item`)
      }
      const override = overlay.overrideByItemId.get(sourceItem.id)
      const confirmedRepurchase =
        override?.confirmedRepurchaseDates?.includes(currentDate) ?? false
      return modelSelection(
        candidate,
        sourceItem,
        currentDate,
        confirmedRepurchase || override?.knownOldItem
          ? 'repurchase'
          : baselineNoveltyByItemId.get(sourceItem.id)?.kind ===
              'handmade_initial_completion'
            ? 'handmade_initial_completion'
            : 'initial',
        'N0',
        `N0 current latestAcquiredOn ${currentDate}`,
      )
    })

  const n1Selections = candidates
    .map((candidate) => {
      const source = candidate.eligibleItemIds
        .map((itemId) => ({
          item: itemById.get(itemId),
          evidence: overlay.noveltyByItemId.get(itemId),
        }))
        .filter(
          (
            entry,
          ): entry is {
            item: Item
            evidence: InitialNoveltyEvidence & { initialNoveltyDate: string }
          } => Boolean(entry.item) && isGenuineNoveltyEvidence(entry.evidence),
        )
        .sort(
          (left, right) =>
            right.evidence.initialNoveltyDate.localeCompare(
              left.evidence.initialNoveltyDate,
            ) || left.item.id.localeCompare(right.item.id),
        )[0]
      return source ? { candidate, source } : null
    })
    .filter(
      (
        entry,
      ): entry is {
        candidate: RecentPurchaseAuditCandidate
        source: {
          item: Item
          evidence: InitialNoveltyEvidence & { initialNoveltyDate: string }
        }
      } => Boolean(entry),
    )
    .sort(
      (left, right) =>
        right.source.evidence.initialNoveltyDate.localeCompare(
          left.source.evidence.initialNoveltyDate,
        ) ||
        left.candidate.baselineRank - right.candidate.baselineRank ||
        left.candidate.result.outfit.id.localeCompare(
          right.candidate.result.outfit.id,
        ),
    )
    .slice(0, limit)
    .map(({ candidate, source }) =>
      modelSelection(
        candidate,
        source.item,
        source.evidence.initialNoveltyDate,
        noveltyDateKind(source.evidence),
        'N1',
        `N1 authoritative Outfit-first novelty ${source.evidence.initialNoveltyDate}; baseline rank ${candidate.baselineRank}`,
      ),
    )

  return [
    { model: 'N0', selections: n0Selections },
    { model: 'N1', selections: n1Selections },
    {
      model: 'N2',
      selections: distinctCorrectedNoveltySelection({
        model: 'N2',
        candidates,
        itemById,
        overlay,
        limit,
      }),
    },
    {
      model: 'N3',
      selections: distinctCorrectedNoveltySelection({
        model: 'N3',
        candidates,
        itemById,
        overlay,
        limit,
      }),
    },
  ]
}
