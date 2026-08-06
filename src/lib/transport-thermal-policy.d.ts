import type { RecommendationLevel } from './types'
import type {
  TransportThermalEvidence,
  TransportThermalInput,
} from './transport-thermal-evidence'

export type TransportThermalPolicy =
  | 'report-only'
  | 'weak-1-strong-2'
  | 'minimum-2'
  | 'exact-context-only'

export type TransportThermalPolicyStatus =
  | 'unknown'
  | 'current-warning'
  | 'exact-warning'
  | 'supported'
  | 'borrowed-only'
  | 'unsupported'

export interface TransportThermalPolicyDecision {
  policy: TransportThermalPolicy
  status: TransportThermalPolicyStatus
  confidence:
    | 'report-only'
    | 'unknown'
    | 'informational'
    | 'transport-weak'
    | 'transport-strong'
    | 'exact-strong'
  rankAdjustment: number
  affected: boolean
}

export interface TransportThermalSimulationCandidate {
  id: string
  level: RecommendationLevel
  baselineOrder: number
  evidence: TransportThermalEvidence
  warnings?: string[]
}

export const TRANSPORT_THERMAL_POLICIES: readonly TransportThermalPolicy[]

export function evaluateTransportThermalPolicy(
  policy: TransportThermalPolicy,
  evidence: TransportThermalEvidence,
  input: TransportThermalInput,
): TransportThermalPolicyDecision

export function simulateTransportThermalPolicy(
  policy: TransportThermalPolicy,
  candidates: readonly TransportThermalSimulationCandidate[],
  input: TransportThermalInput,
): Array<TransportThermalSimulationCandidate & {
  warnings: string[]
  policyDecision: TransportThermalPolicyDecision
}>
