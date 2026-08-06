import type {
  RecommendationInput,
  ThermalFeeling,
  WearLog,
} from './types'

export const DEFAULT_CONTEXT_EVIDENCE_THRESHOLD = 2

export type ContextEvidenceTier = 'exact' | 'place' | 'none'

export interface ContextEvidenceBucket {
  enabled: boolean
  matchedWearLogIds: string[]
  exposureCount: number
  successCount: number
  issueCount: number
  unknownCount: number
  coldCount: number
  hotCount: number
}

export interface RecommendationContextEvidence {
  threshold: number
  currentPlaceId: string | null
  currentTransportModeId: string | null
  exact: ContextEvidenceBucket
  placeOnly: ContextEvidenceBucket
  activeTier: ContextEvidenceTier
}

interface ContextEvidenceOptions {
  threshold?: number
}

function distinctWearLogs(logs: readonly WearLog[]) {
  const byId = new Map<string, WearLog>()
  for (const log of logs) {
    if (!byId.has(log.id)) byId.set(log.id, log)
  }
  return [...byId.values()]
}

function hasFeeling(
  feelings: ThermalFeeling[],
  feeling: Exclude<ThermalFeeling, null>,
) {
  return feelings.includes(feeling)
}

function bucket(enabled: boolean, logs: readonly WearLog[]): ContextEvidenceBucket {
  if (!enabled) {
    return {
      enabled: false,
      matchedWearLogIds: [],
      exposureCount: 0,
      successCount: 0,
      issueCount: 0,
      unknownCount: 0,
      coldCount: 0,
      hotCount: 0,
    }
  }

  let successCount = 0
  let issueCount = 0
  let unknownCount = 0
  let coldCount = 0
  let hotCount = 0

  for (const log of logs) {
    const feelings = [log.feelingOut, log.feelingBack]
    const cold = hasFeeling(feelings, 'cold')
    const hot = hasFeeling(feelings, 'hot')
    const issue = cold || hot

    if (cold) coldCount += 1
    if (hot) hotCount += 1
    if (issue) {
      issueCount += 1
    } else if (hasFeeling(feelings, 'ok')) {
      successCount += 1
    } else {
      unknownCount += 1
    }
  }

  return {
    enabled: true,
    matchedWearLogIds: logs
      .map((log) => log.id)
      .sort((left, right) => left.localeCompare(right)),
    exposureCount: logs.length,
    successCount,
    issueCount,
    unknownCount,
    coldCount,
    hotCount,
  }
}

export function activeContextEvidenceBucket(
  evidence: RecommendationContextEvidence,
): ContextEvidenceBucket | null {
  if (evidence.activeTier === 'exact') return evidence.exact
  if (evidence.activeTier === 'place') return evidence.placeOnly
  return null
}

export function calculateContextEvidence(
  logs: readonly WearLog[],
  input: Pick<RecommendationInput, 'placeId' | 'transportModeId'>,
  options: ContextEvidenceOptions = {},
): RecommendationContextEvidence {
  const threshold = options.threshold ?? DEFAULT_CONTEXT_EVIDENCE_THRESHOLD
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error('Context evidence threshold must be a positive integer.')
  }

  const distinctLogs = distinctWearLogs(logs)
  const placeEnabled = input.placeId !== null
  const placeLogs = placeEnabled
    ? distinctLogs.filter((log) => log.placeId === input.placeId)
    : []
  const exactEnabled = placeEnabled && input.transportModeId !== null
  const exactLogs = exactEnabled
    ? placeLogs.filter(
        (log) =>
          log.transportModeId !== null &&
          log.transportModeId === input.transportModeId,
      )
    : []
  const exactIds = new Set(exactLogs.map((log) => log.id))
  const placeOnlyLogs = placeLogs.filter((log) => !exactIds.has(log.id))

  const exact = bucket(exactEnabled, exactLogs)
  const placeOnly = bucket(placeEnabled, placeOnlyLogs)
  const activeTier: ContextEvidenceTier =
    exact.exposureCount >= threshold
      ? 'exact'
      : placeOnly.exposureCount >= threshold
        ? 'place'
        : 'none'

  return {
    threshold,
    currentPlaceId: input.placeId,
    currentTransportModeId: input.transportModeId,
    exact,
    placeOnly,
    activeTier,
  }
}

