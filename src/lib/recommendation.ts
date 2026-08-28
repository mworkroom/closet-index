import type {
  AppData,
  Item,
  ItemTemperatureEvidence,
  Outfit,
  OutfitRating,
  RecommendationInput,
  RecommendationLevel,
  RecommendationResult,
  SimilarOutfitEvidence,
  SimilarOutfitMatch,
  ThermalFeeling,
  WearLog,
} from './types'
import {
  activeContextEvidenceBucket,
  calculateContextEvidence,
  DEFAULT_CONTEXT_EVIDENCE_THRESHOLD,
  type RecommendationContextEvidence,
} from './context-evidence'
import { calculateTransportThermalEvidence } from './transport-thermal-evidence.mjs'
import { simulateTransportThermalPolicy } from './transport-thermal-policy.mjs'
import { isLongWalkSuitabilityCategory } from './item-categories'
import { isCompleteRecommendationOutfit } from './complete-outfit'

export { isCompleteRecommendationOutfit } from './complete-outfit'

interface Observation {
  temp: number
  feeling: Exclude<ThermalFeeling, null>
}

const levelRank: Record<RecommendationLevel, number> = {
  high: 0,
  possible: 1,
  caution: 2,
}

const ratingRank: Record<Exclude<OutfitRating, null> | 'unrated', number> = {
  favorite: 0,
  ok: 1,
  unrated: 2,
  error: 3,
}

const contextTierRank: Record<RecommendationContextEvidence['activeTier'], number> = {
  exact: 0,
  place: 1,
  none: 2,
}

export interface RecommendationOptions {
  enableContextRanking?: boolean
  enableTransportThermalPolicyB?: boolean
  contextEvidenceThreshold?: number
}

const recentPurchaseExcludedCategories = new Set([
  'innerwear',
  'socks',
  'acc-neck',
  'acc-waist',
  'acc-head-made',
  'acc-hands-made',
])

function countsAsRecentPurchase(item: Item) {
  return !recentPurchaseExcludedCategories.has(item.category.trim().toLowerCase())
}

function thermalWeight(item: Item) {
  const category = item.category.toLowerCase()

  if (
    category.includes('outer') ||
    category.includes('bottom') ||
    category.includes('dress')
  ) {
    return 3
  }
  if (category.includes('top') || category.includes('inner')) return 2
  if (
    category.startsWith('acc-') ||
    category.includes('bag') ||
    category.includes('accessor')
  ) {
    return 0.25
  }
  return 1
}

function isThermalAnchor(item: Item) {
  const category = item.category.toLowerCase()
  return (
    category.includes('outer') ||
    category.includes('bottom') ||
    category.includes('dress')
  )
}

function isCoreTemperatureItem(item: Item) {
  return thermalWeight(item) >= 2
}

function observationsFor(logs: WearLog[]): Observation[] {
  return logs.flatMap((log) => {
    const observations: Observation[] = []

    if (log.tempOut !== null && log.feelingOut) {
      observations.push({ temp: log.tempOut, feeling: log.feelingOut })
    }

    if (log.tempBack !== null && log.feelingBack) {
      const duplicate = observations.some(
        (entry) => entry.temp === log.tempBack && entry.feeling === log.feelingBack,
      )
      if (!duplicate) {
        observations.push({ temp: log.tempBack, feeling: log.feelingBack })
      }
    }

    return observations
  })
}

function okRangeFor(observations: Observation[]) {
  const okTemps = observations
    .filter((entry) => entry.feeling === 'ok')
    .map((entry) => entry.temp)

  return {
    okTemps,
    okRange:
      okTemps.length > 0
        ? {
            min: Math.min(...okTemps) - 2,
            max: Math.max(...okTemps) + 2,
          }
        : null,
  }
}

function weightedSimilarity(targetItems: Item[], candidateItems: Item[]) {
  const targetIds = new Set(targetItems.map((item) => item.id))
  const candidateIds = new Set(candidateItems.map((item) => item.id))
  const union = new Map<string, Item>()

  targetItems.forEach((item) => union.set(item.id, item))
  candidateItems.forEach((item) => union.set(item.id, item))

  const sharedWeight = [...union.values()]
    .filter((item) => targetIds.has(item.id) && candidateIds.has(item.id))
    .reduce((sum, item) => sum + thermalWeight(item), 0)
  const unionWeight = [...union.values()].reduce(
    (sum, item) => sum + thermalWeight(item),
    0,
  )

  return unionWeight > 0 ? sharedWeight / unionWeight : 0
}

function similarOutfitEvidence(
  target: Outfit,
  available: Outfit[],
  data: AppData,
): SimilarOutfitEvidence | null {
  const targetItems = target.itemIds
    .map((id) => data.items.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
  const targetCoreItems = targetItems.filter(isCoreTemperatureItem)
  const observedItemIds = new Set<string>()
  const supportingLogs = new Map<string, WearLog>()

  const observedOutfits = available
    .filter((candidate) => candidate.id !== target.id)
    .map((candidate) => ({
      outfit: candidate,
      logs: data.wearLogs.filter((log) => log.outfitId === candidate.id),
    }))
    .filter(({ logs }) => observationsFor(logs).length > 0)

  observedOutfits.forEach(({ outfit }) => {
    outfit.itemIds.forEach((itemId) => observedItemIds.add(itemId))
  })

  const itemEvidence = targetCoreItems.flatMap(
    (item): ItemTemperatureEvidence[] => {
      const logsById = new Map<string, WearLog>()

      observedOutfits.forEach(({ outfit, logs }) => {
        if (!outfit.itemIds.includes(item.id)) return
        logs.forEach((log) => logsById.set(log.id, log))
      })

      const logs = [...logsById.values()]
      const { okRange, okTemps } = okRangeFor(observationsFor(logs))
      if (!okRange) return []

      logs.forEach((log) => supportingLogs.set(log.id, log))
      const sortedLogs = [...logs].sort((a, b) =>
        b.wornOn.localeCompare(a.wornOn),
      )

      return [
        {
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          wearCount: logs.length,
          lastWornOn: sortedLogs[0]?.wornOn ?? null,
          okRange,
          okObservationCount: okTemps.length,
        },
      ]
    },
  )

  const minimumSupportedCoreItems = Math.min(2, targetCoreItems.length)
  const hasEnoughItemEvidence =
    minimumSupportedCoreItems > 0 &&
    itemEvidence.length >= minimumSupportedCoreItems
  const itemRangeIntersection = hasEnoughItemEvidence
    ? {
        min: Math.max(...itemEvidence.map((evidence) => evidence.okRange.min)),
        max: Math.min(...itemEvidence.map((evidence) => evidence.okRange.max)),
      }
    : null
  const aggregateOkRange =
    itemRangeIntersection && itemRangeIntersection.min <= itemRangeIntersection.max
      ? itemRangeIntersection
      : null
  const aggregateOkObservationCount = okRangeFor(
    observationsFor([...supportingLogs.values()]),
  ).okTemps.length

  const matches = observedOutfits
    .flatMap(({ outfit: candidate, logs }): SimilarOutfitMatch[] => {
      const observations = observationsFor(logs)

      const candidateItems = candidate.itemIds
        .map((id) => data.items.find((item) => item.id === id))
        .filter((item): item is Item => Boolean(item))

      const candidateIds = new Set(candidateItems.map((item) => item.id))
      const sharedItems = targetItems.filter((item) => candidateIds.has(item.id))
      const sharedAnchors = sharedItems.filter(isThermalAnchor)
      const similarity = weightedSimilarity(targetItems, candidateItems)

      if (
        sharedItems.length < 2 ||
        similarity < 0.4 ||
        sharedItems.every((item) => thermalWeight(item) < 1) ||
        (sharedAnchors.length === 0 && similarity < 0.65)
      ) {
        return []
      }

      const { okRange, okTemps } = okRangeFor(observations)
      const sortedLogs = [...logs].sort((a, b) =>
        b.wornOn.localeCompare(a.wornOn),
      )

      return [
        {
          outfitId: candidate.id,
          sharedItemCount: sharedItems.length,
          targetItemCount: targetItems.length,
          weightedSimilarity: similarity,
          sharedItemNames: sharedItems.map((item) => item.name),
          changedItemNames: targetItems
            .filter((item) => !candidateIds.has(item.id))
            .map((item) => item.name),
          wearCount: logs.length,
          lastWornOn: sortedLogs[0]?.wornOn ?? null,
          okRange,
          okObservationCount: okTemps.length,
        },
      ]
    })
    .sort((a, b) => {
      if (a.weightedSimilarity !== b.weightedSimilarity) {
        return b.weightedSimilarity - a.weightedSimilarity
      }
      if (a.sharedItemCount !== b.sharedItemCount) {
        return b.sharedItemCount - a.sharedItemCount
      }
      if (a.wearCount !== b.wearCount) return b.wearCount - a.wearCount
      if (a.lastWornOn !== b.lastWornOn) {
        return (b.lastWornOn ?? '').localeCompare(a.lastWornOn ?? '')
      }
      return a.outfitId.localeCompare(b.outfitId)
    })
    .slice(0, 3)

  if (matches.length === 0 && itemEvidence.length === 0) return null

  const best = matches[0]
  const supportingWearCount = best
    ? matches
        .filter(
          (match) => best.weightedSimilarity - match.weightedSimilarity <= 0.05,
        )
        .reduce((sum, match) => sum + match.wearCount, 0)
    : 0
  const hasMediumOutfitEvidence = Boolean(
    best && best.weightedSimilarity >= 0.7 && supportingWearCount >= 2,
  )
  const hasMediumItemEvidence =
    aggregateOkRange !== null &&
    itemEvidence.length === targetCoreItems.length &&
    supportingLogs.size >= 2
  const confidence =
    hasMediumOutfitEvidence || hasMediumItemEvidence ? 'medium' : 'low'

  return {
    confidence,
    knownItemCount: targetItems.filter((item) => observedItemIds.has(item.id))
      .length,
    totalItemCount: targetItems.length,
    supportedCoreItemCount: itemEvidence.length,
    totalCoreItemCount: targetCoreItems.length,
    itemEvidence,
    aggregateOkRange,
    aggregateOkObservationCount,
    matches,
  }
}

function partialEvidenceRange(evidence: SimilarOutfitEvidence | null) {
  return evidence?.aggregateOkRange ?? evidence?.matches[0]?.okRange ?? null
}

function rangeDistance(target: number, range: { min: number; max: number } | null) {
  if (!range) return Number.POSITIVE_INFINITY
  if (target < range.min) return range.min - target
  if (target > range.max) return target - range.max
  return 0
}

function endpointWarning(
  temp: number,
  label: '출발' | '귀가',
  observations: Observation[],
) {
  const cold = observations
    .filter((entry) => entry.feeling === 'cold' && temp <= entry.temp)
    .sort((a, b) => a.temp - b.temp)[0]
  if (cold) return `${label} ${temp}°C — ${cold.temp}°C에서 추웠던 기록 있음`

  const hot = observations
    .filter((entry) => entry.feeling === 'hot' && temp >= entry.temp)
    .sort((a, b) => b.temp - a.temp)[0]
  if (hot) return `${label} ${temp}°C — ${hot.temp}°C에서 더웠던 기록 있음`

  return null
}

function conditionWarnings(
  input: RecommendationInput,
  items: Item[],
): string[] {
  const warnings: string[] = []

  if (input.rainCondition === 'yes') {
    const unsuitable = items.filter((item) => !item.rainOk)
    if (unsuitable.length > 0) {
      warnings.push(`비에 부적합: ${unsuitable.map((item) => item.name).join(', ')}`)
    }
  }

  if (input.longWalkCondition === 'yes') {
    const unsuitable = items.filter(
      (item) =>
        isLongWalkSuitabilityCategory(item.category) && !item.longWalkOk,
    )
    if (unsuitable.length > 0) {
      warnings.push(`오래 걷기 부적합: ${unsuitable.map((item) => item.name).join(', ')}`)
    }
  }

  return warnings
}

function contextRankingReason(evidence: RecommendationContextEvidence) {
  const active = activeContextEvidenceBucket(evidence)
  if (!active) return null

  const parts = [
    evidence.activeTier === 'exact'
      ? `같은 장소·교통수단에서 ${active.exposureCount}회 착용`
      : `같은 장소에서 ${active.exposureCount}회 착용 · 교통수단 fallback`,
  ]
  if (active.successCount > 0) {
    parts.push(`성공 ${active.successCount}회`)
  }
  if (active.issueCount > 0) parts.push(`온도 이슈 ${active.issueCount}회`)
  if (active.unknownCount > 0) parts.push(`결과 미상 ${active.unknownCount}회`)
  return parts.join(' · ')
}

function compareContextEvidence(
  left: RecommendationContextEvidence,
  right: RecommendationContextEvidence,
) {
  const tier = contextTierRank[left.activeTier] - contextTierRank[right.activeTier]
  if (tier !== 0) return tier

  const leftActive = activeContextEvidenceBucket(left)
  const rightActive = activeContextEvidenceBucket(right)
  if (!leftActive || !rightActive) return 0

  if (leftActive.successCount !== rightActive.successCount) {
    return rightActive.successCount - leftActive.successCount
  }
  if (leftActive.issueCount !== rightActive.issueCount) {
    return leftActive.issueCount - rightActive.issueCount
  }
  if (leftActive.exposureCount !== rightActive.exposureCount) {
    return rightActive.exposureCount - leftActive.exposureCount
  }
  return 0
}

function evaluateOutfit(
  outfit: Outfit,
  items: Item[],
  logs: WearLog[],
  input: RecommendationInput,
  similarEvidence: SimilarOutfitEvidence | null,
  options: RecommendationOptions,
): RecommendationResult {
  const tempBack = input.tempBack ?? input.tempOut
  const targetTemp = (input.tempOut + tempBack) / 2
  const observations = observationsFor(logs)
  const { okRange, okTemps } = okRangeFor(observations)
  const distance = rangeDistance(targetTemp, okRange)

  const warnings = [
    endpointWarning(input.tempOut, '출발', observations),
    endpointWarning(tempBack, '귀가', observations),
  ].filter((warning): warning is string => Boolean(warning))

  const conditionWarningsForItems = conditionWarnings(input, items)
  warnings.push(...conditionWarningsForItems)
  const contextEvidence = calculateContextEvidence(logs, input, {
    threshold:
      options.contextEvidenceThreshold ?? DEFAULT_CONTEXT_EVIDENCE_THRESHOLD,
  })

  let level: RecommendationLevel
  if (warnings.length > 0 || distance > 2) {
    level = 'caution'
  } else if (distance === 0) {
    level = 'high'
  } else {
    level = 'possible'
  }

  const reasons: string[] = []
  if (okRange) {
    reasons.push(
      `${okRange.min}~${okRange.max}°C 적정 범위 · OK ${okTemps.length}회`,
    )
  } else if (similarEvidence) {
    const best = similarEvidence.matches[0]
    if (similarEvidence.aggregateOkRange) {
      reasons.push(
        `핵심 Item ${similarEvidence.supportedCoreItemCount}/${similarEvidence.totalCoreItemCount}개에 OK 온도 근거`,
      )
      reasons.push(
        `Item별 종합 ${similarEvidence.aggregateOkRange.min}~${similarEvidence.aggregateOkRange.max}°C · OK 관측 ${similarEvidence.aggregateOkObservationCount}개`,
      )
      if (best) {
        reasons.push(
          `비슷한 과거 착장 ${best.sharedItemCount}/${best.targetItemCount}개 일치`,
        )
      }
    } else if (best) {
      reasons.push(
        `비슷한 과거 착장 ${best.sharedItemCount}/${best.targetItemCount}개 일치`,
      )
      if (best.okRange) {
        reasons.push(
          `유사 착장 ${best.okRange.min}~${best.okRange.max}°C · OK ${best.okObservationCount}회`,
        )
      } else {
        reasons.push('유사 착장에 OK 온도 기록 없음')
      }
    } else {
      reasons.push(
        `핵심 Item ${similarEvidence.supportedCoreItemCount}/${similarEvidence.totalCoreItemCount}개에 일부 온도 근거`,
      )
    }
  } else {
    reasons.push('온도 근거 없음')
  }

  if (options.enableContextRanking) {
    const contextReason = contextRankingReason(contextEvidence)
    if (contextReason) reasons.push(contextReason)
  } else {
    const placeMatches = contextEvidence.independent.placeMatchedWearLogIds.length
    const transportMatches =
      contextEvidence.independent.transportMatchedWearLogIds.length
    if (placeMatches > 0) reasons.push(`같은 장소에서 ${placeMatches}회 착용`)
    if (transportMatches > 0) {
      reasons.push(`같은 교통수단으로 ${transportMatches}회 착용`)
    }
  }

  const sortedLogs = [...logs].sort((a, b) => b.wornOn.localeCompare(a.wornOn))
  const lastWornOn = sortedLogs[0]?.wornOn ?? null
  if (lastWornOn) reasons.push(`마지막 착용 ${lastWornOn}`)
  const recentPurchaseItems = items.filter(countsAsRecentPurchase)
  const latestAcquiredOn =
    recentPurchaseItems
      .map((item) => item.acquiredOn)
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => b.localeCompare(a))[0] ?? null
  const latestAcquiredItemNames = latestAcquiredOn
    ? recentPurchaseItems
        .filter((item) => item.acquiredOn === latestAcquiredOn)
        .map((item) => item.name)
    : []

  return {
    outfit,
    level,
    evidence: logs.length > 0 ? 'observed' : 'untried',
    similarEvidence,
    contextEvidence,
    reasons,
    warnings,
    okRange,
    okObservationCount: okTemps.length,
    targetTemp,
    wearCount: logs.length,
    lastWornOn,
    latestAcquiredOn,
    latestAcquiredItemNames,
  }
}

export function partitionRecommendations(
  results: RecommendationResult[],
  recentPurchaseLimit = 3,
) {
  const temperatureRangeFor = (result: RecommendationResult) =>
    result.evidence === 'observed'
      ? result.okRange
      : partialEvidenceRange(result.similarEvidence)
  const matchesTargetTemperature = (result: RecommendationResult) =>
    rangeDistance(result.targetTemp, temperatureRangeFor(result)) === 0

  const recentPurchases = results
    .filter(
      (result) =>
        result.evidence === 'observed' &&
        result.latestAcquiredOn !== null &&
        matchesTargetTemperature(result),
    )
    .sort((a, b) =>
      (b.latestAcquiredOn ?? '').localeCompare(a.latestAcquiredOn ?? ''),
    )
    .slice(0, recentPurchaseLimit)
  const recentIds = new Set(recentPurchases.map((result) => result.outfit.id))

  return {
    recentPurchases,
    recommendations: results.filter(
      (result) => result.evidence === 'observed' && !recentIds.has(result.outfit.id),
    ),
    trialRecommendations: results.filter(
      (result) =>
        result.evidence === 'untried' &&
        matchesTargetTemperature(result) &&
        !recentIds.has(result.outfit.id),
    ),
  }
}

export function recommendOutfits(
  data: AppData,
  input: RecommendationInput,
  options: RecommendationOptions = {},
): RecommendationResult[] {
  const available = data.outfits.filter((outfit) => {
    if (outfit.archivedAt) return false
    if (outfit.rating === 'error') return false
    const items = outfit.itemIds
      .map((id) => data.items.find((item) => item.id === id))
      .filter((item): item is Item => Boolean(item))
    return (
      isCompleteRecommendationOutfit(items) &&
      items.every((item) => !item.retired)
    )
  })

  const baselineResults = available
    .map((outfit) => {
      const items = outfit.itemIds
        .map((id) => data.items.find((item) => item.id === id))
        .filter((item): item is Item => Boolean(item))
      const logs = data.wearLogs.filter((log) => log.outfitId === outfit.id)
      const similarEvidence =
        logs.length === 0 ? similarOutfitEvidence(outfit, available, data) : null
      return evaluateOutfit(
        outfit,
        items,
        logs,
        input,
        similarEvidence,
        options,
      )
    })
    .sort((a, b) => {
      const level = levelRank[a.level] - levelRank[b.level]
      if (level !== 0) return level

      const aDistance = rangeDistance(a.targetTemp, a.okRange)
      const bDistance = rangeDistance(b.targetTemp, b.okRange)
      if (aDistance !== bDistance) return aDistance - bDistance

      if (a.evidence === 'untried' && b.evidence === 'untried') {
        const aItemCoverage = a.similarEvidence?.totalCoreItemCount
          ? a.similarEvidence.supportedCoreItemCount /
            a.similarEvidence.totalCoreItemCount
          : -1
        const bItemCoverage = b.similarEvidence?.totalCoreItemCount
          ? b.similarEvidence.supportedCoreItemCount /
            b.similarEvidence.totalCoreItemCount
          : -1
        if (aItemCoverage !== bItemCoverage) return bItemCoverage - aItemCoverage

        const aSimilarity =
          a.similarEvidence?.matches[0]?.weightedSimilarity ?? -1
        const bSimilarity =
          b.similarEvidence?.matches[0]?.weightedSimilarity ?? -1
        if (aSimilarity !== bSimilarity) return bSimilarity - aSimilarity
      }

      if (options.enableContextRanking) {
        const context = compareContextEvidence(
          a.contextEvidence,
          b.contextEvidence,
        )
        if (context !== 0) return context
      }

      const aRating = ratingRank[a.outfit.rating ?? 'unrated']
      const bRating = ratingRank[b.outfit.rating ?? 'unrated']
      if (aRating !== bRating) return aRating - bRating

      if (a.wearCount !== b.wearCount) return b.wearCount - a.wearCount

      const aLastWorn = a.lastWornOn ?? ''
      const bLastWorn = b.lastWornOn ?? ''
      if (aLastWorn !== bLastWorn) return bLastWorn.localeCompare(aLastWorn)

      return a.outfit.id.localeCompare(b.outfit.id)
    })

  if (!options.enableTransportThermalPolicyB) return baselineResults

  const resultByOutfitId = new Map(
    baselineResults.map((result) => [result.outfit.id, result]),
  )
  const ranked = simulateTransportThermalPolicy(
    'weak-1-strong-2',
    baselineResults.map((result, baselineOrder) => ({
      id: result.outfit.id,
      level: result.level,
      baselineOrder,
      evidence: calculateTransportThermalEvidence(
        data.wearLogs.filter((log) => log.outfitId === result.outfit.id),
        {
          outfitId: result.outfit.id,
          tempOut: input.tempOut,
          tempBack: input.tempBack,
          placeId: input.placeId,
          transportModeId: input.transportModeId,
          longWalkCondition: input.longWalkCondition,
        },
      ),
      warnings: result.warnings,
    })),
    {
      outfitId: '',
      tempOut: input.tempOut,
      tempBack: input.tempBack,
      placeId: input.placeId,
      transportModeId: input.transportModeId,
      longWalkCondition: input.longWalkCondition,
    },
  )

  return ranked.map((candidate) => resultByOutfitId.get(candidate.id)!)
}
