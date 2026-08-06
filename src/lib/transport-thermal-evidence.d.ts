import type {
  ConditionChoice,
  ThermalFeeling,
  WearLog,
} from './types'

export const TRANSPORT_THERMAL_RANGE_PADDING_C: 2

export interface TransportThermalObservation {
  id: string
  wearLogId: string
  endpoint: 'out' | 'back'
  temperature: number
  feeling: Exclude<ThermalFeeling, null>
  transportModeId: string | null
  placeId: string | null
  wornOn: string
  inferredReturn: boolean
}

export interface TransportThermalSummary {
  observations: TransportThermalObservation[]
  rawOkTemperatures: number[]
  rawOkMinimum: number | null
  rawOkMaximum: number | null
  rawOkRange: { min: number; max: number } | null
  expandedOkRange: { min: number; max: number } | null
  coldObservations: TransportThermalObservation[]
  hotObservations: TransportThermalObservation[]
  coldObservationTemperatures: number[]
  hotObservationTemperatures: number[]
  matchedWearLogIds: string[]
  observationCount: number
  distinctWearLogCount: number
  latestMatchedWornOn: string | null
  inferredReturnEndpointCount: number
  targetWithinRange: boolean
  sourcePlaceIds: string[]
  sourceTransportIds: string[]
}

export interface TransportWarningEvidence {
  overall: boolean
  currentTransport: boolean
  otherTransport: boolean
  nullTransport: boolean
  overallSourceWearLogIds: string[]
  currentTransportSourceWearLogIds: string[]
  otherTransportSourceWearLogIds: string[]
  nullTransportSourceWearLogIds: string[]
  onlyOtherTransport: boolean
}

export interface TransportThermalInput {
  outfitId: string
  tempOut: number
  tempBack: number | null
  transportModeId: string | null
  placeId: string | null
  longWalkCondition?: ConditionChoice
}

export interface TransportThermalEvidence {
  outfitId: string
  currentTransportModeId: string | null
  includeInferredReturnObservations: boolean
  targetTemp: number
  overall: TransportThermalSummary
  currentTransport: TransportThermalSummary | null
  currentPlace: TransportThermalSummary | null
  exactContext: TransportThermalSummary | null
  otherTransports: Array<{
    transportModeId: string
    evidence: TransportThermalSummary
  }>
  nullTransport: TransportThermalSummary
  targetWithinOverallOkRange: boolean
  targetWithinCurrentTransportOkRange: boolean | null
  overallSupportOnlyFromOtherTransport: boolean
  overallHighEndpointBorrowedFromOtherTransport: boolean
  overallLowEndpointBorrowedFromOtherTransport: boolean
  coldWarningSupportedByCurrentTransport: boolean
  hotWarningSupportedByCurrentTransport: boolean
  warningWouldComeOnlyFromOtherTransport: boolean
  warnings: {
    cold: TransportWarningEvidence
    hot: TransportWarningEvidence
  }
}

export function transportThermalObservations(
  logs: readonly WearLog[],
  options?: { includeInferredReturnObservations?: boolean },
): TransportThermalObservation[]

export function calculateTransportThermalEvidence(
  logs: readonly WearLog[],
  input: TransportThermalInput,
  options?: { includeInferredReturnObservations?: boolean },
): TransportThermalEvidence

export function calculateTransportThermalSensitivity(
  logs: readonly WearLog[],
  input: TransportThermalInput,
): {
  baselineCompatible: TransportThermalEvidence
  higherConfidence: TransportThermalEvidence
}
