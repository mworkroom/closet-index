import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  OutfitCreateInput,
  OutfitUpdateInput,
  OutfitItemPlacementInput,
  PlaceHvacProfileInput,
  WeatherForecastRequest,
  WeatherLocationInput,
  WearLogPatch,
  WearLogInput,
} from '../lib/types'
import type { ClosetRepository } from './repository'
import { SupabaseItemRepository } from './supabase/items'
import { downloadItemImageBlobs } from './image-assets'
import { SupabaseOutfitRepository } from './supabase/outfits'
import { collectAllPages } from './supabase/shared'
import { SupabaseSnapshotRepository } from './supabase/snapshot'
import {
  SupabaseWeatherRepository,
  WeatherForecastRequestError,
} from './supabase/weather'
import { SupabaseWearLogRepository } from './supabase/wear-logs'
import { SupabaseReplacementLineRepository } from './supabase/replacement-lines'
import { SupabasePurchaseRepository } from './supabase/purchases'
import { SupabaseCareRepository } from './supabase/care'
import { SupabasePlaceHvacProfileRepository } from './supabase/place-hvac-profiles'

export { collectAllPages, WeatherForecastRequestError }

export class SupabaseRepository implements ClosetRepository {
  private readonly snapshot: SupabaseSnapshotRepository
  private readonly items: SupabaseItemRepository
  private readonly outfits: SupabaseOutfitRepository
  private readonly weather: SupabaseWeatherRepository
  private readonly wearLogs: SupabaseWearLogRepository
  private readonly placeHvacProfiles: SupabasePlaceHvacProfileRepository
  readonly replacementLines: SupabaseReplacementLineRepository
  readonly purchases: SupabasePurchaseRepository
  readonly care: SupabaseCareRepository

  constructor(
    private readonly client: SupabaseClient,
    workspaceId: string,
  ) {
    this.snapshot = new SupabaseSnapshotRepository(client, workspaceId)
    this.items = new SupabaseItemRepository(client, workspaceId)
    this.outfits = new SupabaseOutfitRepository(client, workspaceId)
    this.weather = new SupabaseWeatherRepository(client, workspaceId)
    this.wearLogs = new SupabaseWearLogRepository(client, workspaceId)
    this.placeHvacProfiles = new SupabasePlaceHvacProfileRepository(
      client,
      workspaceId,
    )
    this.replacementLines = new SupabaseReplacementLineRepository(
      client,
      workspaceId,
    )
    this.purchases = new SupabasePurchaseRepository(client, workspaceId)
    this.care = new SupabaseCareRepository(client, workspaceId)
  }

  load(): Promise<AppData> {
    return this.snapshot.load()
  }

  downloadItemImages(storagePaths: string[]) {
    return downloadItemImageBlobs(this.client, storagePaths)
  }

  createItem(input: ItemCreateInput) {
    return this.items.create(input)
  }

  updateItem(itemId: string, input: ItemWriteInput) {
    return this.items.update(itemId, input)
  }

  replaceItemImage(itemId: string, input: ItemImageUploadInput) {
    return this.items.replaceImage(itemId, input)
  }

  setItemRetired(itemId: string, retired: boolean) {
    return this.items.setRetired(itemId, retired)
  }

  deleteItem(itemId: string) {
    return this.items.delete(itemId)
  }

  updateItemSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) {
    return this.items.updateSuitability(itemId, rainOk, longWalkOk)
  }

  findMatchingOutfits(itemIds: string[]) {
    return this.outfits.findMatching(itemIds)
  }

  createOutfit(input: OutfitCreateInput) {
    return this.outfits.create(input)
  }

  updateOutfit(outfitId: string, input: OutfitUpdateInput) {
    return this.outfits.update(outfitId, input)
  }

  setOutfitArchived(outfitId: string, archived: boolean) {
    return this.outfits.setArchived(outfitId, archived)
  }

  deleteOutfit(outfitId: string) {
    return this.outfits.delete(outfitId)
  }

  updateOutfitItemPlacement(input: OutfitItemPlacementInput) {
    return this.outfits.updateItemPlacement(input)
  }

  saveDefaultWeatherLocation(input: WeatherLocationInput) {
    return this.weather.saveDefaultLocation(input)
  }

  fetchWeatherForecast(input: WeatherForecastRequest) {
    return this.weather.fetchForecast(input)
  }

  savePlaceHvacProfile(input: PlaceHvacProfileInput) {
    return this.placeHvacProfiles.save(input)
  }

  createWearLog(input: WearLogInput) {
    return this.wearLogs.create(input)
  }

  updateWearLog(id: string, input: WearLogInput) {
    return this.wearLogs.update(id, input)
  }

  updateWearLogFields(id: string, patch: WearLogPatch) {
    return this.wearLogs.updateFields(id, patch)
  }

  deleteWearLog(id: string) {
    return this.wearLogs.delete(id)
  }
}
