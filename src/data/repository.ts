import type {
  AppData,
  Item,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  MatchingOutfit,
  Outfit,
  OutfitCloneInput,
  OutfitCreateInput,
  OutfitUpdateInput,
  OutfitItemPlacementInput,
  ReplacementLineSnapshot,
  ReplacementLineEdge,
  ReplacementLineEdgeConfirmationInput,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDetailsUpdateInput,
  ReplacementLineEdgeDisconnectInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineItemMoveInput,
  ReplacementLineArchiveInput,
  ReplacementLineColorUpdateInput,
  ReplacementLineDeleteInput,
  ReplacementLineDetailsUpdateInput,
  ReplacementLineMergeInput,
  ReplacementLineRecord,
  ReplacementLineReviewInput,
  ReplacementLineStart,
  ReplacementLegacyLink,
  ReplacementLegacyLinkReviewInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocation,
  WeatherLocationInput,
  WearLog,
  WearLogInput,
} from '../lib/types'

export interface ClosetRepository {
  load(): Promise<AppData>
  loadReplacementLines?(): Promise<ReplacementLineSnapshot>
  loadReplacementLegacyLinks?(): Promise<ReplacementLegacyLink[]>
  reviewReplacementLegacyLink?(
    linkId: string,
    input: ReplacementLegacyLinkReviewInput,
  ): Promise<ReplacementLegacyLink>
  loadReplacementLineEdges?(): Promise<ReplacementLineEdge[]>
  confirmReplacementLineEdges?(
    inputs: ReplacementLineEdgeConfirmationInput[],
  ): Promise<ReplacementLineEdge[]>
  updateReplacementLineEdgeDetails?(
    edgeId: string,
    input: ReplacementLineEdgeDetailsUpdateInput,
  ): Promise<ReplacementLineEdge>
  updateReplacementLineEdgeConnection?(
    edgeId: string,
    input: ReplacementLineEdgeConnectionUpdateInput,
  ): Promise<ReplacementLineEdge>
  disconnectReplacementLineEdge?(
    edgeId: string,
    input: ReplacementLineEdgeDisconnectInput,
  ): Promise<boolean>
  reverseReplacementLineEdge?(
    edgeId: string,
    input: ReplacementLineEdgeDirectionUpdateInput,
  ): Promise<ReplacementLineEdge>
  loadReplacementLineStarts?(): Promise<ReplacementLineStart[]>
  setReplacementLineStart?(
    replacementLineId: string,
    itemId: string,
    isStart: boolean,
  ): Promise<boolean>
  createReplacementLineManualEdge?(
    input: ReplacementLineManualEdgeInput,
  ): Promise<ReplacementLineEdge>
  moveReplacementLineItem?(
    input: ReplacementLineItemMoveInput,
  ): Promise<ReplacementLineRecord>
  mergeReplacementLines?(
    input: ReplacementLineMergeInput,
  ): Promise<ReplacementLineRecord>
  setReplacementLineArchived?(
    input: ReplacementLineArchiveInput,
  ): Promise<ReplacementLineRecord>
  setReplacementLineColorCategory?(
    input: ReplacementLineColorUpdateInput,
  ): Promise<ReplacementLineRecord>
  acknowledgeReplacementLineReview?(
    input: ReplacementLineReviewInput,
  ): Promise<ReplacementLineRecord>
  updateReplacementLineDetails?(
    input: ReplacementLineDetailsUpdateInput,
  ): Promise<ReplacementLineRecord>
  deleteEmptyReplacementLine?(
    input: ReplacementLineDeleteInput,
  ): Promise<boolean>
  createItem(input: ItemCreateInput): Promise<Item>
  updateItem(itemId: string, input: ItemWriteInput): Promise<Item>
  replaceItemImage(
    itemId: string,
    input: ItemImageUploadInput,
  ): Promise<void>
  setItemRetired(itemId: string, retired: boolean): Promise<void>
  deleteItem(itemId: string): Promise<void>
  updateItemSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ): Promise<void>
  findMatchingOutfits(itemIds: string[]): Promise<MatchingOutfit[]>
  createOutfit(input: OutfitCreateInput): Promise<Outfit>
  updateOutfit(outfitId: string, input: OutfitUpdateInput): Promise<Outfit>
  cloneOutfit(input: OutfitCloneInput): Promise<Outfit>
  setOutfitArchived(outfitId: string, archived: boolean): Promise<void>
  deleteOutfit(outfitId: string): Promise<void>
  updateOutfitItemPlacement(input: OutfitItemPlacementInput): Promise<void>
  saveDefaultWeatherLocation(
    input: WeatherLocationInput,
  ): Promise<WeatherLocation>
  fetchWeatherForecast(
    input: WeatherForecastRequest,
  ): Promise<WeatherForecastResponse>
  createWearLog(input: WearLogInput): Promise<WearLog>
  updateWearLog(id: string, input: WearLogInput): Promise<WearLog>
  deleteWearLog(id: string): Promise<void>
}
