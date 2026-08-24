import type {
  AppData,
  Item,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  MatchingOutfit,
  Outfit,
  OutfitCreateInput,
  OutfitUpdateInput,
  PlaceHvacProfile,
  PlaceHvacProfileInput,
  OutfitItemPlacementInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocation,
  WeatherLocationInput,
  WearLogPatch,
  WearLog,
  WearLogInput,
} from '../lib/types'
import type { ReplacementLineRepository } from './replacement-line-repository'
import type { PurchaseRepository } from './purchase-repository'
import type { CareRepository } from './care-repository'

export interface ClosetSnapshotRepository {
  load(): Promise<AppData>
}

export interface ItemImageAssetRepository {
  downloadItemImages?(storagePaths: string[]): Promise<Map<string, Blob>>
}

export interface ItemCommandRepository {
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
}

export interface OutfitCommandRepository {
  findMatchingOutfits(itemIds: string[]): Promise<MatchingOutfit[]>
  createOutfit(input: OutfitCreateInput): Promise<Outfit>
  updateOutfit(outfitId: string, input: OutfitUpdateInput): Promise<Outfit>
  setOutfitArchived(outfitId: string, archived: boolean): Promise<void>
  deleteOutfit(outfitId: string): Promise<void>
  updateOutfitItemPlacement(input: OutfitItemPlacementInput): Promise<void>
}

export interface WeatherRepository {
  saveDefaultWeatherLocation(
    input: WeatherLocationInput,
  ): Promise<WeatherLocation>
  fetchWeatherForecast(
    input: WeatherForecastRequest,
  ): Promise<WeatherForecastResponse>
}

export interface PlaceHvacProfileCommandRepository {
  savePlaceHvacProfile(input: PlaceHvacProfileInput): Promise<PlaceHvacProfile>
}

export interface WearLogCommandRepository {
  createWearLog(input: WearLogInput): Promise<WearLog>
  updateWearLog(id: string, input: WearLogInput): Promise<WearLog>
  updateWearLogFields(id: string, patch: WearLogPatch): Promise<WearLog>
  deleteWearLog(id: string): Promise<void>
}

export interface ClosetRelatedRepositories {
  readonly replacementLines: ReplacementLineRepository
  readonly purchases: PurchaseRepository
  readonly care: CareRepository
}

export interface ClosetActionRepository
  extends ItemCommandRepository,
    OutfitCommandRepository,
    WeatherRepository,
    PlaceHvacProfileCommandRepository,
    WearLogCommandRepository,
    ClosetRelatedRepositories {}

export interface ClosetDataProviderRepository
  extends ClosetSnapshotRepository,
    ItemImageAssetRepository,
    ClosetActionRepository {}

export interface ClosetRepository extends ClosetDataProviderRepository {}
