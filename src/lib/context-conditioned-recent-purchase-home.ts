import {
  buildContextEligibilityCandidates,
  simulateContextRecentPurchases,
  type ContextRecentPurchaseSimulation,
} from './context-conditioned-recent-purchase'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
} from './recent-purchase-semantics'
import type {
  AppData,
  RecommendationInput,
  RecommendationResult,
} from './types'

export interface HomeRecommendationPartitions {
  recentPurchases: RecommendationResult[]
  recommendations: RecommendationResult[]
  trialRecommendations: RecommendationResult[]
}

export interface ContextConditionedRecentPurchaseHomeResult {
  groups: HomeRecommendationPartitions
  simulation: ContextRecentPurchaseSimulation | null
  applied: boolean
  usedCurrentFallback: boolean
  movedToRecommendations: RecommendationResult[]
}

export function isLocalRecentPurchaseC1N3Enabled(
  isDevelopment: boolean,
  configuredValue: string | undefined,
) {
  return isDevelopment && configuredValue === 'true'
}

function homeN3NoveltyOverlay(items: AppData['items']) {
  const baseline = new Map(
    items.map((item) => [
      item.id,
      deriveInitialNoveltyDate({
        item,
        purchaseEvents: [],
        earliestKnownWearOn: null,
        notionCreatedAt: null,
        databaseCreatedAt: null,
      }),
    ]),
  )
  return applyAuthoritativeNoveltyOverrides(baseline, [])
}

/**
 * Thin HOME adapter over the existing C1 context calculator and N3 selector.
 * It never mutates RecommendationResults or the baseline partition.
 */
export function applyContextConditionedRecentPurchaseC1N3({
  data,
  input,
  results,
  baselineGroups,
  enabled,
}: {
  data: AppData
  input: RecommendationInput
  results: readonly RecommendationResult[]
  baselineGroups: HomeRecommendationPartitions
  enabled: boolean
}): ContextConditionedRecentPurchaseHomeResult {
  if (!enabled) {
    return {
      groups: baselineGroups,
      simulation: null,
      applied: false,
      usedCurrentFallback: false,
      movedToRecommendations: [],
    }
  }

  if (input.placeId === null || input.transportModeId === null) {
    return {
      groups: baselineGroups,
      simulation: null,
      applied: false,
      usedCurrentFallback: true,
      movedToRecommendations: [],
    }
  }

  const noveltyOverlay = homeN3NoveltyOverlay(data.items)
  const simulation = simulateContextRecentPurchases({
    candidates: buildContextEligibilityCandidates({
      data,
      input,
      results,
      noveltyOverlay,
    }),
    noveltyOverlay,
    model: 'C1',
    missingContextFallback: 'current-c0',
  })
  const recentPurchases = simulation.selections.map(
    (selection) => selection.result,
  )
  const recentIds = new Set(
    recentPurchases.map((result) => result.outfit.id),
  )
  const recommendations = results.filter(
    (result) =>
      result.evidence === 'observed' && !recentIds.has(result.outfit.id),
  )
  const baselineRecentIds = new Set(
    baselineGroups.recentPurchases.map((result) => result.outfit.id),
  )
  const movedToRecommendations = recommendations.filter((result) =>
    baselineRecentIds.has(result.outfit.id),
  )

  return {
    groups: {
      recentPurchases,
      recommendations,
      trialRecommendations: baselineGroups.trialRecommendations,
    },
    simulation,
    applied: true,
    usedCurrentFallback: false,
    movedToRecommendations,
  }
}
