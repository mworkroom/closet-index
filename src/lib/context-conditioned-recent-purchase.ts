import {
  isN3RecentPurchaseSourceCategory,
  type AuthoritativeNoveltyOverlay,
  type InitialNoveltyEvidence,
} from './recent-purchase-semantics'
import type {
  AppData,
  RecommendationInput,
  RecommendationResult,
  ThermalFeeling,
  WearLog,
} from './types'

export type ContextEligibilityState =
  | 'exact_support'
  | 'exact_issue'
  | 'exact_mixed'
  | 'current_transport_support'
  | 'cross_context_only'
  | 'untried'
  | 'unknown'

export type ContextEligibilityScopeName =
  | 'exactContext'
  | 'currentTransport'
  | 'overall'

export type ContextEligibilityOutcome =
  | 'support'
  | 'issue'
  | 'mixed'
  | 'unknown'

export type ContextRecentPurchaseModel = 'C0' | 'C1' | 'C2' | 'C3' | 'C4'
export type C3TransportVariant = 'eligible' | 'report-only'
export type MissingContextFallback = 'current-c0' | 'disabled'

export interface ContextEligibilityObservation {
  wearLogId: string
  outfitId: string
  endpoint: 'departure' | 'return'
  historicalTemperature: number
  currentTemperature: number | null
  temperatureDelta: number | null
  feeling: Exclude<ThermalFeeling, null>
  wornOn: string
  placeId: string | null
  transportModeId: string | null
  inferredReturn: boolean
  relevant: boolean
}

export interface ContextEligibilityScope {
  scope: ContextEligibilityScopeName
  enabled: boolean
  outcome: ContextEligibilityOutcome
  rawOkTemperatures: number[]
  expandedOkRange: { min: number; max: number } | null
  matchedWearLogIds: string[]
  distinctWearLogCount: number
  observations: ContextEligibilityObservation[]
  relevantObservations: ContextEligibilityObservation[]
  auditObservations: ContextEligibilityObservation[]
  inferredReturnEndpointCount: number
  sourcePlaceIds: Array<string | null>
  sourceTransportModeIds: Array<string | null>
}

export interface OutfitContextEligibility {
  outfitId: string
  state: ContextEligibilityState
  totalDistinctWearLogCount: number
  hasRelevantIssue: boolean
  exactContext: ContextEligibilityScope
  currentTransport: ContextEligibilityScope
  overall: ContextEligibilityScope
}

export interface ContextEligibilityCandidate {
  result: RecommendationResult
  baselineRank: number
  sourceItemIds: string[]
  context: OutfitContextEligibility
}

export interface ContextEligibilityDecision {
  candidate: ContextEligibilityCandidate
  eligible: boolean
  tier:
    | 'current-overall'
    | 'exact'
    | 'transport'
    | 'exploration'
    | 'cross-context'
    | 'fallback-c0'
    | 'ineligible'
  reason: string
}

export interface ContextRecentPurchaseSelection {
  result: RecommendationResult
  sourceItemId: string
  noveltyDate: string
  decision: ContextEligibilityDecision
}

export interface ContextRecentPurchaseSimulation {
  model: ContextRecentPurchaseModel
  c3TransportVariant: C3TransportVariant | null
  missingContextFallback: MissingContextFallback
  decisions: ContextEligibilityDecision[]
  eligibleOutfitCount: number
  distinctNoveltySourceItemCount: number
  selections: ContextRecentPurchaseSelection[]
  returnedFewerThanLimit: boolean
}

const TEMPERATURE_TOLERANCE = 2
const tierOrder: Record<ContextEligibilityDecision['tier'], number> = {
  'current-overall': 0,
  exact: 0,
  transport: 1,
  exploration: 2,
  'cross-context': 3,
  'fallback-c0': 0,
  ineligible: 99,
}

function logIdentity(log: WearLog) {
  return [
    log.id,
    log.outfitId,
    log.wornOn,
    log.tempOut ?? '',
    log.tempBack ?? '',
    log.tempBackInferred,
    log.feelingOut ?? '',
    log.feelingBack ?? '',
    log.placeId ?? '',
    log.transportModeId ?? '',
  ].join('\u0000')
}

function distinctWearLogs(logs: readonly WearLog[]) {
  const byId = new Map<string, WearLog>()
  for (const log of logs) {
    const current = byId.get(log.id)
    if (!current || logIdentity(log).localeCompare(logIdentity(current)) < 0) {
      byId.set(log.id, log)
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.wornOn.localeCompare(right.wornOn) || left.id.localeCompare(right.id),
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

function observationFor({
  log,
  endpoint,
  historicalTemperature,
  currentTemperature,
  feeling,
  inferredReturn,
}: {
  log: WearLog
  endpoint: ContextEligibilityObservation['endpoint']
  historicalTemperature: number | null
  currentTemperature: number | null
  feeling: ThermalFeeling
  inferredReturn: boolean
}): ContextEligibilityObservation | null {
  if (historicalTemperature === null || feeling === null) return null
  const temperatureDelta =
    currentTemperature === null
      ? null
      : Math.abs(historicalTemperature - currentTemperature)
  return {
    wearLogId: log.id,
    outfitId: log.outfitId,
    endpoint,
    historicalTemperature,
    currentTemperature,
    temperatureDelta,
    feeling,
    wornOn: log.wornOn,
    placeId: log.placeId,
    transportModeId: log.transportModeId,
    inferredReturn,
    relevant:
      temperatureDelta !== null && temperatureDelta <= TEMPERATURE_TOLERANCE,
  }
}

function observationsFor(
  logs: readonly WearLog[],
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack'>,
) {
  const byEndpoint = new Map<string, ContextEligibilityObservation>()
  for (const log of distinctWearLogs(logs)) {
    const departure = observationFor({
      log,
      endpoint: 'departure',
      historicalTemperature: log.tempOut,
      currentTemperature: input.tempOut,
      feeling: log.feelingOut,
      inferredReturn: false,
    })
    if (departure) byEndpoint.set(`${log.id}:departure`, departure)
    const returned = observationFor({
      log,
      endpoint: 'return',
      historicalTemperature: log.tempBack,
      currentTemperature: input.tempBack,
      feeling: log.feelingBack,
      inferredReturn: Boolean(log.tempBackInferred),
    })
    if (returned) byEndpoint.set(`${log.id}:return`, returned)
  }
  return [...byEndpoint.values()].sort(
    (left, right) =>
      left.wearLogId.localeCompare(right.wearLogId) ||
      left.endpoint.localeCompare(right.endpoint),
  )
}

function outcomeFor(
  observations: readonly ContextEligibilityObservation[],
): ContextEligibilityOutcome {
  const support = observations.some((observation) => observation.feeling === 'ok')
  const issue = observations.some(
    (observation) =>
      observation.feeling === 'cold' || observation.feeling === 'hot',
  )
  if (support && issue) return 'mixed'
  if (support) return 'support'
  if (issue) return 'issue'
  return 'unknown'
}

function scopeEvidence(
  scope: ContextEligibilityScopeName,
  enabled: boolean,
  logs: readonly WearLog[],
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack'>,
): ContextEligibilityScope {
  const auditObservations = enabled ? observationsFor(logs, input) : []
  const observations = auditObservations.filter(
    (observation) => !observation.inferredReturn,
  )
  const relevantObservations = observations.filter(
    (observation) => observation.relevant,
  )
  const rawOkTemperatures = observations
    .filter((observation) => observation.feeling === 'ok')
    .map((observation) => observation.historicalTemperature)
  const matchedWearLogIds = [
    ...new Set(relevantObservations.map((observation) => observation.wearLogId)),
  ].sort()
  return {
    scope,
    enabled,
    outcome: outcomeFor(relevantObservations),
    rawOkTemperatures,
    expandedOkRange: expandedRange(rawOkTemperatures),
    matchedWearLogIds,
    distinctWearLogCount: matchedWearLogIds.length,
    observations,
    relevantObservations,
    auditObservations,
    inferredReturnEndpointCount: auditObservations.filter(
      (observation) => observation.inferredReturn,
    ).length,
    sourcePlaceIds: [
      ...new Set(observations.map((observation) => observation.placeId)),
    ].sort((left, right) => (left ?? '').localeCompare(right ?? '')),
    sourceTransportModeIds: [
      ...new Set(observations.map((observation) => observation.transportModeId)),
    ].sort((left, right) => (left ?? '').localeCompare(right ?? '')),
  }
}

export function calculateOutfitContextEligibility(
  logs: readonly WearLog[],
  input: Pick<
    RecommendationInput,
    'tempOut' | 'tempBack' | 'placeId' | 'transportModeId'
  >,
): OutfitContextEligibility {
  const distinctLogs = distinctWearLogs(logs)
  const outfitId = distinctLogs[0]?.outfitId ?? ''
  const transportEnabled = input.transportModeId !== null
  const exactEnabled = transportEnabled && input.placeId !== null
  const exactLogs = exactEnabled
    ? distinctLogs.filter(
        (log) =>
          log.placeId === input.placeId &&
          log.transportModeId !== null &&
          log.transportModeId === input.transportModeId,
      )
    : []
  const exactIds = new Set(exactLogs.map((log) => log.id))
  const currentTransportLogs = transportEnabled
    ? distinctLogs.filter(
        (log) =>
          log.transportModeId !== null &&
          log.transportModeId === input.transportModeId &&
          !exactIds.has(log.id),
      )
    : []
  const exactContext = scopeEvidence(
    'exactContext',
    exactEnabled,
    exactLogs,
    input,
  )
  const currentTransport = scopeEvidence(
    'currentTransport',
    transportEnabled,
    currentTransportLogs,
    input,
  )
  const overall = scopeEvidence('overall', true, distinctLogs, input)
  const hasRelevantIssue = overall.relevantObservations.some(
    (observation) =>
      observation.feeling === 'cold' || observation.feeling === 'hot',
  )

  let state: ContextEligibilityState = 'unknown'
  if (distinctLogs.length === 0) state = 'untried'
  else if (!transportEnabled) state = 'unknown'
  else if (exactContext.outcome === 'support') state = 'exact_support'
  else if (exactContext.outcome === 'issue') state = 'exact_issue'
  else if (exactContext.outcome === 'mixed') state = 'exact_mixed'
  else if (currentTransport.outcome === 'support') {
    state = 'current_transport_support'
  } else {
    const supportingObservations = overall.relevantObservations.filter(
      (observation) => observation.feeling === 'ok',
    )
    const allSupportOutsideExact =
      supportingObservations.length > 0 &&
      supportingObservations.every(
        (observation) =>
          observation.placeId !== input.placeId ||
          observation.transportModeId !== input.transportModeId,
      )
    if (allSupportOutsideExact) state = 'cross_context_only'
  }

  return {
    outfitId,
    state,
    totalDistinctWearLogCount: distinctLogs.length,
    hasRelevantIssue,
    exactContext,
    currentTransport,
    overall,
  }
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

export function buildContextEligibilityCandidates({
  data,
  input,
  results,
  noveltyOverlay,
}: {
  data: AppData
  input: RecommendationInput
  results: readonly RecommendationResult[]
  noveltyOverlay: AuthoritativeNoveltyOverlay
}): ContextEligibilityCandidate[] {
  const itemById = new Map(data.items.map((item) => [item.id, item]))
  return results.map((result, baselineRank) => ({
    result,
    baselineRank,
    sourceItemIds: result.outfit.itemIds
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
      .sort(),
    context: calculateOutfitContextEligibility(
      data.wearLogs.filter((log) => log.outfitId === result.outfit.id),
      input,
    ),
  }))
}

function rangeContains(
  range: { min: number; max: number } | null,
  target: number,
) {
  return Boolean(range && target >= range.min && target <= range.max)
}

function currentC0Eligible(candidate: ContextEligibilityCandidate) {
  return (
    candidate.result.evidence === 'observed' &&
    rangeContains(candidate.result.okRange, candidate.result.targetTemp)
  )
}

function decideCandidate(
  candidate: ContextEligibilityCandidate,
  model: ContextRecentPurchaseModel,
  c3TransportVariant: C3TransportVariant,
  missingContextFallback: MissingContextFallback,
  missingContext: boolean,
): ContextEligibilityDecision {
  if (model === 'C0') {
    const eligible = currentC0Eligible(candidate)
    return {
      candidate,
      eligible,
      tier: eligible ? 'current-overall' : 'ineligible',
      reason: eligible
        ? 'current observed overall Outfit range contains target'
        : 'current overall Outfit gate does not pass',
    }
  }
  if (missingContext) {
    const eligible =
      missingContextFallback === 'current-c0' && currentC0Eligible(candidate)
    return {
      candidate,
      eligible,
      tier: eligible ? 'fallback-c0' : 'ineligible',
      reason: eligible
        ? 'missing context uses explicit C0 fallback'
        : 'missing context disables context-conditioned membership',
    }
  }

  const state = candidate.context.state
  if (state === 'exact_support') {
    return {
      candidate,
      eligible: true,
      tier: 'exact',
      reason: 'same Place and Transport has relevant OK without issue',
    }
  }
  if (
    (model === 'C2' || model === 'C4' ||
      (model === 'C3' && c3TransportVariant === 'eligible')) &&
    state === 'current_transport_support'
  ) {
    return {
      candidate,
      eligible: true,
      tier: 'transport',
      reason: 'same Transport in another Place supports target',
    }
  }
  if (
    (model === 'C3' || model === 'C4') &&
    (state === 'untried' ||
      (state === 'unknown' && !candidate.context.hasRelevantIssue))
  ) {
    return {
      candidate,
      eligible: true,
      tier: 'exploration',
      reason:
        state === 'untried'
          ? 'genuine-new Outfit is untried exploration'
          : 'genuine-new Outfit has no relevant issue and remains unknown',
    }
  }
  if (model === 'C4' && state === 'cross_context_only') {
    return {
      candidate,
      eligible: true,
      tier: 'cross-context',
      reason: 'diagnostic only: overall support comes from another context',
    }
  }
  return {
    candidate,
    eligible: false,
    tier: 'ineligible',
    reason: `state ${state} is not eligible in ${model}`,
  }
}

export function simulateContextRecentPurchases({
  candidates,
  noveltyOverlay,
  model,
  c3TransportVariant = 'report-only',
  missingContextFallback = 'current-c0',
  limit = 3,
}: {
  candidates: readonly ContextEligibilityCandidate[]
  noveltyOverlay: AuthoritativeNoveltyOverlay
  model: ContextRecentPurchaseModel
  c3TransportVariant?: C3TransportVariant
  missingContextFallback?: MissingContextFallback
  limit?: number
}): ContextRecentPurchaseSimulation {
  const missingContext = candidates.some(
    (candidate) =>
      candidate.context.exactContext.enabled === false ||
      candidate.context.currentTransport.enabled === false,
  )
  const decisions = candidates.map((candidate) =>
    decideCandidate(
      candidate,
      model,
      c3TransportVariant,
      missingContextFallback,
      missingContext,
    ),
  )
  const eligibleDecisions = decisions.filter(
    (decision) => decision.eligible && decision.candidate.sourceItemIds.length > 0,
  )
  const sourceIds = [
    ...new Set(
      eligibleDecisions.flatMap((decision) => decision.candidate.sourceItemIds),
    ),
  ]
  const sourceRows = sourceIds
    .map((itemId) => ({
      itemId,
      novelty: noveltyOverlay.noveltyByItemId.get(itemId),
    }))
    .filter(
      (
        entry,
      ): entry is {
        itemId: string
        novelty: InitialNoveltyEvidence & { initialNoveltyDate: string }
      } => isGenuineNovelty(entry.novelty),
    )
  const selectedSourceIds = new Set<string>()
  const selectedOutfitIds = new Set<string>()
  const selections: ContextRecentPurchaseSelection[] = []
  const tiers = [...new Set(eligibleDecisions.map((decision) => decision.tier))]
    .sort((left, right) => tierOrder[left] - tierOrder[right])

  for (const tier of tiers) {
    const tierDecisions = eligibleDecisions.filter(
      (decision) => decision.tier === tier,
    )
    const tierSourceRows = sourceRows
      .filter(
        (source) =>
          !selectedSourceIds.has(source.itemId) &&
          tierDecisions.some((decision) =>
            decision.candidate.sourceItemIds.includes(source.itemId),
          ),
      )
      .sort(
        (left, right) =>
          right.novelty.initialNoveltyDate.localeCompare(
            left.novelty.initialNoveltyDate,
          ) || left.itemId.localeCompare(right.itemId),
      )
    for (const source of tierSourceRows) {
      const decision = tierDecisions
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
      selectedSourceIds.add(source.itemId)
      selectedOutfitIds.add(decision.candidate.result.outfit.id)
      selections.push({
        result: decision.candidate.result,
        sourceItemId: source.itemId,
        noveltyDate: source.novelty.initialNoveltyDate,
        decision,
      })
      if (selections.length === limit) break
    }
    if (selections.length === limit) break
  }

  return {
    model,
    c3TransportVariant: model === 'C3' ? c3TransportVariant : null,
    missingContextFallback,
    decisions,
    eligibleOutfitCount: eligibleDecisions.length,
    distinctNoveltySourceItemCount: new Set(
      eligibleDecisions.flatMap((decision) => decision.candidate.sourceItemIds),
    ).size,
    selections,
    returnedFewerThanLimit: selections.length < limit,
  }
}
