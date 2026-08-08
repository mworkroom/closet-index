import { buildContextEligibilityCandidates } from './context-conditioned-recent-purchase'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
} from './recent-purchase-semantics'
import {
  simulateRecencyBoundedRecentPurchases,
  type RecencyWindowSimulation,
} from './recent-purchase-recency-window'
import type {
  AppData,
  RecommendationInput,
  RecommendationResult,
} from './types'
import type { HomeRecommendationPartitions } from './context-conditioned-recent-purchase-home'

export interface RecentPurchaseW2HomeResult {
  groups: HomeRecommendationPartitions
  simulation: RecencyWindowSimulation | null
  applied: boolean
  usedMissingContextFallback: boolean
  movedToRecommendations: RecommendationResult[]
}

export function isLocalRecentPurchaseW2Enabled(
  isDevelopment: boolean,
  configuredValue: string | undefined,
) {
  return isDevelopment && configuredValue === 'true'
}

export const LOCAL_P5A_RECENT_PURCHASE_W2_ENABLED =
  isLocalRecentPurchaseW2Enabled(
    import.meta.env.DEV,
    import.meta.env.VITE_P5A_RECENT_PURCHASE_W2,
  )

export function currentKstCalendarDate(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
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
 * Development-only HOME adapter for W2: N3 source selection, a 365-day KST
 * calendar window, and overall-temperature fallback for incomplete context.
 */
export function applyRecentPurchaseW2Home({
  data,
  input,
  results,
  baselineGroups,
  enabled,
  asOfDate = currentKstCalendarDate(),
}: {
  data: AppData
  input: RecommendationInput
  results: readonly RecommendationResult[]
  baselineGroups: HomeRecommendationPartitions
  enabled: boolean
  asOfDate?: string
}): RecentPurchaseW2HomeResult {
  if (!enabled) {
    return {
      groups: baselineGroups,
      simulation: null,
      applied: false,
      usedMissingContextFallback: false,
      movedToRecommendations: [],
    }
  }

  const noveltyOverlay = homeN3NoveltyOverlay(data.items)
  const hasCompleteContext =
    input.placeId !== null && input.transportModeId !== null
  const simulation = simulateRecencyBoundedRecentPurchases({
    candidates: buildContextEligibilityCandidates({
      data,
      input,
      results,
      noveltyOverlay,
    }),
    noveltyOverlay,
    model: 'W2',
    asOfDate,
    hasCompleteContext,
    missingContextBehavior: 'overall',
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

  return {
    groups: {
      recentPurchases,
      recommendations,
      trialRecommendations: baselineGroups.trialRecommendations,
    },
    simulation,
    applied: true,
    usedMissingContextFallback: !hasCompleteContext,
    movedToRecommendations: recommendations.filter((result) =>
      baselineRecentIds.has(result.outfit.id),
    ),
  }
}
