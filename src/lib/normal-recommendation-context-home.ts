import {
  simulateNormalRecommendationContextModels,
  type NormalRecommendationContextDecision,
  type NormalRecommendationContextTier,
} from './normal-recommendation-context-eligibility'
import type { OutfitContextEligibility } from './context-conditioned-recent-purchase'
import type {
  AppData,
  RecommendationInput,
  RecommendationResult,
} from './types'
import type { HomeRecommendationPartitions } from './context-conditioned-recent-purchase-home'

export interface HomeNormalRecommendationContextEvidence {
  outfitId: string
  tier: Exclude<NormalRecommendationContextTier, 'baseline_overall' | 'excluded'>
  label: string
  context: OutfitContextEligibility
  exactMatchedWearLogCount: number
  currentTransportMatchedWearLogCount: number
  fallbackSourceTransportNames: string[]
}

export interface HomeNormalRecommendationContextResult {
  groups: HomeRecommendationPartitions
  evidenceByOutfitId: ReadonlyMap<
    string,
    HomeNormalRecommendationContextEvidence
  >
  applied: boolean
  skippedForMissingContext: boolean
}

export function isLocalNormalContextN2Enabled(
  isDevelopment: boolean,
  configuredValue: string | undefined,
) {
  return isDevelopment && configuredValue === 'true'
}

export const LOCAL_P5A_NORMAL_CONTEXT_N2_ENABLED =
  isLocalNormalContextN2Enabled(
    import.meta.env.DEV,
    import.meta.env.VITE_P5A_NORMAL_CONTEXT_N2,
  )

function distinctSupportingWearLogCount(
  decision: NormalRecommendationContextDecision,
) {
  return new Set(
    decision.context.exactContext.relevantObservations
      .filter((observation) => observation.feeling === 'ok')
      .map((observation) => observation.wearLogId),
  ).size
}

function exactSupportLabel(
  decision: NormalRecommendationContextDecision,
  transportName: string,
) {
  const observations = decision.context.exactContext.relevantObservations.filter(
    (observation) => observation.feeling === 'ok',
  )
  const temperatures = [
    ...new Set(
      observations.map((observation) => observation.historicalTemperature),
    ),
  ]
  const count = distinctSupportingWearLogCount(decision)
  if (temperatures.length === 1 && count > 0) {
    return `직접 근거 · ${temperatures[0]}°C에서 OK ${count}회`
  }
  return `직접 근거 · 이 장소·${transportName}에서 OK`
}

function evidenceFor(
  decision: NormalRecommendationContextDecision,
  transportNameById: ReadonlyMap<string, string>,
  currentTransportName: string,
): HomeNormalRecommendationContextEvidence {
  const fallbackSourceTransportNames = [
    ...new Set(
      decision.context.overall.relevantObservations
        .filter((observation) => observation.feeling === 'ok')
        .flatMap((observation) =>
          observation.transportModeId
            ? [
                transportNameById.get(observation.transportModeId) ??
                  observation.transportModeId,
              ]
            : [],
        ),
    ),
  ].sort((left, right) => left.localeCompare(right, 'ko'))

  let label: string
  switch (decision.tier) {
    case 'exact_support':
      label = exactSupportLabel(decision, currentTransportName)
      break
    case 'current_transport_support':
      label = '같은 이동수단 근거 · 다른 장소'
      break
    case 'cross_context_only':
      label =
        fallbackSourceTransportNames.length === 1
          ? `다른 조건 근거 · ${fallbackSourceTransportNames[0]} 이동 기록`
          : '다른 조건 근거'
      break
    case 'unknown':
      label = '현재 조건 기록 없음'
      break
    case 'exact_mixed':
      label = '현재 조건 결과 혼재'
      break
    case 'exact_issue':
      label = '현재 조건에서 문제 기록'
      break
    default:
      throw new Error(`HOME N2 evidence tier가 올바르지 않습니다: ${decision.tier}`)
  }

  return {
    outfitId: decision.result.outfit.id,
    tier: decision.tier,
    label,
    context: decision.context,
    exactMatchedWearLogCount:
      decision.context.exactContext.distinctWearLogCount,
    currentTransportMatchedWearLogCount:
      decision.context.currentTransport.distinctWearLogCount,
    fallbackSourceTransportNames,
  }
}

/**
 * Development-only safety-first N2 adapter. It ranks only the final normal
 * group and reuses the same structured evidence object for card labels.
 */
export function rankHomeNormalRecommendationsWithSafetyFirstN2({
  data,
  input,
  baselineGroups,
  enabled,
}: {
  data: Pick<AppData, 'wearLogs' | 'transportModes'>
  input: RecommendationInput
  baselineGroups: HomeRecommendationPartitions
  enabled: boolean
}): HomeNormalRecommendationContextResult {
  const transportModeId = input.transportModeId
  const missingContext =
    input.placeId === null || transportModeId === null
  if (!enabled || missingContext) {
    return {
      groups: baselineGroups,
      evidenceByOutfitId: new Map(),
      applied: false,
      skippedForMissingContext: enabled && missingContext,
    }
  }

  const simulation = simulateNormalRecommendationContextModels({
    data,
    input,
    baselineRecommendations: baselineGroups.recommendations,
  }).find((model) => model.model === 'N2')
  if (!simulation) throw new Error('Safety-first N2 simulation이 필요합니다.')

  const transportNameById = new Map(
    data.transportModes.map((transport) => [transport.id, transport.name]),
  )
  const currentTransportName =
    transportNameById.get(transportModeId) ?? '현재 이동수단'
  const evidenceByOutfitId = new Map(
    simulation.decisions.map((decision) => [
      decision.result.outfit.id,
      evidenceFor(decision, transportNameById, currentTransportName),
    ]),
  )

  return {
    groups: {
      recentPurchases: baselineGroups.recentPurchases,
      recommendations: simulation.ordered,
      trialRecommendations: baselineGroups.trialRecommendations,
    },
    evidenceByOutfitId,
    applied: true,
    skippedForMissingContext: false,
  }
}
