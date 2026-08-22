export type ConditionChoice = 'no' | 'yes'
export type OutfitRating = 'favorite' | 'ok' | 'error' | null
export type ThermalFeeling = 'cold' | 'ok' | 'hot' | null
export type TemperatureSource = 'notion' | 'manual' | 'weather'
export type RecommendationLevel = 'high' | 'possible' | 'caution'
export type RecommendationEvidence = 'observed' | 'untried'
export type HvacMode = 'cooling' | 'heating' | 'off'
export type HvacIntensity = 'weak' | 'normal' | 'strong'
export type PlaceKind = 'specific_venue' | 'generic_category'
export type PlaceHvacProfileSource = 'manual' | 'wear_log_observation'

export interface ImageAsset {
  id: string
  storagePath: string
  url: string | null
  widthPx: number | null
  heightPx: number | null
  expiresAt: string | null
}

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
  currentQuantity?: number | null
  image?: ImageAsset | null
}

export interface PurchaseEvent {
  id: string
  itemId: string
  purchasedOn: string
  quantity: number
  createdAt: string
  updatedAt: string
}

export interface PurchaseEventCreateInput {
  id: string
  itemId: string
  purchasedOn: string
  quantity: number
  currentQuantity: number | null
}

export interface PurchaseEventUpdateInput {
  eventId: string
  purchasedOn: string
  quantity: number
  expectedUpdatedAt: string
}

export interface PurchaseEventDeleteInput {
  eventId: string
  expectedUpdatedAt: string
}

export interface CurrentQuantityUpdateInput {
  itemId: string
  currentQuantity: number | null
}

export type CareMethod = 'hand_wash' | 'dry_cleaning'

export interface CareEvent {
  id: string
  itemId: string
  caredOn: string
  method: CareMethod
  createdAt: string
  updatedAt: string
}

export interface CareEventCreateInput {
  id: string
  itemId: string
  caredOn: string
  method: CareMethod
}

export interface CareEventUpdateInput {
  eventId: string
  caredOn: string
  method: CareMethod
  expectedUpdatedAt: string
}

export interface CareEventDeleteInput {
  eventId: string
  expectedUpdatedAt: string
}

export interface Outfit {
  id: string
  displayName: string | null
  rating: OutfitRating
  archivedAt?: string | null
  itemIds: string[]
  itemPlacements?: OutfitItemPlacement[]
}

export interface SelectOption {
  id: string
  name: string
}

export interface Place extends SelectOption {
  kind: PlaceKind
}

export interface PlaceHvacProfile {
  workspaceId: string
  placeId: string
  season: 'Spring' | 'Summer' | 'Fall' | 'Winter'
  expectedMode: HvacMode
  expectedIntensity: HvacIntensity | null
  memo: string | null
  source: PlaceHvacProfileSource
  lastConfirmedOn: string
  createdAt: string
}

export interface PlaceHvacProfileInput {
  placeId: string
  season: PlaceHvacProfile['season']
  expectedMode: HvacMode
  expectedIntensity: HvacIntensity | null
  memo: string | null
  source: PlaceHvacProfileSource
  lastConfirmedOn: string
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
  observedHvacMode: HvacMode
  observedHvacIntensity: HvacIntensity | null
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
  observedHvacMode: HvacMode
  observedHvacIntensity: HvacIntensity | null
  memo: string | null
  temperatureSource: TemperatureSource
  weatherLocationId: string | null
  weatherIssuedAt: string | null
  weatherOverridden: boolean
  submissionToken: string
}

export type WearLogEditableField =
  | 'wornOn'
  | 'tempOut'
  | 'tempBack'
  | 'feelingOut'
  | 'feelingBack'
  | 'rainCondition'
  | 'longWalkCondition'
  | 'placeId'
  | 'transportModeId'
  | 'observedHvacMode'
  | 'observedHvacIntensity'
  | 'memo'

export type WearLogPatch = Partial<
  Pick<WearLogInput, WearLogEditableField | 'tempBackInferred'>
>

export interface AppData {
  items: Item[]
  outfits: Outfit[]
  wearLogs: WearLog[]
  places: Place[]
  placeHvacProfiles: PlaceHvacProfile[]
  transportModes: SelectOption[]
  weatherLocations?: WeatherLocation[]
}

export interface OutfitUpdateInput {
  displayName: string | null
  rating: Exclude<OutfitRating, null>
  items: OutfitItemWriteInput[]
  allowDuplicate: boolean
}

export interface ReplacementLineRecord {
  id: string
  name: string
  styleIdentity: string | null
  colorCategory: string | null
  reviewStatus: 'ready' | 'needs_review'
  lifecycleStatus: 'active' | 'archived'
  representativeLineId: string | null
  archivedAt: string | null
  updatedAt: string
}

export interface ReplacementLineCreateInput {
  name: string
  styleIdentity: string | null
  colorCategory: ReplacementLineColorCategory
}

export const COLOR_CATEGORIES = [
  'Black',
  'Charcoal',
  'Grey',
  'Silver',
  'Ivory',
  'Light blue',
  'Blue',
  'Navy',
  'Brown',
  'Beige',
  'Burgundy',
  'Red',
  'Pink',
  'Purple',
  'Lavender',
  'Green',
  'Khaki',
  'Yellow',
  'Orange',
] as const

export type ColorCategory = (typeof COLOR_CATEGORIES)[number]

// Keep the old export name while Line callers move to the shared category list.
export const REPLACEMENT_LINE_COLOR_CATEGORIES = COLOR_CATEGORIES

// These values may still exist in imported Line records, but are intentionally
// excluded from the current creation/editing menu.
export type LegacyReplacementLineColorCategory =
  | 'Denim'
  | 'Ivory'
  | 'Navy'
  | 'Cream'

export type ReplacementLineColorCategory =
  | ColorCategory
  | LegacyReplacementLineColorCategory

export interface ReplacementLineColorUpdateInput {
  lineId: string
  colorCategory: ReplacementLineColorCategory | null
  expectedUpdatedAt: string
}

export interface ReplacementLineReviewInput {
  lineId: string
  expectedUpdatedAt: string
}

export interface ReplacementLineDetailsUpdateInput {
  lineId: string
  name: string
  styleIdentity: string | null
  expectedUpdatedAt: string
}

export interface ReplacementLineDeleteInput {
  lineId: string
  expectedUpdatedAt: string
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

export const REPLACEMENT_LINE_DECISION_REASONS = [
  '대체 시도',
  '온도 세분화',
  '기능 세분화',
  '계승 👑',
] as const

export type ReplacementLineDecisionReason =
  (typeof REPLACEMENT_LINE_DECISION_REASONS)[number]

export const REPLACEMENT_LINE_DECISION_REASON_OPTIONS = [
  { value: '대체 시도', label: '대체 시도' },
  { value: '온도 세분화', label: '온도 세분화' },
  { value: '기능 세분화', label: '기능 세분화' },
  { value: '계승 👑', label: '계승 👑' },
] as const satisfies readonly {
  value: ReplacementLineDecisionReason
  label: string
}[]

export function replacementLineDecisionReasonLabel(reason: string) {
  const option = REPLACEMENT_LINE_DECISION_REASON_OPTIONS.find(
    (candidate) => candidate.value === reason,
  )
  if (option) return option.label
  return reason
}

export interface ReplacementLineEdgeConnectionUpdateInput {
  expectedUpdatedAt: string
  predecessorItemId: string
  branchName: string | null
  decisionReason: ReplacementLineDecisionReason
}

export interface ReplacementLineEdgeDisconnectInput {
  expectedUpdatedAt: string
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
  decisionReason: ReplacementLineDecisionReason
}

export interface ReplacementLineItemMoveInput {
  sourceLineId: string
  itemId: string
  targetLineId: string | null
  newLineName: string | null
  newLineStyleIdentity: string | null
  expectedSourceUpdatedAt: string
  expectedTargetUpdatedAt: string | null
}

export interface ReplacementLineItemAddInput {
  lineId: string
  itemId: string
  expectedUpdatedAt: string
}

export interface ReplacementLineItemRemoveInput {
  sourceLineId: string
  itemId: string
  expectedSourceUpdatedAt: string
}

export interface ReplacementLineMergeInput {
  sourceLineId: string
  targetLineId: string
  expectedSourceUpdatedAt: string
  expectedTargetUpdatedAt: string
}

export interface ReplacementLineArchiveInput {
  lineId: string
  archived: boolean
  expectedUpdatedAt: string
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
  contextEvidence: import('./context-evidence').RecommendationContextEvidence
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
}

export const recommendationLabels: Record<RecommendationLevel, string> = {
  high: '추천 높음',
  possible: '추천 가능',
  caution: '주의',
}
