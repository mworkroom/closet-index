import {
  calculateDirectEvidence,
  simulateDirectEvidencePartitions,
  type DirectEvidence,
  type DirectEvidencePartitionSimulation,
  type DirectEvidencePartitions,
  type DirectEvidenceScope,
} from './direct-evidence-policy'
import type {
  AppData,
  OutfitRating,
  RecommendationInput,
  RecommendationResult,
} from './types'

export type HomeRecommendationGroupName = keyof DirectEvidencePartitions<unknown>

export interface HomeDirectEvidenceMatchedObservation {
  wearLogId: string
  endpoint: 'departure' | 'return'
  currentTemperature: number
  historicalTemperature: number
  feeling: 'cold' | 'ok' | 'hot'
  wornOn: string
  inferredReturn: false
}

export interface HomeDirectEvidenceCandidateExplanation {
  outfitId: string
  outfitLabel: string
  baselineRank: number
  e2Rank: number
  group: HomeRecommendationGroupName
  level: RecommendationResult['level']
  baselineTemperatureDistance: number | null
  rating: OutfitRating
  wearCount: number
  lastWornOn: string | null
  reasons: string[]
  warnings: string[]
  directEvidenceOutcome: DirectEvidenceScope['outcome']
  confidence: DirectEvidenceScope['confidence']
  matchedExactContextWearLogCount: number
  matchedObservations: HomeDirectEvidenceMatchedObservation[]
}

export interface HomeDirectEvidenceMovedPairExplanation {
  group: HomeRecommendationGroupName
  level: RecommendationResult['level']
  baselinePreferredOutfitId: string
  policyTargetOutfitId: string
  baselinePreferenceFactor:
    | 'latest-acquired-on'
    | 'temperature-distance'
    | 'item-coverage'
    | 'similarity'
    | 'rating'
    | 'wear-count'
    | 'last-worn-on'
    | 'outfit-id'
    | 'stable-baseline-order'
  baselinePreferenceExplanation: string
  policyExplanation: string
  candidates: HomeDirectEvidenceCandidateExplanation[]
}

export interface HomeDirectEvidenceRankingResult {
  groups: DirectEvidencePartitions<RecommendationResult>
  simulation: DirectEvidencePartitionSimulation<RecommendationResult> | null
  evidenceByOutfitId: ReadonlyMap<string, DirectEvidence>
  movedPairs: HomeDirectEvidenceMovedPairExplanation[]
}

const ratingRank: Record<Exclude<OutfitRating, null> | 'unrated', number> = {
  favorite: 0,
  ok: 1,
  unrated: 2,
  error: 3,
}

export function isLocalDirectEvidenceE2Enabled(
  isDevelopment: boolean,
  configuredValue: string | undefined,
) {
  return isDevelopment && configuredValue === 'true'
}

export const LOCAL_P5A_DIRECT_EVIDENCE_E2_ENABLED =
  isLocalDirectEvidenceE2Enabled(
    import.meta.env.DEV,
    import.meta.env.VITE_P5A_DIRECT_EVIDENCE_E2,
  )

function temperatureDistance(result: RecommendationResult) {
  if (!result.okRange) return null
  if (result.targetTemp < result.okRange.min) {
    return result.okRange.min - result.targetTemp
  }
  if (result.targetTemp > result.okRange.max) {
    return result.targetTemp - result.okRange.max
  }
  return 0
}

function itemCoverage(result: RecommendationResult) {
  const evidence = result.similarEvidence
  if (!evidence?.totalCoreItemCount) return null
  return evidence.supportedCoreItemCount / evidence.totalCoreItemCount
}

function similarity(result: RecommendationResult) {
  return result.similarEvidence?.matches[0]?.weightedSimilarity ?? null
}

function baselinePreference(
  group: HomeRecommendationGroupName,
  preferred: RecommendationResult,
  later: RecommendationResult,
): Pick<
  HomeDirectEvidenceMovedPairExplanation,
  'baselinePreferenceFactor' | 'baselinePreferenceExplanation'
> {
  if (
    group === 'recentPurchases' &&
    preferred.latestAcquiredOn !== later.latestAcquiredOn
  ) {
    return {
      baselinePreferenceFactor: 'latest-acquired-on',
      baselinePreferenceExplanation: `최근 구매일 ${preferred.latestAcquiredOn ?? '없음'}이 ${later.latestAcquiredOn ?? '없음'}보다 우선`,
    }
  }

  const preferredDistance = temperatureDistance(preferred)
  const laterDistance = temperatureDistance(later)
  if (preferredDistance !== laterDistance) {
    return {
      baselinePreferenceFactor: 'temperature-distance',
      baselinePreferenceExplanation: `온도 거리 ${preferredDistance ?? '범위 없음'}이 ${laterDistance ?? '범위 없음'}보다 우선`,
    }
  }

  if (preferred.evidence === 'untried' && later.evidence === 'untried') {
    const preferredCoverage = itemCoverage(preferred)
    const laterCoverage = itemCoverage(later)
    if (preferredCoverage !== laterCoverage) {
      return {
        baselinePreferenceFactor: 'item-coverage',
        baselinePreferenceExplanation: `미착용 Outfit의 core Item coverage ${preferredCoverage ?? '없음'}가 ${laterCoverage ?? '없음'}보다 우선`,
      }
    }

    const preferredSimilarity = similarity(preferred)
    const laterSimilarity = similarity(later)
    if (preferredSimilarity !== laterSimilarity) {
      return {
        baselinePreferenceFactor: 'similarity',
        baselinePreferenceExplanation: `유사 Outfit 점수 ${preferredSimilarity ?? '없음'}가 ${laterSimilarity ?? '없음'}보다 우선`,
      }
    }
  }

  const preferredRating = ratingRank[preferred.outfit.rating ?? 'unrated']
  const laterRating = ratingRank[later.outfit.rating ?? 'unrated']
  if (preferredRating !== laterRating) {
    return {
      baselinePreferenceFactor: 'rating',
      baselinePreferenceExplanation: `Rating ${preferred.outfit.rating ?? 'unrated'}이 ${later.outfit.rating ?? 'unrated'}보다 우선`,
    }
  }

  if (preferred.wearCount !== later.wearCount) {
    return {
      baselinePreferenceFactor: 'wear-count',
      baselinePreferenceExplanation: `총 착용 ${preferred.wearCount}회가 ${later.wearCount}회보다 우선`,
    }
  }

  if (preferred.lastWornOn !== later.lastWornOn) {
    return {
      baselinePreferenceFactor: 'last-worn-on',
      baselinePreferenceExplanation: `마지막 착용 ${preferred.lastWornOn ?? '없음'}이 ${later.lastWornOn ?? '없음'}보다 우선`,
    }
  }

  if (preferred.outfit.id !== later.outfit.id) {
    return {
      baselinePreferenceFactor: 'outfit-id',
      baselinePreferenceExplanation: `최종 deterministic Outfit ID fallback에서 ${preferred.outfit.id}가 우선`,
    }
  }

  return {
    baselinePreferenceFactor: 'stable-baseline-order',
    baselinePreferenceExplanation: '동일 comparator 값에서 기존 안정 순서를 보존',
  }
}

function candidateExplanation(
  result: RecommendationResult,
  evidence: DirectEvidence,
  group: HomeRecommendationGroupName,
  baselineRank: number,
  e2Rank: number,
): HomeDirectEvidenceCandidateExplanation {
  return {
    outfitId: result.outfit.id,
    outfitLabel: result.outfit.displayName ?? result.outfit.id,
    baselineRank,
    e2Rank,
    group,
    level: result.level,
    baselineTemperatureDistance: temperatureDistance(result),
    rating: result.outfit.rating,
    wearCount: result.wearCount,
    lastWornOn: result.lastWornOn,
    reasons: result.reasons,
    warnings: result.warnings,
    directEvidenceOutcome: evidence.exactContext.outcome,
    confidence: evidence.exactContext.confidence,
    matchedExactContextWearLogCount:
      evidence.exactContext.distinctWearLogCount,
    matchedObservations: evidence.exactContext.observations.map(
      (observation) => ({
        wearLogId: observation.wearLogId,
        endpoint: observation.endpoint,
        currentTemperature: observation.currentTemperature,
        historicalTemperature: observation.historicalTemperature,
        feeling: observation.feeling,
        wornOn: observation.wornOn,
        inferredReturn: false,
      }),
    ),
  }
}

export function explainHomeDirectEvidenceMovements(
  baselineGroups: DirectEvidencePartitions<RecommendationResult>,
  simulation: DirectEvidencePartitionSimulation<RecommendationResult>,
  evidenceByOutfitId: ReadonlyMap<string, DirectEvidence>,
): HomeDirectEvidenceMovedPairExplanation[] {
  const reports: HomeDirectEvidenceMovedPairExplanation[] = []
  const seenPairs = new Set<string>()
  const groupNames: HomeRecommendationGroupName[] = [
    'recentPurchases',
    'recommendations',
    'trialRecommendations',
  ]

  for (const group of groupNames) {
    const baseline = baselineGroups[group]
    const detail = simulation.groupDetails[group]
    const newRankById = new Map(
      detail.ordered.map((candidate) => [candidate.id, candidate.newOrder]),
    )

    for (const moved of detail.ordered.filter(
      (candidate) => candidate.directlyTargeted && candidate.movement !== 0,
    )) {
      const counterpart = baseline[moved.newOrder]
      if (!counterpart || counterpart.outfit.id === moved.id) continue
      const pairKey = [group, ...[moved.id, counterpart.outfit.id].sort()].join('|')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      const movedResult = moved.value
      const preferred = baseline[Math.min(moved.baselineOrder, moved.newOrder)]
      const later = baseline[Math.max(moved.baselineOrder, moved.newOrder)]
      const preference = baselinePreference(group, preferred, later)
      const pairResults = [movedResult, counterpart].sort(
        (left, right) =>
          baseline.findIndex((result) => result.outfit.id === left.outfit.id) -
          baseline.findIndex((result) => result.outfit.id === right.outfit.id),
      )
      const evidence = evidenceByOutfitId.get(moved.id)
      if (!evidence) continue

      reports.push({
        group,
        level: movedResult.level,
        baselinePreferredOutfitId: preferred.outfit.id,
        policyTargetOutfitId: moved.id,
        ...preference,
        policyExplanation:
          moved.direction === 'up'
            ? `${evidence.exactContext.outcome}이므로 최대 1칸 상승`
            : `${evidence.exactContext.outcome}이므로 최대 1칸 하락`,
        candidates: pairResults.map((result) => {
          const resultEvidence = evidenceByOutfitId.get(result.outfit.id)
          if (!resultEvidence) {
            throw new Error(`${result.outfit.id} direct evidence가 필요합니다.`)
          }
          const baselineRank =
            baseline.findIndex(
              (candidate) => candidate.outfit.id === result.outfit.id,
            ) + 1
          return candidateExplanation(
            result,
            resultEvidence,
            group,
            baselineRank,
            (newRankById.get(result.outfit.id) ?? baselineRank - 1) + 1,
          )
        }),
      })
    }
  }

  return reports.sort(
    (left, right) =>
      left.group.localeCompare(right.group) ||
      left.candidates[0].baselineRank - right.candidates[0].baselineRank ||
      left.policyTargetOutfitId.localeCompare(right.policyTargetOutfitId),
  )
}

export function rankHomeRecommendationsWithDirectEvidenceE2(
  data: Pick<AppData, 'wearLogs'>,
  input: RecommendationInput,
  baselineGroups: DirectEvidencePartitions<RecommendationResult>,
  enabled: boolean,
): HomeDirectEvidenceRankingResult {
  if (!enabled) {
    return {
      groups: baselineGroups,
      simulation: null,
      evidenceByOutfitId: new Map(),
      movedPairs: [],
    }
  }

  const logsByOutfitId = new Map<string, AppData['wearLogs']>()
  for (const log of data.wearLogs) {
    const logs = logsByOutfitId.get(log.outfitId)
    if (logs) logs.push(log)
    else logsByOutfitId.set(log.outfitId, [log])
  }
  const results = [
    ...baselineGroups.recentPurchases,
    ...baselineGroups.recommendations,
    ...baselineGroups.trialRecommendations,
  ]
  const evidenceByOutfitId = new Map(
    results.map((result) => [
      result.outfit.id,
      calculateDirectEvidence(
        logsByOutfitId.get(result.outfit.id) ?? [],
        input,
      ),
    ]),
  )
  const simulation = simulateDirectEvidencePartitions(
    baselineGroups,
    evidenceByOutfitId,
    'E2',
    1,
  )

  return {
    groups: simulation.groups,
    simulation,
    evidenceByOutfitId,
    movedPairs: explainHomeDirectEvidenceMovements(
      baselineGroups,
      simulation,
      evidenceByOutfitId,
    ),
  }
}
