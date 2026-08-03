export type ConditionChoice = 'no' | 'yes' | 'unknown'
export type OutfitRating = 'favorite' | 'ok' | 'error' | null
export type ThermalFeeling = 'cold' | 'ok' | 'hot' | null
export type TemperatureSource = 'notion' | 'manual' | 'weather'
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
  sourceFingerprint: string | null
}

export type OutfitPreviewState =
  | 'missing'
  | 'pending'
  | 'ready'
  | 'stale'
  | 'error'

export interface OutfitItemPlacement {
  itemId: string
  slot: string | null
  positionX: number | null
  positionY: number | null
  itemScale: number | null
  zIndex: number | null
}

export interface OutfitItemPlacementInput {
  outfitId: string
  itemId: string
  slot: string | null
  positionX: number
  positionY: number
  itemScale: number
  zIndex: number | null
}

export interface ItemWriteInput {
  name: string
  category: string
  semanticColor: string | null
  paletteId: string | null
  displayHex: string
  seasons: string[]
  rainOk: boolean
  longWalkOk: boolean
  memo: string | null
  acquiredOn: string | null
}

export interface ItemCreateInput extends ItemWriteInput {
  id: string
}

export interface ItemImageUploadInput {
  blob: Blob
  widthPx: number
  heightPx: number
  bytes: number
}

export interface OutfitPreviewUploadInput {
  blob: Blob
  widthPx: number
  heightPx: number
  bytes: number
  sourceFingerprint: string
}

export interface OutfitItemWriteInput {
  itemId: string
  slot: string | null
  sortOrder: number
  positionX: number | null
  positionY: number | null
  itemScale: number | null
  zIndex: number | null
}

export interface OutfitCreateInput {
  id: string
  displayName: string | null
  items: OutfitItemWriteInput[]
  allowDuplicate: boolean
}

export interface OutfitCloneInput {
  id: string
  sourceOutfitId: string
  displayName: string | null
}

export interface MatchingOutfit {
  id: string
  displayName: string | null
  rating: OutfitRating
  archivedAt: string | null
}

export interface Item {
  id: string
  name: string
  category: string
  semanticColor: string | null
  paletteName?: string | null
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
  archivedAt?: string | null
  itemIds: string[]
  itemPlacements?: OutfitItemPlacement[]
  preview?: OutfitPreview | null
  previewState?: OutfitPreviewState
}

export interface SelectOption {
  id: string
  name: string
}

export interface WeatherLocation {
  id: string
  label: string
  officialName: string | null
  adminCode: string | null
  nx: number
  ny: number
  isDefault: boolean
}

export interface WeatherLocationInput {
  id?: string
  label: string
  officialName: string | null
  adminCode: string | null
  nx: number
  ny: number
}

export type WeatherPrecipitationType =
  | 'none'
  | 'rain'
  | 'rain-snow'
  | 'snow'
  | 'shower'
  | 'unknown'

export type WeatherSkyCondition =
  | 'clear'
  | 'mostly-cloudy'
  | 'cloudy'
  | 'unknown'

export interface WeatherAmount {
  value: number | null
  label: string | null
  hasAmount: boolean
}

export interface WeatherForecastPoint {
  at: string
  temperature: number | null
  humidity: number | null
  precipitationProbability: number | null
  precipitationType: WeatherPrecipitationType
  precipitationAmount: WeatherAmount
  snowAmount: WeatherAmount
  sky: WeatherSkyCondition
  windSpeed: number | null
  hasPrecipitation: boolean
  missingCategories: string[]
}

export interface WeatherForecastRequest {
  locationId: string
  forecastDate: string
  departureTime: string
  returnTime: string
}

export interface WeatherForecastResponse {
  source: 'kma-vilage-fcst'
  issuedAt: string
  fetchedAt: string
  nx: number
  ny: number
  location: {
    id: string
    label: string
  }
  departure: WeatherForecastPoint
  return: WeatherForecastPoint
  period: {
    hasPrecipitation: boolean
    precipitationTypes: WeatherPrecipitationType[]
    maxPrecipitationProbability: number | null
    minHumidity: number | null
    maxHumidity: number | null
  }
  stale: false
  warnings: string[]
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
  temperatureSource: TemperatureSource
  weatherLocationId: string | null
  weatherIssuedAt: string | null
  weatherOverridden: boolean
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
  temperatureSource: TemperatureSource
  weatherLocationId: string | null
  weatherIssuedAt: string | null
  weatherOverridden: boolean
  submissionToken: string
}

export interface AppData {
  items: Item[]
  outfits: Outfit[]
  wearLogs: WearLog[]
  places: SelectOption[]
  transportModes: SelectOption[]
  weatherLocations?: WeatherLocation[]
}

export interface OutfitUpdateInput {
  displayName: string | null
  items: OutfitItemWriteInput[]
  allowDuplicate: boolean
}

export interface ReplacementLineRecord {
  id: string
  name: string
  styleIdentity: string | null
}

export interface ReplacementLineMembership {
  replacementLineId: string
  itemId: string
}

export interface ReplacementLineSnapshot {
  lines: ReplacementLineRecord[]
  memberships: ReplacementLineMembership[]
}

export type ReplacementLegacyLinkDecision =
  | 'a_to_b'
  | 'b_to_a'
  | 'parallel'
  | 'not_replacement'

export interface ReplacementLegacyLink {
  id: string
  itemAId: string
  itemBId: string
  reviewStatus: 'pending' | 'reviewed'
  reviewDecision: ReplacementLegacyLinkDecision | null
  reviewReason: string | null
  reviewedAt: string | null
  updatedAt: string
}

export interface ReplacementLegacyLinkReviewInput {
  decision: ReplacementLegacyLinkDecision
  reason: string
  expectedUpdatedAt: string
}

export interface ReplacementLineEdge {
  id: string
  replacementLineId: string
  predecessorItemId: string
  successorItemId: string
  sourceLegacyLinkId: string | null
  sourceKind: 'legacy_link' | 'manual'
  branchName: string | null
  decisionReason: string
  status: 'confirmed' | 'needs_review' | 'archived'
  confirmedAt: string
  updatedAt: string
}

export interface ReplacementLineEdgeConfirmationInput {
  replacementLineId: string
  sourceLegacyLinkId: string
  expectedLegacyUpdatedAt: string
  branchName: string | null
  decisionReason: string
}

export interface ReplacementLineEdgeDetailsUpdateInput {
  expectedUpdatedAt: string
  branchName: string | null
  decisionReason: string
}

export interface ReplacementLineEdgeDirectionUpdateInput {
  expectedUpdatedAt: string
}

export interface ReplacementLineStart {
  replacementLineId: string
  itemId: string
  designatedAt: string
}

export interface ReplacementLineManualEdgeInput {
  replacementLineId: string
  predecessorItemId: string
  successorItemId: string
  branchName: string | null
  decisionReason: string
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

export interface ItemTemperatureEvidence {
  itemId: string
  itemName: string
  category: string
  wearCount: number
  lastWornOn: string | null
  okRange: { min: number; max: number }
  okObservationCount: number
}

export interface SimilarOutfitEvidence {
  confidence: SimilarityConfidence
  knownItemCount: number
  totalItemCount: number
  supportedCoreItemCount: number
  totalCoreItemCount: number
  itemEvidence: ItemTemperatureEvidence[]
  aggregateOkRange: { min: number; max: number } | null
  aggregateOkObservationCount: number
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
