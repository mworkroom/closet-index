import {
  calculateOutfitContextEligibility,
  type ContextEligibilityState,
  type OutfitContextEligibility,
} from './context-conditioned-recent-purchase'
import type {
  AppData,
  RecommendationInput,
  RecommendationLevel,
  RecommendationResult,
} from './types'

export type NormalRecommendationContextModel = 'N0' | 'N1' | 'N2'

export type NormalRecommendationContextTier =
  | 'baseline_overall'
  | 'exact_support'
  | 'current_transport_support'
  | 'cross_context_only'
  | 'unknown'
  | 'exact_mixed'
  | 'exact_issue'
  | 'excluded'

export interface NormalRecommendationContextDecision {
  result: RecommendationResult
  baselineRank: number
  context: OutfitContextEligibility
  tier: NormalRecommendationContextTier
  verified: boolean
  fallback: boolean
  included: boolean
  temperatureDistance: number
}

export interface NormalRecommendationContextSimulation {
  model: NormalRecommendationContextModel
  decisions: NormalRecommendationContextDecision[]
  ordered: RecommendationResult[]
  verified: RecommendationResult[]
  fallback: RecommendationResult[]
  excluded: RecommendationResult[]
}

const levelRank: Record<RecommendationLevel, number> = {
  high: 0,
  possible: 1,
  caution: 2,
}

const tierRank: Record<NormalRecommendationContextTier, number> = {
  baseline_overall: 0,
  exact_support: 0,
  current_transport_support: 1,
  cross_context_only: 2,
  unknown: 3,
  exact_mixed: 4,
  exact_issue: 5,
  excluded: 99,
}

function temperatureDistance(result: RecommendationResult) {
  if (!result.okRange) return Number.POSITIVE_INFINITY
  if (result.targetTemp < result.okRange.min) {
    return result.okRange.min - result.targetTemp
  }
  if (result.targetTemp > result.okRange.max) {
    return result.targetTemp - result.okRange.max
  }
  return 0
}

function tierFor(
  model: NormalRecommendationContextModel,
  state: ContextEligibilityState,
): NormalRecommendationContextTier {
  if (model === 'N0') return 'baseline_overall'
  if (state === 'exact_support') return 'exact_support'
  if (state === 'current_transport_support') return 'current_transport_support'
  if (model === 'N2' && state === 'cross_context_only') return state
  if (model === 'N2' && (state === 'unknown' || state === 'untried')) {
    return 'unknown'
  }
  if (model === 'N2' && state === 'exact_mixed') return state
  if (model === 'N2' && state === 'exact_issue') return state
  return 'excluded'
}

function isVerified(tier: NormalRecommendationContextTier) {
  return tier === 'exact_support' || tier === 'current_transport_support'
}

function isFallback(tier: NormalRecommendationContextTier) {
  return tier === 'cross_context_only' || tier === 'unknown'
}

/**
 * Read-only comparison for normal recommendations. It does not mutate, remove,
 * or reconnect candidates to HOME; callers receive separate model projections.
 */
export function simulateNormalRecommendationContextModels({
  data,
  input,
  baselineRecommendations,
}: {
  data: Pick<AppData, 'wearLogs'>
  input: RecommendationInput
  baselineRecommendations: readonly RecommendationResult[]
}): NormalRecommendationContextSimulation[] {
  const logsByOutfitId = new Map<string, AppData['wearLogs']>()
  for (const log of data.wearLogs) {
    const logs = logsByOutfitId.get(log.outfitId)
    if (logs) logs.push(log)
    else logsByOutfitId.set(log.outfitId, [log])
  }
  const baseDecisions = baselineRecommendations.map((result, baselineRank) => ({
    result,
    baselineRank,
    context: calculateOutfitContextEligibility(
      logsByOutfitId.get(result.outfit.id) ?? [],
      input,
    ),
    temperatureDistance: temperatureDistance(result),
  }))

  return (['N0', 'N1', 'N2'] as const).map((model) => {
    const decisions: NormalRecommendationContextDecision[] = baseDecisions.map(
      (candidate) => {
        const tier = tierFor(model, candidate.context.state)
        return {
          ...candidate,
          tier,
          verified: isVerified(tier),
          fallback: isFallback(tier),
          included: tier !== 'excluded',
        }
      },
    )
    const orderedDecisions =
      model === 'N0'
        ? decisions
        : decisions
            .filter((decision) => decision.included)
            .sort(
              (left, right) =>
                levelRank[left.result.level] - levelRank[right.result.level] ||
                tierRank[left.tier] - tierRank[right.tier] ||
                left.baselineRank - right.baselineRank ||
                left.result.outfit.id.localeCompare(right.result.outfit.id),
            )

    return {
      model,
      decisions,
      ordered: orderedDecisions.map((decision) => decision.result),
      verified: orderedDecisions
        .filter((decision) => decision.verified)
        .map((decision) => decision.result),
      fallback: orderedDecisions
        .filter((decision) => decision.fallback)
        .map((decision) => decision.result),
      excluded: decisions
        .filter((decision) => !decision.included)
        .sort((left, right) => left.baselineRank - right.baselineRank)
        .map((decision) => decision.result),
    }
  })
}
