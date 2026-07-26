import type {
  AppData,
  Item,
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
  if (category.includes('bag') || category.includes('accessor')) return 0.25
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
  const observedItemIds = new Set<string>()

  const matches = available
    .filter((candidate) => candidate.id !== target.id)
    .flatMap((candidate): SimilarOutfitMatch[] => {
      const logs = data.wearLogs.filter((log) => log.outfitId === candidate.id)
      const observations = observationsFor(logs)
      if (observations.length === 0) return []

      const candidateItems = candidate.itemIds
        .map((id) => data.items.find((item) => item.id === id))
        .filter((item): item is Item => Boolean(item))
      candidateItems.forEach((item) => observedItemIds.add(item.id))

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

  if (matches.length === 0) return null

  const best = matches[0]
  const supportingWearCount = matches
    .filter(
      (match) => best.weightedSimilarity - match.weightedSimilarity <= 0.05,
    )
    .reduce((sum, match) => sum + match.wearCount, 0)
  const confidence =
    best.weightedSimilarity >= 0.7 && supportingWearCount >= 2
      ? 'medium'
      : 'low'

  return {
    confidence,
    knownItemCount: targetItems.filter((item) => observedItemIds.has(item.id))
      .length,
    totalItemCount: targetItems.length,
    matches,
  }
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
): { warnings: string[]; hasUnknown: boolean; hasConflict: boolean } {
  const warnings: string[] = []
  let hasUnknown = false
  let hasConflict = false

  if (input.rainCondition === 'yes') {
    const unsuitable = items.filter((item) => item.rainOk === 'unsuitable')
    const unknown = items.filter((item) => item.rainOk === 'unknown')
    if (unsuitable.length > 0) {
      hasConflict = true
      warnings.push(`비에 부적합: ${unsuitable.map((item) => item.name).join(', ')}`)
    } else if (unknown.length > 0) {
      hasUnknown = true
      warnings.push(`비 적합성 미확인 ${unknown.length}개`)
    }
  }

  if (input.longWalkCondition === 'yes') {
    const unsuitable = items.filter((item) => item.longWalkOk === 'unsuitable')
    const unknown = items.filter((item) => item.longWalkOk === 'unknown')
    if (unsuitable.length > 0) {
      hasConflict = true
      warnings.push(`오래 걷기 부적합: ${unsuitable.map((item) => item.name).join(', ')}`)
    } else if (unknown.length > 0) {
      hasUnknown = true
      warnings.push(`걷기 적합성 미확인 ${unknown.length}개`)
    }
  }

  return { warnings, hasUnknown, hasConflict }
}

function evaluateOutfit(
  outfit: Outfit,
  items: Item[],
  logs: WearLog[],
  input: RecommendationInput,
  similarEvidence: SimilarOutfitEvidence | null,
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

  const conditions = conditionWarnings(input, items)
  warnings.push(...conditions.warnings)

  let level: RecommendationLevel
  if (warnings.some((warning) => !warning.includes('미확인')) || distance > 2) {
    level = 'caution'
  } else if (distance === 0 && !conditions.hasUnknown) {
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
    reasons.push('온도 근거 없음')
  }

  const placeMatches = input.placeId
    ? logs.filter((log) => log.placeId === input.placeId).length
    : 0
  const transportMatches = input.transportModeId
    ? logs.filter((log) => log.transportModeId === input.transportModeId).length
    : 0

  if (placeMatches > 0) reasons.push(`같은 장소에서 ${placeMatches}회 착용`)
  if (transportMatches > 0) reasons.push(`같은 교통수단으로 ${transportMatches}회 착용`)

  const sortedLogs = [...logs].sort((a, b) => b.wornOn.localeCompare(a.wornOn))
  const lastWornOn = sortedLogs[0]?.wornOn ?? null
  if (lastWornOn) reasons.push(`마지막 착용 ${lastWornOn}`)
  const latestAcquiredOn =
    items
      .map((item) => item.acquiredOn)
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => b.localeCompare(a))[0] ?? null
  const latestAcquiredItemNames = latestAcquiredOn
    ? items
        .filter((item) => item.acquiredOn === latestAcquiredOn)
        .map((item) => item.name)
    : []

  return {
    outfit,
    level,
    evidence: logs.length > 0 ? 'observed' : 'untried',
    similarEvidence,
    reasons,
    warnings,
    okRange,
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
      : (result.similarEvidence?.matches[0]?.okRange ?? null)
  const matchesTargetTemperature = (result: RecommendationResult) =>
    rangeDistance(result.targetTemp, temperatureRangeFor(result)) === 0

  const recentPurchases = results
    .filter(
      (result) =>
        result.latestAcquiredOn !== null && matchesTargetTemperature(result),
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
    unknownTrialRecommendations: results.filter(
      (result) =>
        result.evidence === 'untried' &&
        temperatureRangeFor(result) === null &&
        !recentIds.has(result.outfit.id),
    ),
  }
}

export function recommendOutfits(
  data: AppData,
  input: RecommendationInput,
): RecommendationResult[] {
  const available = data.outfits.filter((outfit) => {
    if (outfit.rating === 'error') return false
    const items = outfit.itemIds
      .map((id) => data.items.find((item) => item.id === id))
      .filter((item): item is Item => Boolean(item))
    return items.length > 0 && items.every((item) => !item.retired)
  })

  return available
    .map((outfit) => {
      const items = outfit.itemIds
        .map((id) => data.items.find((item) => item.id === id))
        .filter((item): item is Item => Boolean(item))
      const logs = data.wearLogs.filter((log) => log.outfitId === outfit.id)
      const similarEvidence =
        logs.length === 0 ? similarOutfitEvidence(outfit, available, data) : null
      return evaluateOutfit(outfit, items, logs, input, similarEvidence)
    })
    .sort((a, b) => {
      const level = levelRank[a.level] - levelRank[b.level]
      if (level !== 0) return level

      const aDistance = rangeDistance(a.targetTemp, a.okRange)
      const bDistance = rangeDistance(b.targetTemp, b.okRange)
      if (aDistance !== bDistance) return aDistance - bDistance

      if (a.evidence === 'untried' && b.evidence === 'untried') {
        const aSimilarity =
          a.similarEvidence?.matches[0]?.weightedSimilarity ?? -1
        const bSimilarity =
          b.similarEvidence?.matches[0]?.weightedSimilarity ?? -1
        if (aSimilarity !== bSimilarity) return bSimilarity - aSimilarity
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
}
