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
  OutfitItemPlacementInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocation,
  WeatherLocationInput,
  WearLog,
  WearLogInput,
} from '../lib/types'

export interface ClosetRepository {
  load(): Promise<AppData>
  createItem(input: ItemCreateInput): Promise<Item>
  updateItem(itemId: string, input: ItemWriteInput): Promise<Item>
  replaceItemImage(
    itemId: string,
    input: ItemImageUploadInput,
  ): Promise<void>
  setItemRetired(itemId: string, retired: boolean): Promise<void>
  updateItemSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ): Promise<void>
  findMatchingOutfits(itemIds: string[]): Promise<MatchingOutfit[]>
  createOutfit(input: OutfitCreateInput): Promise<Outfit>
  cloneOutfit(input: OutfitCloneInput): Promise<Outfit>
  setOutfitArchived(outfitId: string, archived: boolean): Promise<void>
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
