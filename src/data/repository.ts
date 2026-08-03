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
  OutfitPreviewUploadInput,
  ReplacementLineSnapshot,
  ReplacementLineEdge,
  ReplacementLineEdgeConfirmationInput,
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
  replaceOutfitPreview?(
    outfitId: string,
    input: OutfitPreviewUploadInput,
  ): Promise<void>
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
