import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Item, Outfit } from '../../lib/types'
import {
  emptyReadyImageAssets,
  loadReadyImageAssets,
  SignedImageUrlCache,
} from '../image-assets'
import {
  collectAllPages,
  nullableNumericValue,
  type ItemRow,
  type OutfitItemRow,
  type OutfitRow,
  toItem,
  toPlaceHvacProfile,
  toWearLog,
  toWeatherLocation,
  type WearLogRow,
  type PlaceHvacProfileRow,
  type WeatherLocationRow,
} from './shared'

export class SupabaseSnapshotRepository {
  private readonly imageUrlCache = new SignedImageUrlCache()

  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async load(): Promise<AppData> {
    const imageAssetsPromise = loadReadyImageAssets(
      this.client,
      this.workspaceId,
      this.imageUrlCache,
    ).catch(() => emptyReadyImageAssets())
    const outfitItemsPromise = collectAllPages<OutfitItemRow>(
      async (from, to) => {
        const result = await this.client
          .from('closet_outfit_items')
          .select(
            'outfit_id,item_id,sort_order,slot,position_x,position_y,scale,z_index',
          )
          .eq('workspace_id', this.workspaceId)
          .order('outfit_id')
          .order('sort_order')
          .order('item_id')
          .range(from, to)

        return {
          data: result.data as OutfitItemRow[] | null,
          error: result.error,
        }
      },
    )
    const wearLogsPromise = collectAllPages<WearLogRow>(
      async (from, to) => {
        const result = await this.client
          .from('closet_wear_logs')
          .select(
            'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,observed_hvac_mode,observed_hvac_intensity,observed_hvac_memo,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
          )
          .eq('workspace_id', this.workspaceId)
          .order('worn_on', { ascending: false })
          .order('id')
          .range(from, to)

        return {
          data: result.data as WearLogRow[] | null,
          error: result.error,
        }
      },
    )

    const [
      itemsResult,
      outfitsResult,
      outfitItemsResult,
      logsResult,
      placesResult,
      transportsResult,
      weatherLocationsResult,
      placeHvacProfilesResult,
      imageAssets,
    ] = await Promise.all([
      this.client
        .from('closet_items')
        .select(
          'id,name,category,semantic_color,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,current_quantity,color_palette:closet_color_palette(display_name,display_hex)',
        )
        .eq('workspace_id', this.workspaceId)
        .order('acquired_on', { ascending: false, nullsFirst: false })
        .order('name'),
      this.client
        .from('closet_outfits')
        .select('id,display_name,rating,archived_at')
        .eq('workspace_id', this.workspaceId)
        .order('created_at'),
      outfitItemsPromise,
      wearLogsPromise,
      this.client
        .from('closet_places')
        .select('id,name,place_kind')
        .eq('workspace_id', this.workspaceId)
        .eq('active', true)
        .order('name'),
      this.client
        .from('closet_transport_modes')
        .select('id,name')
        .eq('workspace_id', this.workspaceId)
        .eq('active', true)
        .order('name'),
      this.client
        .from('closet_weather_locations')
        .select('id,label,official_name,admin_code,nx,ny,is_default')
        .eq('workspace_id', this.workspaceId)
        .order('is_default', { ascending: false })
        .order('label'),
      this.client
        .from('closet_place_hvac_profiles')
        .select(
          'workspace_id,place_id,season,expected_hvac_mode,expected_hvac_intensity,memo,source,last_confirmed_on,created_at',
        )
        .eq('workspace_id', this.workspaceId)
        .order('place_id')
        .order('season'),
      imageAssetsPromise,
    ])

    const failure = [
      itemsResult,
      outfitsResult,
      outfitItemsResult,
      logsResult,
      placesResult,
      transportsResult,
      weatherLocationsResult,
      placeHvacProfilesResult,
    ].find((result) => result.error)
    if (failure?.error) throw failure.error

    const itemRows = (itemsResult.data ?? []) as unknown as ItemRow[]
    const outfitRows = (outfitsResult.data ?? []) as OutfitRow[]
    const links = (outfitItemsResult.data ?? []) as OutfitItemRow[]
    const items: Item[] = itemRows.map((row) =>
      toItem(row, imageAssets.itemImages.get(row.id) ?? null),
    )
    const linksByOutfit = new Map<string, OutfitItemRow[]>()
    for (const link of links) {
      const group = linksByOutfit.get(link.outfit_id) ?? []
      group.push(link)
      linksByOutfit.set(link.outfit_id, group)
    }

    const outfits: Outfit[] = outfitRows.map((row) => {
      const outfitLinks = linksByOutfit.get(row.id) ?? []
      return {
        id: row.id,
        displayName: row.display_name,
        rating: row.rating,
        archivedAt: row.archived_at ?? null,
        itemIds: [...outfitLinks]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((link) => link.item_id),
        itemPlacements: outfitLinks.map((link) => ({
          itemId: link.item_id,
          slot: link.slot,
          positionX: nullableNumericValue(link.position_x),
          positionY: nullableNumericValue(link.position_y),
          itemScale: nullableNumericValue(link.scale),
          zIndex: link.z_index,
        })),
      }
    })

    return {
      items,
      outfits,
      wearLogs: ((logsResult.data ?? []) as WearLogRow[]).map(toWearLog),
      places: (placesResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.place_kind,
      })),
      placeHvacProfiles: (
        (placeHvacProfilesResult.data ?? []) as PlaceHvacProfileRow[]
      ).map(toPlaceHvacProfile),
      transportModes: (transportsResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
      })),
      weatherLocations: (
        (weatherLocationsResult.data ?? []) as WeatherLocationRow[]
      ).map(toWeatherLocation),
    }
  }
}
