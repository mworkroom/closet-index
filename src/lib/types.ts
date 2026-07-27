export type ConditionChoice = 'no' | 'yes' | 'unknown'
export type OutfitRating = 'favorite' | 'ok' | 'error' | null
export type ThermalFeeling = 'cold' | 'ok' | 'hot' | null
export type RecommendationLevel = 'high' | 'possible' | 'caution'
export type RecommendationEvidence = 'observed' | 'untried'

export interface ImageAsset {
  id: string
  storagePath: string
  url: string
  widthPx: number | null
  heightPx: number | null
  expiresAt: string | null
}

export interface OutfitPreview extends ImageAsset {
  compositionVersion: number
}

export interface OutfitItemPlacement {
  itemId: string
  slot: string | null
  positionX: number
  positionY: number
  itemScale: number | null
  zIndex: number | null
}

export interface OutfitItemPositionInput {
  outfitId: string
  itemId: string
  positionX: number
  positionY: number
  itemScale: number
}

export interface Item {
  id: string
  name: string
  category: string
  semanticColor: string | null
  displayHex: string
  seasons: string[]
  retired: boolean
  rainOk: boolean
  longWalkOk: boolean
  memo: string | null
  acquiredOn: string | null
  image?: ImageAsset | null
}

export interface Outfit {
  id: string
  displayName: string | null
  rating: OutfitRating
  itemIds: string[]
  itemPlacements?: OutfitItemPlacement[]
  preview?: OutfitPreview | null
}

export interface SelectOption {
  id: string
  name: string
}

export interface WearLog {
  id: string
  outfitId: string
  wornOn: string
  tempOut: number | null
  tempBack: number | null
  tempBackInferred: boolean
  feelingOut: ThermalFeeling
  feelingBack: ThermalFeeling
  rainCondition: ConditionChoice
  longWalkCondition: ConditionChoice
  placeId: string | null
  transportModeId: string | null
  memo: string | null
  submissionToken: string
  createdAt: string
}

export interface WearLogInput {
  outfitId: string
  wornOn: string
  tempOut: number | null
  tempBack: number | null
  tempBackInferred: boolean
  feelingOut: ThermalFeeling
  feelingBack: ThermalFeeling
  rainCondition: ConditionChoice
  longWalkCondition: ConditionChoice
  placeId: string | null
  transportModeId: string | null
  memo: string | null
  submissionToken: string
}

export interface AppData {
  items: Item[]
  outfits: Outfit[]
  wearLogs: WearLog[]
  places: SelectOption[]
  transportModes: SelectOption[]
}

export interface RecommendationInput {
  tempOut: number
  tempBack: number | null
  rainCondition: ConditionChoice
  longWalkCondition: ConditionChoice
  placeId: string | null
  transportModeId: string | null
}

export type SimilarityConfidence = 'medium' | 'low'

export interface SimilarOutfitMatch {
  outfitId: string
  sharedItemCount: number
  targetItemCount: number
  weightedSimilarity: number
  sharedItemNames: string[]
  changedItemNames: string[]
  wearCount: number
  lastWornOn: string | null
  okRange: { min: number; max: number } | null
  okObservationCount: number
}

export interface SimilarOutfitEvidence {
  confidence: SimilarityConfidence
  knownItemCount: number
  totalItemCount: number
  matches: SimilarOutfitMatch[]
}

export interface RecommendationResult {
  outfit: Outfit
  level: RecommendationLevel
  evidence: RecommendationEvidence
  similarEvidence: SimilarOutfitEvidence | null
  reasons: string[]
  warnings: string[]
  okRange: { min: number; max: number } | null
  okObservationCount: number
  targetTemp: number
  wearCount: number
  lastWornOn: string | null
  latestAcquiredOn: string | null
  latestAcquiredItemNames: string[]
}

export const ratingLabels: Record<Exclude<OutfitRating, null>, string> = {
  favorite: 'Favorite',
  ok: 'OK',
  error: 'Error',
}

export const feelingLabels: Record<Exclude<ThermalFeeling, null>, string> = {
  cold: '추움',
  ok: 'OK',
  hot: '더움',
}

export const conditionLabels: Record<ConditionChoice, string> = {
  no: '해당 없음',
  yes: '해당',
  unknown: '미지정',
}

export const recommendationLabels: Record<RecommendationLevel, string> = {
  high: '추천 높음',
  possible: '추천 가능',
  caution: '주의',
}
