import type {
  ConditionChoice,
  RecommendationInput,
  RecommendationResult,
} from './types'

export interface WeatherRecommendationProvenance {
  locationId: string
  issuedAt: string
  tempOut: number
  tempBack: number | null
  rainCondition: ConditionChoice
  overridden: boolean
}

export interface RecommendationNavigationState {
  recommendation?: RecommendationResult
  input?: RecommendationInput
  weather?: WeatherRecommendationProvenance
}
