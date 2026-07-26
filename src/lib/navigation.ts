import type { RecommendationInput, RecommendationResult } from './types'

export interface RecommendationNavigationState {
  recommendation?: RecommendationResult
  input?: RecommendationInput
}
