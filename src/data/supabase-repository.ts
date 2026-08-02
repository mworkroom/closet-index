import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  OutfitCloneInput,
  OutfitCreateInput,
  OutfitItemPlacementInput,
  OutfitPreviewUploadInput,
  ReplacementLineSnapshot,
  ReplacementLegacyLink,
  ReplacementLegacyLinkReviewInput,
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

export { collectAllPages, WeatherForecastRequestError }

export class SupabaseRepository implements ClosetRepository {
  private readonly snapshot: SupabaseSnapshotRepository
  private readonly items: SupabaseItemRepository
  private readonly outfits: SupabaseOutfitRepository
  private readonly weather: SupabaseWeatherRepository
  private readonly wearLogs: SupabaseWearLogRepository
  private readonly replacementLines: SupabaseReplacementLineRepository

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
  }

  load(): Promise<AppData> {
    return this.snapshot.load()
  }

  loadReplacementLines(): Promise<ReplacementLineSnapshot> {
    return this.replacementLines.load()
  }

  loadReplacementLegacyLinks(): Promise<ReplacementLegacyLink[]> {
    return this.replacementLines.loadLegacyLinks()
  }

  reviewReplacementLegacyLink(
    linkId: string,
    input: ReplacementLegacyLinkReviewInput,
  ): Promise<ReplacementLegacyLink> {
    return this.replacementLines.reviewLegacyLink(linkId, input)
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

  replaceOutfitPreview(
    outfitId: string,
    input: OutfitPreviewUploadInput,
  ) {
    return this.outfits.replacePreview(outfitId, input)
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
