import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  OutfitCloneInput,
  OutfitCreateInput,
  OutfitUpdateInput,
  OutfitItemPlacementInput,
  WeatherForecastRequest,
  WeatherLocationInput,
  WearLogInput,
} from '../lib/types'
import type { ClosetRepository } from './repository'
import { SupabaseItemRepository } from './supabase/items'
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

export { collectAllPages, WeatherForecastRequestError }

export class SupabaseRepository implements ClosetRepository {
  private readonly snapshot: SupabaseSnapshotRepository
  private readonly items: SupabaseItemRepository
  private readonly outfits: SupabaseOutfitRepository
  private readonly weather: SupabaseWeatherRepository
  private readonly wearLogs: SupabaseWearLogRepository
  readonly replacementLines: SupabaseReplacementLineRepository
  readonly purchases: SupabasePurchaseRepository
  readonly care: SupabaseCareRepository

  constructor(client: SupabaseClient, workspaceId: string) {
    this.snapshot = new SupabaseSnapshotRepository(client, workspaceId)
    this.items = new SupabaseItemRepository(client, workspaceId)
    this.outfits = new SupabaseOutfitRepository(client, workspaceId)
    this.weather = new SupabaseWeatherRepository(client, workspaceId)
    this.wearLogs = new SupabaseWearLogRepository(client, workspaceId)
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

  cloneOutfit(input: OutfitCloneInput) {
    return this.outfits.clone(input)
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

  createWearLog(input: WearLogInput) {
    return this.wearLogs.create(input)
  }

  updateWearLog(id: string, input: WearLogInput) {
    return this.wearLogs.update(id, input)
  }

  deleteWearLog(id: string) {
    return this.wearLogs.delete(id)
  }
}
