import type {
  RecommendationInput,
  RecommendationLevel,
  ThermalFeeling,
  WearLog,
} from './types'

export type DirectEvidenceOutcome =
  | 'direct_support'
  | 'direct_issue'
  | 'mixed'
  | 'unknown'

export type DirectEvidenceConfidence =
  | 'none'
  | 'observed-once'
  | 'repeated'
  | 'mixed'

export type DirectEvidenceEndpoint = 'departure' | 'return'
export type DirectEvidenceScopeName = 'exactContext' | 'currentTransport'

export interface DirectEvidenceObservation {
  wearLogId: string
  outfitId: string
  scope: DirectEvidenceScopeName
  endpoint: DirectEvidenceEndpoint
  currentTemperature: number
  historicalTemperature: number
  temperatureDelta: number
  feeling: Exclude<ThermalFeeling, null>
  wornOn: string
  inferredReturn: boolean
  rankingEligible: boolean
  placeId: string | null
  transportModeId: string | null
}

export interface DirectEvidenceScope {
  enabled: boolean
  outcome: DirectEvidenceOutcome
  confidence: DirectEvidenceConfidence
  matchedWearLogIds: string[]
  distinctWearLogCount: number
  observationCount: number
  observations: DirectEvidenceObservation[]
  auditObservations: DirectEvidenceObservation[]
  inferredReturnAuditObservationCount: number
}

export interface DirectEvidence {
  temperatureTolerance: number
  currentPlaceId: string | null
  currentTransportModeId: string | null
  exactContext: DirectEvidenceScope
  currentTransport: DirectEvidenceScope
}

export type DirectEvidencePolicyVariant = 'E0' | 'E1' | 'E2'
export type DirectEvidenceMovementCap = 1 | 3 | 5
export type DirectEvidencePolicyDirection = 'up' | 'down' | 'neutral'

export interface DirectEvidencePolicyCandidate<T> {
  id: string
  level: RecommendationLevel
  baselineOrder: number
  evidence: DirectEvidence
  value: T
}

export interface DirectEvidencePolicyResult<T>
  extends DirectEvidencePolicyCandidate<T> {
  newOrder: number
  movement: number
  direction: DirectEvidencePolicyDirection
  directlyTargeted: boolean
}

export interface DirectEvidenceGroupSimulation<T> {
  ordered: DirectEvidencePolicyResult<T>[]
  directlyMovedOutfitCount: number
  totalChangedPositions: number
  maximumIndividualMovement: number
}

export interface DirectEvidencePartitions<T> {
  recentPurchases: T[]
  recommendations: T[]
  trialRecommendations: T[]
}

export interface DirectEvidencePartitionSimulation<T> {
  variant: DirectEvidencePolicyVariant
  movementCap: DirectEvidenceMovementCap
  groups: DirectEvidencePartitions<T>
  groupDetails: {
    recentPurchases: DirectEvidenceGroupSimulation<T>
    recommendations: DirectEvidenceGroupSimulation<T>
    trialRecommendations: DirectEvidenceGroupSimulation<T>
  }
  directlyMovedOutfitCount: number
  totalChangedPositions: number
  maximumIndividualMovement: number
  groupMembershipChanges: number
}

const TEMPERATURE_TOLERANCE = 2
const endpointRank: Record<DirectEvidenceEndpoint, number> = {
  departure: 0,
  return: 1,
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
    const existing = byId.get(log.id)
    if (!existing || logIdentity(log).localeCompare(logIdentity(existing)) < 0) {
      byId.set(log.id, log)
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function observationSort(
  left: DirectEvidenceObservation,
  right: DirectEvidenceObservation,
) {
  return (
    left.wearLogId.localeCompare(right.wearLogId) ||
    endpointRank[left.endpoint] - endpointRank[right.endpoint] ||
    left.historicalTemperature - right.historicalTemperature ||
    left.feeling.localeCompare(right.feeling)
  )
}

function relevantObservation(
  log: WearLog,
  scope: DirectEvidenceScopeName,
  endpoint: DirectEvidenceEndpoint,
  currentTemperature: number,
  historicalTemperature: number | null,
  feeling: ThermalFeeling,
  inferredReturn: boolean,
): DirectEvidenceObservation | null {
  if (historicalTemperature === null || feeling === null) return null
  const delta = Math.abs(historicalTemperature - currentTemperature)
  if (delta > TEMPERATURE_TOLERANCE) return null

  return {
    wearLogId: log.id,
    outfitId: log.outfitId,
    scope,
    endpoint,
    currentTemperature,
    historicalTemperature,
    temperatureDelta: delta,
    feeling,
    wornOn: log.wornOn,
    inferredReturn,
    rankingEligible: !inferredReturn,
    placeId: log.placeId,
    transportModeId: log.transportModeId,
  }
}

function observationsFor(
  logs: readonly WearLog[],
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack'>,
  scope: DirectEvidenceScopeName,
) {
  const observations: DirectEvidenceObservation[] = []
  for (const log of logs) {
    const departure = relevantObservation(
      log,
      scope,
      'departure',
      input.tempOut,
      log.tempOut,
      log.feelingOut,
      false,
    )
    if (departure) observations.push(departure)

    if (input.tempBack !== null) {
      const returned = relevantObservation(
        log,
        scope,
        'return',
        input.tempBack,
        log.tempBack,
        log.feelingBack,
        Boolean(log.tempBackInferred),
      )
      if (returned) observations.push(returned)
    }
  }
  return observations.sort(observationSort)
}

function outcomeFor(
  observations: readonly DirectEvidenceObservation[],
): DirectEvidenceOutcome {
  const hasSupport = observations.some((observation) => observation.feeling === 'ok')
  const hasIssue = observations.some(
    (observation) =>
      observation.feeling === 'cold' || observation.feeling === 'hot',
  )
  if (hasSupport && hasIssue) return 'mixed'
  if (hasSupport) return 'direct_support'
  if (hasIssue) return 'direct_issue'
  return 'unknown'
}

function scopeEvidence(
  enabled: boolean,
  logs: readonly WearLog[],
  input: Pick<RecommendationInput, 'tempOut' | 'tempBack'>,
  scope: DirectEvidenceScopeName,
): DirectEvidenceScope {
  if (!enabled) {
    return {
      enabled: false,
      outcome: 'unknown',
      confidence: 'none',
      matchedWearLogIds: [],
      distinctWearLogCount: 0,
      observationCount: 0,
      observations: [],
      auditObservations: [],
      inferredReturnAuditObservationCount: 0,
    }
  }

  const auditObservations = observationsFor(logs, input, scope)
  const observations = auditObservations.filter(
    (observation) => observation.rankingEligible,
  )
  const matchedWearLogIds = [
    ...new Set(observations.map((observation) => observation.wearLogId)),
  ].sort((left, right) => left.localeCompare(right))
  const outcome = outcomeFor(observations)
  const confidence: DirectEvidenceConfidence =
    outcome === 'unknown'
      ? 'none'
      : outcome === 'mixed'
        ? 'mixed'
        : matchedWearLogIds.length >= 2
          ? 'repeated'
          : 'observed-once'

  return {
    enabled: true,
    outcome,
    confidence,
    matchedWearLogIds,
    distinctWearLogCount: matchedWearLogIds.length,
    observationCount: observations.length,
    observations,
    auditObservations,
    inferredReturnAuditObservationCount: auditObservations.filter(
      (observation) => observation.inferredReturn,
    ).length,
  }
}

export function calculateDirectEvidence(
  logs: readonly WearLog[],
  input: Pick<
    RecommendationInput,
    'tempOut' | 'tempBack' | 'placeId' | 'transportModeId'
  >,
): DirectEvidence {
  const distinctLogs = distinctWearLogs(logs)
  const transportEnabled = input.transportModeId !== null
  const exactEnabled = input.placeId !== null && transportEnabled
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

  return {
    temperatureTolerance: TEMPERATURE_TOLERANCE,
    currentPlaceId: input.placeId,
    currentTransportModeId: input.transportModeId,
    exactContext: scopeEvidence(exactEnabled, exactLogs, input, 'exactContext'),
    currentTransport: scopeEvidence(
      transportEnabled,
      currentTransportLogs,
      input,
      'currentTransport',
    ),
  }
}

function directionFor(
  evidence: DirectEvidence,
  variant: DirectEvidencePolicyVariant,
): DirectEvidencePolicyDirection {
  if (variant === 'E0' || !evidence.exactContext.enabled) return 'neutral'
  if (evidence.exactContext.outcome === 'direct_issue') return 'down'
  if (
    variant === 'E2' &&
    evidence.exactContext.outcome === 'direct_support'
  ) {
    return 'up'
  }
  return 'neutral'
}

function directionPriority(direction: DirectEvidencePolicyDirection) {
  if (direction === 'up') return -1
  if (direction === 'down') return 1
  return 0
}

function positionAllowed<T>(
  candidate: DirectEvidencePolicyCandidate<T>,
  direction: DirectEvidencePolicyDirection,
  nextIndex: number,
  movementCap: DirectEvidenceMovementCap,
) {
  if (direction === 'neutral') {
    return Math.abs(nextIndex - candidate.baselineOrder) <= movementCap
  }
  if (direction === 'up') {
    return (
      nextIndex <= candidate.baselineOrder &&
      candidate.baselineOrder - nextIndex <= movementCap
    )
  }
  return (
    nextIndex >= candidate.baselineOrder &&
    nextIndex - candidate.baselineOrder <= movementCap
  )
}

export function simulateDirectEvidenceGroup<T>(
  candidates: readonly DirectEvidencePolicyCandidate<T>[],
  variant: DirectEvidencePolicyVariant,
  movementCap: DirectEvidenceMovementCap,
): DirectEvidenceGroupSimulation<T> {
  const baseline = [...candidates]
    .sort(
      (left, right) =>
        left.baselineOrder - right.baselineOrder || left.id.localeCompare(right.id),
    )
    .map((candidate, baselineOrder) => ({ ...candidate, baselineOrder }))
  const ordered = [...baseline]
  const directionById = new Map(
    baseline.map((candidate) => [
      candidate.id,
      directionFor(candidate.evidence, variant),
    ]),
  )

  let changed = true
  while (changed) {
    changed = false
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const left = ordered[index]
      const right = ordered[index + 1]
      if (left.level !== right.level) continue
      const leftDirection = directionById.get(left.id) ?? 'neutral'
      const rightDirection = directionById.get(right.id) ?? 'neutral'
      if (
        directionPriority(leftDirection) <= directionPriority(rightDirection)
      ) {
        continue
      }
      if (
        !positionAllowed(left, leftDirection, index + 1, movementCap) ||
        !positionAllowed(right, rightDirection, index, movementCap)
      ) {
        continue
      }
      ordered[index] = right
      ordered[index + 1] = left
      changed = true
    }
  }

  const results = ordered.map((candidate, newOrder) => {
    const direction = directionById.get(candidate.id) ?? 'neutral'
    return {
      ...candidate,
      newOrder,
      movement: newOrder - candidate.baselineOrder,
      direction,
      directlyTargeted: direction !== 'neutral',
    }
  })

  return {
    ordered: results,
    directlyMovedOutfitCount: results.filter(
      (result) => result.directlyTargeted && result.movement !== 0,
    ).length,
    totalChangedPositions: results.filter((result) => result.movement !== 0)
      .length,
    maximumIndividualMovement: Math.max(
      0,
      ...results.map((result) => Math.abs(result.movement)),
    ),
  }
}

type GroupName = keyof DirectEvidencePartitions<unknown>

export function simulateDirectEvidencePartitions<
  T extends { outfit: { id: string }; level: RecommendationLevel },
>(
  groups: DirectEvidencePartitions<T>,
  evidenceByOutfitId: ReadonlyMap<string, DirectEvidence>,
  variant: DirectEvidencePolicyVariant,
  movementCap: DirectEvidenceMovementCap,
): DirectEvidencePartitionSimulation<T> {
  const groupNames: GroupName[] = [
    'recentPurchases',
    'recommendations',
    'trialRecommendations',
  ]
  const details = Object.fromEntries(
    groupNames.map((groupName) => {
      const values = groups[groupName]
      const candidates = values.map((value, baselineOrder) => ({
        id: value.outfit.id,
        level: value.level,
        baselineOrder,
        evidence:
          evidenceByOutfitId.get(value.outfit.id) ??
          calculateDirectEvidence([], {
            tempOut: 0,
            tempBack: null,
            placeId: null,
            transportModeId: null,
          }),
        value,
      }))
      return [
        groupName,
        simulateDirectEvidenceGroup(
          candidates,
          variant,
          movementCap,
        ),
      ]
    }),
  ) as DirectEvidencePartitionSimulation<T>['groupDetails']
  const simulatedGroups: DirectEvidencePartitions<T> = {
    recentPurchases: details.recentPurchases.ordered.map(
      (result) => result.value,
    ),
    recommendations: details.recommendations.ordered.map(
      (result) => result.value,
    ),
    trialRecommendations: details.trialRecommendations.ordered.map(
      (result) => result.value,
    ),
  }

  return {
    variant,
    movementCap,
    groups: simulatedGroups,
    groupDetails: details,
    directlyMovedOutfitCount: groupNames.reduce(
      (sum, groupName) => sum + details[groupName].directlyMovedOutfitCount,
      0,
    ),
    totalChangedPositions: groupNames.reduce(
      (sum, groupName) => sum + details[groupName].totalChangedPositions,
      0,
    ),
    maximumIndividualMovement: Math.max(
      0,
      ...groupNames.map(
        (groupName) => details[groupName].maximumIndividualMovement,
      ),
    ),
    groupMembershipChanges: 0,
  }
}
