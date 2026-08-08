import {
  isN3RecentPurchaseSourceCategory,
  type AuthoritativeNoveltyOverlay,
  type InitialNoveltyEvidence,
} from './recent-purchase-semantics'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  RecommendationResult,
  ThermalFeeling,
  WearLog,
} from './types'

export type ItemDerivedScopeName =
  | 'exactContext'
  | 'currentTransport'
  | 'overall'
  | 'nullContext'
export type SparseEligibilityModel = 'S0' | 'S1' | 'S2' | 'S3'
export type ItemAggregationRule =
  | 'all-core'
  | 'at-least-two'
  | 'weighted-majority'
export type EvidenceOutcome = 'support' | 'issue' | 'mixed' | 'unknown'

export interface ItemDerivedObservation {
  wearLogId: string
  outfitId: string
  endpoint: 'departure' | 'return'
  temperature: number
  feeling: Exclude<ThermalFeeling, null>
  wornOn: string
  inferredReturn: boolean
  placeId: string | null
  transportModeId: string | null
}

export interface ItemDerivedScopeEvidence {
  scope: ItemDerivedScopeName
  enabled: boolean
  rawOkTemperatures: number[]
  expandedOkRange: { min: number; max: number } | null
  coldObservations: ItemDerivedObservation[]
  hotObservations: ItemDerivedObservation[]
  matchedWearLogIds: string[]
  distinctWearLogCount: number
  distinctOutfitIds: string[]
  observationCount: number
  latestWornOn: string | null
  inferredReturnEndpointCount: number
  sourcePlaceIds: Array<string | null>
  sourceTransportModeIds: Array<string | null>
  observations: ItemDerivedObservation[]
  auditObservations: ItemDerivedObservation[]
}

export interface ItemDerivedThermalEvidence {
  itemId: string
  itemName: string
  category: string
  thermalWeight: number
  isThermalCore: boolean
  isBaseLayerSourceExcluded: boolean
  scopes: Record<ItemDerivedScopeName, ItemDerivedScopeEvidence>
}

export interface ScopedOutfitItemEvidence {
  targetOutfitId: string
  targetTemperature: number
  items: ItemDerivedThermalEvidence[]
}

export interface DirectOutfitThermalSummary {
  distinctWearLogCount: number
  observations: ItemDerivedObservation[]
  directOkTemperatures: number[]
  directColdTemperatures: number[]
  directHotTemperatures: number[]
  currentExpandedOkRange: { min: number; max: number } | null
  primaryExpandedOkRange: { min: number; max: number } | null
  outcomeNearTarget: EvidenceOutcome
  hasRelevantDirectIssue: boolean
  inferredReturnEndpointCount: number
  inferredRangeSensitivity: boolean
}

export interface ItemAggregationResult {
  scope: ItemDerivedScopeName
  rule: ItemAggregationRule
  outcome: EvidenceOutcome
  eligible: boolean
  minimumSupportingCoreItemCount: number
  totalCoreItemCount: number
  supportingCoreItemIds: string[]
  issueCoreItemIds: string[]
  mixedCoreItemIds: string[]
  unknownCoreItemIds: string[]
  supportingWeight: number
  totalCoreWeight: number
  hasNonInnerwearSupport: boolean
  observationCount: number
}

export interface SimilarOutfitAuditMatch {
  outfitId: string
  weightedSimilarity: number
  sharedItemIds: string[]
  okRange: { min: number; max: number } | null
  supportsTarget: boolean
  matchedWearLogIds: string[]
}

export interface SparseEligibilityCandidate {
  result: RecommendationResult
  baselineRank: number
  sourceItemIds: string[]
  direct: DirectOutfitThermalSummary
  derived: ScopedOutfitItemEvidence
  similarOutfits: SimilarOutfitAuditMatch[]
}

export interface SparseEligibilityDecision {
  candidate: SparseEligibilityCandidate
  eligible: boolean
  basis:
    | 'direct-outfit'
    | 'exact-context-items'
    | 'current-transport-items'
    | 'overall-items'
    | 'direct-issue'
    | 'insufficient-item-evidence'
    | 'outside-model-log-threshold'
  aggregation: ItemAggregationResult | null
}

export interface SparseRecentPurchaseSelection {
  result: RecommendationResult
  sourceItemId: string
  noveltyDate: string
  decision: SparseEligibilityDecision
}

export interface SparseEligibilitySimulation {
  model: SparseEligibilityModel
  aggregationRule: ItemAggregationRule | null
  decisions: SparseEligibilityDecision[]
  thermalEligibleOutfitCount: number
  sourceEligibleOutfitCount: number
  distinctNoveltySourceItemCount: number
  selections: SparseRecentPurchaseSelection[]
}

const TEMPERATURE_TOLERANCE = 2

export function auditThermalWeight(item: Pick<Item, 'category'>) {
  const category = item.category.toLocaleLowerCase('en-US')
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
  const category = item.category.toLocaleLowerCase('en-US')
  return (
    category.includes('outer') ||
    category.includes('bottom') ||
    category.includes('dress')
  )
}

function isBaseLayer(item: Pick<Item, 'category'>) {
  return (
    item.category.trim().toLocaleLowerCase('en-US') ===
    'top-t-shirts-innerwear'
  )
}

function distinctLogs(logs: readonly WearLog[]) {
  return [...new Map(logs.map((log) => [log.id, log])).values()].sort(
    (left, right) =>
      left.wornOn.localeCompare(right.wornOn) || left.id.localeCompare(right.id),
  )
}

function observationsFor(logs: readonly WearLog[]) {
  const byKey = new Map<string, ItemDerivedObservation>()
  for (const log of distinctLogs(logs)) {
    if (log.tempOut !== null && log.feelingOut !== null) {
      byKey.set(`${log.id}:departure`, {
        wearLogId: log.id,
        outfitId: log.outfitId,
        endpoint: 'departure',
        temperature: log.tempOut,
        feeling: log.feelingOut,
        wornOn: log.wornOn,
        inferredReturn: false,
        placeId: log.placeId,
        transportModeId: log.transportModeId,
      })
    }
    if (log.tempBack !== null && log.feelingBack !== null) {
      byKey.set(`${log.id}:return`, {
        wearLogId: log.id,
        outfitId: log.outfitId,
        endpoint: 'return',
        temperature: log.tempBack,
        feeling: log.feelingBack,
        wornOn: log.wornOn,
        inferredReturn: Boolean(log.tempBackInferred),
        placeId: log.placeId,
        transportModeId: log.transportModeId,
      })
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.wearLogId.localeCompare(right.wearLogId) ||
      left.endpoint.localeCompare(right.endpoint) ||
      left.temperature - right.temperature,
  )
}

function expandedRange(temperatures: readonly number[]) {
  return temperatures.length > 0
    ? {
        min: Math.min(...temperatures) - TEMPERATURE_TOLERANCE,
        max: Math.max(...temperatures) + TEMPERATURE_TOLERANCE,
      }
    : null
}

function scopeEvidence(
  scope: ItemDerivedScopeName,
  enabled: boolean,
  logs: readonly WearLog[],
): ItemDerivedScopeEvidence {
  const auditObservations = enabled ? observationsFor(logs) : []
  const observations = auditObservations.filter(
    (observation) => !observation.inferredReturn,
  )
  const rawOkTemperatures = observations
    .filter((observation) => observation.feeling === 'ok')
    .map((observation) => observation.temperature)
  const matchedWearLogIds = [
    ...new Set(observations.map((observation) => observation.wearLogId)),
  ].sort()
  return {
    scope,
    enabled,
    rawOkTemperatures,
    expandedOkRange: expandedRange(rawOkTemperatures),
    coldObservations: observations.filter(
      (observation) => observation.feeling === 'cold',
    ),
    hotObservations: observations.filter(
      (observation) => observation.feeling === 'hot',
    ),
    matchedWearLogIds,
    distinctWearLogCount: matchedWearLogIds.length,
    distinctOutfitIds: [
      ...new Set(observations.map((observation) => observation.outfitId)),
    ].sort(),
    observationCount: observations.length,
    latestWornOn:
      [...observations]
        .sort(
          (left, right) =>
            right.wornOn.localeCompare(left.wornOn) ||
            left.wearLogId.localeCompare(right.wearLogId),
        )[0]?.wornOn ?? null,
    inferredReturnEndpointCount: auditObservations.filter(
      (observation) => observation.inferredReturn,
    ).length,
    sourcePlaceIds: [
      ...new Set(observations.map((observation) => observation.placeId)),
    ].sort((left, right) => (left ?? '').localeCompare(right ?? '')),
    sourceTransportModeIds: [
      ...new Set(
        observations.map((observation) => observation.transportModeId),
      ),
    ].sort((left, right) => (left ?? '').localeCompare(right ?? '')),
    observations,
    auditObservations,
  }
}

export function calculateScopedItemDerivedEvidence({
  data,
  targetOutfit,
  input,
}: {
  data: AppData
  targetOutfit: Outfit
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack' | 'placeId' | 'transportModeId'>
}): ScopedOutfitItemEvidence {
  const targetItems = targetOutfit.itemIds
    .map((itemId) => data.items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item))
    .filter((item) => auditThermalWeight(item) >= 2)
  const otherOutfits = data.outfits.filter(
    (outfit) => outfit.id !== targetOutfit.id && !outfit.archivedAt,
  )

  return {
    targetOutfitId: targetOutfit.id,
    targetTemperature:
      (input.tempOut + (input.tempBack ?? input.tempOut)) / 2,
    items: targetItems.map((item) => {
      const sourceOutfitIds = new Set(
        otherOutfits
          .filter((outfit) => outfit.itemIds.includes(item.id))
          .map((outfit) => outfit.id),
      )
      const logs = distinctLogs(
        data.wearLogs.filter((log) => sourceOutfitIds.has(log.outfitId)),
      )
      const exactEnabled =
        input.placeId !== null && input.transportModeId !== null
      const exactLogs = exactEnabled
        ? logs.filter(
            (log) =>
              log.placeId === input.placeId &&
              log.transportModeId === input.transportModeId,
          )
        : []
      const exactIds = new Set(exactLogs.map((log) => log.id))
      const currentTransportEnabled = input.transportModeId !== null
      const currentTransportLogs = currentTransportEnabled
        ? logs.filter(
            (log) =>
              log.transportModeId === input.transportModeId &&
              !exactIds.has(log.id),
          )
        : []
      const nullContextLogs = logs.filter(
        (log) => log.placeId === null || log.transportModeId === null,
      )

      return {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        thermalWeight: auditThermalWeight(item),
        isThermalCore: true,
        isBaseLayerSourceExcluded: isBaseLayer(item),
        scopes: {
          exactContext: scopeEvidence(
            'exactContext',
            exactEnabled,
            exactLogs,
          ),
          currentTransport: scopeEvidence(
            'currentTransport',
            currentTransportEnabled,
            currentTransportLogs,
          ),
          overall: scopeEvidence('overall', true, logs),
          nullContext: scopeEvidence('nullContext', true, nullContextLogs),
        },
      }
    }),
  }
}

function relevantToInput(
  observation: ItemDerivedObservation,
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack'>,
) {
  const currentTemperature =
    observation.endpoint === 'departure' ? input.tempOut : input.tempBack
  return (
    currentTemperature !== null &&
    Math.abs(observation.temperature - currentTemperature) <=
      TEMPERATURE_TOLERANCE
  )
}

function outcomeFor(observations: readonly ItemDerivedObservation[]) {
  const support = observations.some(
    (observation) => observation.feeling === 'ok',
  )
  const issue = observations.some(
    (observation) =>
      observation.feeling === 'cold' || observation.feeling === 'hot',
  )
  if (support && issue) return 'mixed'
  if (support) return 'support'
  if (issue) return 'issue'
  return 'unknown'
}

export function summarizeDirectOutfitEvidence(
  logs: readonly WearLog[],
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack'>,
): DirectOutfitThermalSummary {
  const allObservations = observationsFor(logs)
  const observations = allObservations.filter(
    (observation) => !observation.inferredReturn,
  )
  const allOkTemperatures = allObservations
    .filter((observation) => observation.feeling === 'ok')
    .map((observation) => observation.temperature)
  const directOkTemperatures = observations
    .filter((observation) => observation.feeling === 'ok')
    .map((observation) => observation.temperature)
  const relevant = observations.filter((observation) =>
    relevantToInput(observation, input),
  )
  const currentExpandedOkRange = expandedRange(allOkTemperatures)
  const primaryExpandedOkRange = expandedRange(directOkTemperatures)
  const target = (input.tempOut + (input.tempBack ?? input.tempOut)) / 2
  return {
    distinctWearLogCount: distinctLogs(logs).length,
    observations,
    directOkTemperatures,
    directColdTemperatures: observations
      .filter((observation) => observation.feeling === 'cold')
      .map((observation) => observation.temperature),
    directHotTemperatures: observations
      .filter((observation) => observation.feeling === 'hot')
      .map((observation) => observation.temperature),
    currentExpandedOkRange,
    primaryExpandedOkRange,
    outcomeNearTarget: outcomeFor(relevant),
    hasRelevantDirectIssue: relevant.some(
      (observation) =>
        observation.feeling === 'cold' || observation.feeling === 'hot',
    ),
    inferredReturnEndpointCount: allObservations.filter(
      (observation) => observation.inferredReturn,
    ).length,
    inferredRangeSensitivity:
      Boolean(currentExpandedOkRange) !== Boolean(primaryExpandedOkRange) ||
      (currentExpandedOkRange !== null &&
        primaryExpandedOkRange !== null &&
        ((target >= currentExpandedOkRange.min &&
          target <= currentExpandedOkRange.max) !==
          (target >= primaryExpandedOkRange.min &&
            target <= primaryExpandedOkRange.max))),
  }
}

function itemScopeOutcome(
  evidence: ItemDerivedThermalEvidence,
  scope: ItemDerivedScopeName,
  targetTemperature: number,
) {
  const scopeEvidence = evidence.scopes[scope]
  const support = Boolean(
    scopeEvidence.expandedOkRange &&
      targetTemperature >= scopeEvidence.expandedOkRange.min &&
      targetTemperature <= scopeEvidence.expandedOkRange.max,
  )
  const issue = [...scopeEvidence.coldObservations, ...scopeEvidence.hotObservations]
    .some(
      (observation) =>
        Math.abs(observation.temperature - targetTemperature) <=
        TEMPERATURE_TOLERANCE,
    )
  if (support && issue) return 'mixed'
  if (support) return 'support'
  if (issue) return 'issue'
  return 'unknown'
}

function minimumSupportCount(
  rule: ItemAggregationRule,
  coreItems: readonly ItemDerivedThermalEvidence[],
) {
  if (rule === 'all-core') return coreItems.length
  if (rule === 'at-least-two') return 2
  const totalWeight = coreItems.reduce(
    (sum, item) => sum + item.thermalWeight,
    0,
  )
  let weight = 0
  const sorted = [...coreItems].sort(
    (left, right) =>
      right.thermalWeight - left.thermalWeight ||
      left.itemId.localeCompare(right.itemId),
  )
  for (let index = 0; index < sorted.length; index += 1) {
    weight += sorted[index].thermalWeight
    if (weight > totalWeight / 2) return index + 1
  }
  return coreItems.length + 1
}

export function aggregateItemDerivedEvidence(
  evidence: ScopedOutfitItemEvidence,
  scope: ItemDerivedScopeName,
  rule: ItemAggregationRule,
): ItemAggregationResult {
  const coreItems = evidence.items.filter((item) => item.isThermalCore)
  const outcomes = coreItems.map((item) => ({
    item,
    outcome: itemScopeOutcome(item, scope, evidence.targetTemperature),
  }))
  const supporting = outcomes.filter((entry) => entry.outcome === 'support')
  const issues = outcomes.filter((entry) => entry.outcome === 'issue')
  const mixed = outcomes.filter((entry) => entry.outcome === 'mixed')
  const unknown = outcomes.filter((entry) => entry.outcome === 'unknown')
  const supportingWeight = supporting.reduce(
    (sum, entry) => sum + entry.item.thermalWeight,
    0,
  )
  const totalCoreWeight = coreItems.reduce(
    (sum, item) => sum + item.thermalWeight,
    0,
  )
  const hasNonInnerwearSupport = supporting.some(
    (entry) => !entry.item.isBaseLayerSourceExcluded,
  )
  const passesRule =
    rule === 'all-core'
      ? coreItems.length > 0 && supporting.length === coreItems.length
      : rule === 'at-least-two'
        ? supporting.length >= 2
        : totalCoreWeight > 0 && supportingWeight > totalCoreWeight / 2
  const eligible = passesRule && hasNonInnerwearSupport
  const outcome: EvidenceOutcome = eligible
    ? issues.length > 0 || mixed.length > 0
      ? 'mixed'
      : 'support'
    : issues.length > 0 && supporting.length === 0
      ? 'issue'
      : issues.length > 0 || mixed.length > 0 || supporting.length > 0
        ? 'mixed'
        : 'unknown'
  return {
    scope,
    rule,
    outcome,
    eligible: eligible && outcome === 'support',
    minimumSupportingCoreItemCount: minimumSupportCount(rule, coreItems),
    totalCoreItemCount: coreItems.length,
    supportingCoreItemIds: supporting.map((entry) => entry.item.itemId).sort(),
    issueCoreItemIds: issues.map((entry) => entry.item.itemId).sort(),
    mixedCoreItemIds: mixed.map((entry) => entry.item.itemId).sort(),
    unknownCoreItemIds: unknown.map((entry) => entry.item.itemId).sort(),
    supportingWeight,
    totalCoreWeight,
    hasNonInnerwearSupport,
    observationCount: coreItems.reduce(
      (sum, item) => sum + item.scopes[scope].observationCount,
      0,
    ),
  }
}

function weightedSimilarity(targetItems: Item[], candidateItems: Item[]) {
  const targetIds = new Set(targetItems.map((item) => item.id))
  const candidateIds = new Set(candidateItems.map((item) => item.id))
  const union = new Map(
    [...targetItems, ...candidateItems].map((item) => [item.id, item]),
  )
  const sharedWeight = [...union.values()]
    .filter((item) => targetIds.has(item.id) && candidateIds.has(item.id))
    .reduce((sum, item) => sum + auditThermalWeight(item), 0)
  const totalWeight = [...union.values()].reduce(
    (sum, item) => sum + auditThermalWeight(item),
    0,
  )
  return totalWeight > 0 ? sharedWeight / totalWeight : 0
}

export function calculateSimilarOutfitAuditMatches(
  data: AppData,
  targetOutfit: Outfit,
  targetTemperature: number,
): SimilarOutfitAuditMatch[] {
  const targetItems = targetOutfit.itemIds
    .map((itemId) => data.items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item))
  return data.outfits
    .filter((outfit) => outfit.id !== targetOutfit.id && !outfit.archivedAt)
    .flatMap((outfit): SimilarOutfitAuditMatch[] => {
      const candidateItems = outfit.itemIds
        .map((itemId) => data.items.find((item) => item.id === itemId))
        .filter((item): item is Item => Boolean(item))
      const candidateIds = new Set(candidateItems.map((item) => item.id))
      const shared = targetItems.filter((item) => candidateIds.has(item.id))
      const similarity = weightedSimilarity(targetItems, candidateItems)
      if (
        shared.length < 2 ||
        similarity < 0.4 ||
        shared.every((item) => auditThermalWeight(item) < 1) ||
        (!shared.some(isThermalAnchor) && similarity < 0.65)
      ) {
        return []
      }
      const logs = distinctLogs(
        data.wearLogs.filter((log) => log.outfitId === outfit.id),
      )
      const primary = observationsFor(logs).filter(
        (observation) => !observation.inferredReturn,
      )
      const range = expandedRange(
        primary
          .filter((observation) => observation.feeling === 'ok')
          .map((observation) => observation.temperature),
      )
      return [
        {
          outfitId: outfit.id,
          weightedSimilarity: similarity,
          sharedItemIds: shared.map((item) => item.id).sort(),
          okRange: range,
          supportsTarget: Boolean(
            range &&
              targetTemperature >= range.min &&
              targetTemperature <= range.max,
          ),
          matchedWearLogIds: logs.map((log) => log.id),
        },
      ]
    })
    .sort(
      (left, right) =>
        Number(right.supportsTarget) - Number(left.supportsTarget) ||
        right.weightedSimilarity - left.weightedSimilarity ||
        left.outfitId.localeCompare(right.outfitId),
    )
}

function isGenuineNovelty(
  evidence: InitialNoveltyEvidence | undefined,
): evidence is InitialNoveltyEvidence & { initialNoveltyDate: string } {
  return Boolean(
    evidence?.initialNoveltyDate &&
      (evidence.kind === 'first_acquisition' ||
        evidence.kind === 'handmade_initial_completion'),
  )
}

export function buildSparseEligibilityCandidates({
  data,
  input,
  results,
  noveltyOverlay,
}: {
  data: AppData
  input: RecommendationInput
  results: readonly RecommendationResult[]
  noveltyOverlay: AuthoritativeNoveltyOverlay
}): SparseEligibilityCandidate[] {
  const itemById = new Map(data.items.map((item) => [item.id, item]))
  return results.map((result, index) => {
    const sourceItemIds = result.outfit.itemIds
      .filter((itemId) => {
        const item = itemById.get(itemId)
        return Boolean(
          item &&
            isN3RecentPurchaseSourceCategory(item.category) &&
            noveltyOverlay.sourceEligibilityByItemId.get(itemId)?.eligible !==
              false &&
            isGenuineNovelty(noveltyOverlay.noveltyByItemId.get(itemId)),
        )
      })
      .sort()
    const logs = data.wearLogs.filter(
      (log) => log.outfitId === result.outfit.id,
    )
    return {
      result,
      baselineRank: index + 1,
      sourceItemIds,
      direct: summarizeDirectOutfitEvidence(logs, input),
      derived: calculateScopedItemDerivedEvidence({
        data,
        targetOutfit: result.outfit,
        input,
      }),
      similarOutfits: calculateSimilarOutfitAuditMatches(
        data,
        result.outfit,
        result.targetTemp,
      ),
    }
  })
}

function rangeContains(
  range: { min: number; max: number } | null,
  target: number,
) {
  return Boolean(range && target >= range.min && target <= range.max)
}

function decideSparseEligibility(
  candidate: SparseEligibilityCandidate,
  model: SparseEligibilityModel,
  rule: ItemAggregationRule,
): SparseEligibilityDecision {
  if (
    candidate.result.evidence === 'observed' &&
    rangeContains(candidate.result.okRange, candidate.result.targetTemp)
  ) {
    return {
      candidate,
      eligible: true,
      basis: 'direct-outfit',
      aggregation: null,
    }
  }
  if (model === 'S0') {
    return {
      candidate,
      eligible: false,
      basis: 'outside-model-log-threshold',
      aggregation: null,
    }
  }
  const logCount = candidate.direct.distinctWearLogCount
  const withinThreshold =
    model === 'S1' ? logCount === 1 : logCount === 0 || logCount === 1
  if (!withinThreshold) {
    return {
      candidate,
      eligible: false,
      basis: 'outside-model-log-threshold',
      aggregation: null,
    }
  }
  if (candidate.direct.hasRelevantDirectIssue) {
    return {
      candidate,
      eligible: false,
      basis: 'direct-issue',
      aggregation: null,
    }
  }

  const exact = aggregateItemDerivedEvidence(
    candidate.derived,
    'exactContext',
    rule,
  )
  if (exact.eligible) {
    return {
      candidate,
      eligible: true,
      basis: 'exact-context-items',
      aggregation: exact,
    }
  }
  if (model === 'S1') {
    return {
      candidate,
      eligible: false,
      basis: 'insufficient-item-evidence',
      aggregation: exact,
    }
  }

  const exactAbsent = exact.observationCount === 0
  if (exactAbsent) {
    const transport = aggregateItemDerivedEvidence(
      candidate.derived,
      'currentTransport',
      rule,
    )
    if (transport.eligible) {
      return {
        candidate,
        eligible: true,
        basis: 'current-transport-items',
        aggregation: transport,
      }
    }
  }
  if (model === 'S3') {
    const overall = aggregateItemDerivedEvidence(
      candidate.derived,
      'overall',
      rule,
    )
    if (overall.eligible) {
      return {
        candidate,
        eligible: true,
        basis: 'overall-items',
        aggregation: overall,
      }
    }
    return {
      candidate,
      eligible: false,
      basis: 'insufficient-item-evidence',
      aggregation: overall,
    }
  }
  return {
    candidate,
    eligible: false,
    basis: 'insufficient-item-evidence',
    aggregation: exact,
  }
}

export function simulateSparseRecentPurchaseEligibility({
  candidates,
  noveltyOverlay,
  model,
  aggregationRule = 'all-core',
  limit = 3,
}: {
  candidates: readonly SparseEligibilityCandidate[]
  noveltyOverlay: AuthoritativeNoveltyOverlay
  model: SparseEligibilityModel
  aggregationRule?: ItemAggregationRule
  limit?: number
}): SparseEligibilitySimulation {
  const decisions = candidates.map((candidate) =>
    decideSparseEligibility(candidate, model, aggregationRule),
  )
  const thermalEligible = decisions.filter((decision) => decision.eligible)
  const sourceEligible = thermalEligible.filter(
    (decision) => decision.candidate.sourceItemIds.length > 0,
  )
  const sourceItems = [
    ...new Set(
      sourceEligible.flatMap((decision) => decision.candidate.sourceItemIds),
    ),
  ]
    .map((itemId) => ({
      itemId,
      evidence: noveltyOverlay.noveltyByItemId.get(itemId),
    }))
    .filter(
      (
        entry,
      ): entry is {
        itemId: string
        evidence: InitialNoveltyEvidence & { initialNoveltyDate: string }
      } => isGenuineNovelty(entry.evidence),
    )
    .sort(
      (left, right) =>
        right.evidence.initialNoveltyDate.localeCompare(
          left.evidence.initialNoveltyDate,
        ) || left.itemId.localeCompare(right.itemId),
    )
  const selectedOutfitIds = new Set<string>()
  const selections: SparseRecentPurchaseSelection[] = []
  for (const source of sourceItems) {
    const decision = sourceEligible
      .filter(
        (entry) =>
          entry.candidate.sourceItemIds.includes(source.itemId) &&
          !selectedOutfitIds.has(entry.candidate.result.outfit.id),
      )
      .sort(
        (left, right) =>
          left.candidate.baselineRank - right.candidate.baselineRank ||
          left.candidate.result.outfit.id.localeCompare(
            right.candidate.result.outfit.id,
          ),
      )[0]
    if (!decision) continue
    selectedOutfitIds.add(decision.candidate.result.outfit.id)
    selections.push({
      result: decision.candidate.result,
      sourceItemId: source.itemId,
      noveltyDate: source.evidence.initialNoveltyDate,
      decision,
    })
    if (selections.length === limit) break
  }
  return {
    model,
    aggregationRule: model === 'S0' ? null : aggregationRule,
    decisions,
    thermalEligibleOutfitCount: thermalEligible.length,
    sourceEligibleOutfitCount: sourceEligible.length,
    distinctNoveltySourceItemCount: sourceItems.length,
    selections,
  }
}
