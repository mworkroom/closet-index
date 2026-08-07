import type { RecommendationLevel, WearLog } from './types'

export type TestTransportBucket =
  | 'walk_short'
  | 'walk_sustained'
  | 'walk_unclassified'
  | 'car'
  | 'other'

export type WalkReviewDecision =
  | 'walk_short'
  | 'walk_sustained'
  | 'ambiguous'
  | 'not relevant'

export const TEST_TRANSPORT_BUCKETS: Readonly<{
  walkShort: 'walk_short'
  walkSustained: 'walk_sustained'
  walkUnclassified: 'walk_unclassified'
  car: 'car'
  other: 'other'
}>

export interface TransportTaxonomyCandidate {
  id: string
  level: RecommendationLevel
  baselineOrder: number
  logs: WearLog[]
  warnings?: string[]
}

export interface TransportTaxonomyCandidateReport {
  id: string
  rankAdjustment: number
  directlyAdjusted: boolean
  status: string
  confidence: string
  currentTransportDistinctWearLogCount: number
  exactContextDistinctWearLogCount: number
  overallRange: { min: number; max: number } | null
  currentTransportRange: { min: number; max: number } | null
  borrowedOnly: boolean
  inferredReturnAffected: boolean
  matchedWearLogIds: {
    overall: string[]
    currentTransport: string[]
    exactContext: string[]
  }
}

export interface TransportTaxonomyModelReport {
  topSixOrder: string[]
  fullOrder: string[]
  directlyAdjustedOutfitCount: number
  candidates: TransportTaxonomyCandidateReport[]
}

export function remapLogsToTestTransportTaxonomy(
  logs: readonly WearLog[],
  options: {
    historicalWalkModeId: string
    carModeId: string
    walkClassificationByWearLogId?: Record<string, WalkReviewDecision>
  },
): WearLog[]

export function compareTransportTaxonomyModels(options: {
  candidates: readonly TransportTaxonomyCandidate[]
  input: {
    tempOut: number
    tempBack: number | null
    placeId: string | null
    transportModeId: string | null
  }
  splitTransportModeId: TestTransportBucket | null
  historicalWalkModeId: string
  carModeId: string
  walkClassificationByWearLogId?: Record<string, WalkReviewDecision>
}): {
  model0: TransportTaxonomyModelReport
  model1: TransportTaxonomyModelReport
  model2: TransportTaxonomyModelReport
}
