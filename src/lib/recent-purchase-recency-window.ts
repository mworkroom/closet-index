import type {
  ContextEligibilityCandidate,
  ContextEligibilityState,
} from './context-conditioned-recent-purchase'
import type { AuthoritativeNoveltyOverlay } from './recent-purchase-semantics'
import type { RecommendationResult } from './types'

export type RecencyWindowModel = 'W1' | 'W2' | 'W3'
export type MissingContextRecencyBehavior = 'overall' | 'hide'
export type RecencyExplorationTier =
  | 'exact_support'
  | 'current_transport_support'
  | 'cross_context_only'
  | 'unknown'
  | 'missing_context_overall'

export interface RecencyWindowDecision {
  candidate: ContextEligibilityCandidate
  eligible: boolean
  tier: RecencyExplorationTier | 'ineligible'
  eligibleSourceItemIds: string[]
  reason: string
}

export interface RecencyWindowSelection {
  result: RecommendationResult
  sourceItemId: string
  noveltyDate: string
  ageDays: number
  tier: RecencyExplorationTier
  reason: string
  decision: RecencyWindowDecision
}

export interface RecencyWindowDiagnostics {
  potentialSourceItemCount: number
  acquiredWithin90Days: number
  acquiredWithin180Days: number
  acquiredWithin365Days: number
  olderThan365Days: number
  distinctEligibleSourceItemCount: number
  expiredSourceItemCount: number
  hiddenExpiredExactSupportSourceItemCount: number
  exactSupportSelectionCount: number
  explorationSelectionCount: number
  oldestSelectedSourceAgeDays: number | null
}

export interface RecencyWindowSimulation {
  model: RecencyWindowModel
  windowDays: 180 | 365
  asOfDate: string
  missingContextBehavior: MissingContextRecencyBehavior
  decisions: RecencyWindowDecision[]
  selections: RecencyWindowSelection[]
  normalRecommendations: RecommendationResult[]
  diagnostics: RecencyWindowDiagnostics
}

const modelWindowDays: Record<RecencyWindowModel, 180 | 365> = {
  W1: 180,
  W2: 365,
  W3: 365,
}

const tierOrder: Record<RecencyExplorationTier, number> = {
  exact_support: 0,
  current_transport_support: 1,
  cross_context_only: 2,
  unknown: 3,
  missing_context_overall: 0,
}

function dateToUtcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Expected YYYY-MM-DD date, received ${value}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function noveltyAgeDays(noveltyDate: string, asOfDate: string) {
  return Math.floor(
    (dateToUtcDay(asOfDate) - dateToUtcDay(noveltyDate)) / 86_400_000,
  )
}

function baselineThermalEligible(candidate: ContextEligibilityCandidate) {
  const result = candidate.result
  return Boolean(
    result.evidence === 'observed' &&
      result.okRange &&
      result.targetTemp >= result.okRange.min &&
      result.targetTemp <= result.okRange.max,
  )
}

function tierForState(
  state: ContextEligibilityState,
  model: RecencyWindowModel,
): RecencyExplorationTier | null {
  if (state === 'exact_support') return 'exact_support'
  if (model === 'W3') return null
  if (state === 'current_transport_support') {
    return 'current_transport_support'
  }
  if (state === 'cross_context_only') return 'cross_context_only'
  if (state === 'unknown') return 'unknown'
  return null
}

function sourceRows(
  sourceItemIds: readonly string[],
  noveltyOverlay: AuthoritativeNoveltyOverlay,
  asOfDate: string,
) {
  return sourceItemIds
    .map((itemId) => {
      const evidence = noveltyOverlay.noveltyByItemId.get(itemId)
      const noveltyDate = evidence?.initialNoveltyDate ?? null
      return noveltyDate
        ? {
            itemId,
            noveltyDate,
            ageDays: noveltyAgeDays(noveltyDate, asOfDate),
          }
        : null
    })
    .filter(
      (
        row,
      ): row is { itemId: string; noveltyDate: string; ageDays: number } =>
        row !== null,
    )
}

export function simulateRecencyBoundedRecentPurchases({
  candidates,
  noveltyOverlay,
  model,
  asOfDate,
  hasCompleteContext,
  missingContextBehavior = 'overall',
  limit = 3,
}: {
  candidates: readonly ContextEligibilityCandidate[]
  noveltyOverlay: AuthoritativeNoveltyOverlay
  model: RecencyWindowModel
  asOfDate: string
  hasCompleteContext: boolean
  missingContextBehavior?: MissingContextRecencyBehavior
  limit?: number
}): RecencyWindowSimulation {
  const windowDays = modelWindowDays[model]
  const decisions = candidates.map((candidate): RecencyWindowDecision => {
    if (!baselineThermalEligible(candidate)) {
      return {
        candidate,
        eligible: false,
        tier: 'ineligible',
        eligibleSourceItemIds: [],
        reason: 'existing observed overall-temperature gate does not pass',
      }
    }

    if (!hasCompleteContext && missingContextBehavior === 'hide') {
      return {
        candidate,
        eligible: false,
        tier: 'ineligible',
        eligibleSourceItemIds: [],
        reason: 'missing Place or Transport hides Recent Purchase',
      }
    }

    const tier = hasCompleteContext
      ? tierForState(candidate.context.state, model)
      : 'missing_context_overall'
    if (!tier) {
      return {
        candidate,
        eligible: false,
        tier: 'ineligible',
        eligibleSourceItemIds: [],
        reason:
          candidate.context.state === 'exact_issue' ||
          candidate.context.state === 'exact_mixed'
            ? `${candidate.context.state} is excluded`
            : `${candidate.context.state} is not eligible in ${model}`,
      }
    }

    const eligibleSourceItemIds = sourceRows(
      candidate.sourceItemIds,
      noveltyOverlay,
      asOfDate,
    )
      .filter((source) => source.ageDays >= 0 && source.ageDays <= windowDays)
      .map((source) => source.itemId)
      .sort()
    return {
      candidate,
      eligible: eligibleSourceItemIds.length > 0,
      tier,
      eligibleSourceItemIds,
      reason:
        eligibleSourceItemIds.length > 0
          ? `${tier}; source novelty is within ${windowDays} days`
          : `all N3 source Items are outside the ${windowDays}-day window`,
    }
  })

  const eligibleDecisions = decisions.filter(
    (
      decision,
    ): decision is RecencyWindowDecision & {
      tier: RecencyExplorationTier
    } => decision.eligible && decision.tier !== 'ineligible',
  )
  const selectedSourceIds = new Set<string>()
  const selectedOutfitIds = new Set<string>()
  const selections: RecencyWindowSelection[] = []
  const tiers = [...new Set(eligibleDecisions.map((decision) => decision.tier))]
    .sort((left, right) => tierOrder[left] - tierOrder[right])

  for (const tier of tiers) {
    const tierDecisions = eligibleDecisions.filter(
      (decision) => decision.tier === tier,
    )
    const pairs = tierDecisions
      .flatMap((decision) =>
        decision.eligibleSourceItemIds.map((itemId) => {
          const noveltyDate = noveltyOverlay.noveltyByItemId.get(itemId)
            ?.initialNoveltyDate
          if (!noveltyDate) return null
          return {
            decision,
            itemId,
            noveltyDate,
            ageDays: noveltyAgeDays(noveltyDate, asOfDate),
          }
        }),
      )
      .filter(
        (pair): pair is {
          decision: (typeof tierDecisions)[number]
          itemId: string
          noveltyDate: string
          ageDays: number
        } => pair !== null,
      )
      .sort(
        (left, right) =>
          right.noveltyDate.localeCompare(left.noveltyDate) ||
          left.decision.candidate.baselineRank -
            right.decision.candidate.baselineRank ||
          left.itemId.localeCompare(right.itemId) ||
          left.decision.candidate.result.outfit.id.localeCompare(
            right.decision.candidate.result.outfit.id,
          ),
      )

    for (const pair of pairs) {
      if (
        selectedSourceIds.has(pair.itemId) ||
        selectedOutfitIds.has(pair.decision.candidate.result.outfit.id)
      ) {
        continue
      }
      selectedSourceIds.add(pair.itemId)
      selectedOutfitIds.add(pair.decision.candidate.result.outfit.id)
      selections.push({
        result: pair.decision.candidate.result,
        sourceItemId: pair.itemId,
        noveltyDate: pair.noveltyDate,
        ageDays: pair.ageDays,
        tier,
        reason: pair.decision.reason,
        decision: pair.decision,
      })
      if (selections.length === limit) break
    }
    if (selections.length === limit) break
  }

  const selectedOutfitIdSet = new Set(
    selections.map((selection) => selection.result.outfit.id),
  )
  const normalRecommendations = candidates
    .map((candidate) => candidate.result)
    .filter(
      (result) =>
        result.evidence === 'observed' &&
        !selectedOutfitIdSet.has(result.outfit.id),
    )
  const potentialSources = [
    ...new Set(
      candidates
        .filter(baselineThermalEligible)
        .flatMap((candidate) => candidate.sourceItemIds),
    ),
  ].flatMap((itemId) =>
    sourceRows([itemId], noveltyOverlay, asOfDate),
  )
  const eligibleSourceIds = new Set(
    eligibleDecisions.flatMap((decision) => decision.eligibleSourceItemIds),
  )
  const expiredSourceIds = new Set(
    potentialSources
      .filter((source) => source.ageDays < 0 || source.ageDays > windowDays)
      .map((source) => source.itemId),
  )
  const hiddenExpiredExactSupportIds = new Set(
    candidates
      .filter(
        (candidate) =>
          baselineThermalEligible(candidate) &&
          candidate.context.state === 'exact_support',
      )
      .flatMap((candidate) =>
        sourceRows(candidate.sourceItemIds, noveltyOverlay, asOfDate),
      )
      .filter((source) => source.ageDays < 0 || source.ageDays > windowDays)
      .map((source) => source.itemId),
  )

  return {
    model,
    windowDays,
    asOfDate,
    missingContextBehavior,
    decisions,
    selections,
    normalRecommendations,
    diagnostics: {
      potentialSourceItemCount: potentialSources.length,
      acquiredWithin90Days: potentialSources.filter(
        (source) => source.ageDays >= 0 && source.ageDays <= 90,
      ).length,
      acquiredWithin180Days: potentialSources.filter(
        (source) => source.ageDays >= 0 && source.ageDays <= 180,
      ).length,
      acquiredWithin365Days: potentialSources.filter(
        (source) => source.ageDays >= 0 && source.ageDays <= 365,
      ).length,
      olderThan365Days: potentialSources.filter(
        (source) => source.ageDays > 365,
      ).length,
      distinctEligibleSourceItemCount: eligibleSourceIds.size,
      expiredSourceItemCount: expiredSourceIds.size,
      hiddenExpiredExactSupportSourceItemCount:
        hiddenExpiredExactSupportIds.size,
      exactSupportSelectionCount: selections.filter(
        (selection) => selection.tier === 'exact_support',
      ).length,
      explorationSelectionCount: selections.filter(
        (selection) => selection.tier !== 'exact_support',
      ).length,
      oldestSelectedSourceAgeDays:
        selections.length > 0
          ? Math.max(...selections.map((selection) => selection.ageDays))
          : null,
    },
  }
}
