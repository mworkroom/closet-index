import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  Item,
  Outfit,
  OutfitItemPositionInput,
  ThermalFeeling,
  WearLog,
  WearLogInput,
} from '../lib/types'
import {
  emptyReadyImageAssets,
  loadReadyImageAssets,
  SignedImageUrlCache,
} from './image-assets'
import type { ClosetRepository } from './repository'

interface PaletteRelation {
  display_hex: string
}

interface ItemRow {
  id: string
  name: string
  category: string
  semantic_color: string | null
  seasons: string[]
  retired: boolean
  rain_ok: boolean
  long_walk_ok: boolean
  memo: string | null
  acquired_on: string | null
  color_palette: PaletteRelation | PaletteRelation[] | null
}

interface OutfitRow {
  id: string
  display_name: string | null
  rating: 'favorite' | 'ok' | 'error' | null
}

interface OutfitItemRow {
  outfit_id: string
  item_id: string
  sort_order: number
  slot: string | null
  position_x: number | string | null
  position_y: number | string | null
  scale: number | string | null
  z_index: number | null
}

interface WearLogRow {
  id: string
  outfit_id: string
  worn_on: string
  temp_out: number | null
  temp_back: number | null
  temp_back_inferred: boolean
  feeling_out: ThermalFeeling
  feeling_back: ThermalFeeling
  rain_condition: WearLog['rainCondition']
  long_walk_condition: WearLog['longWalkCondition']
  place_id: string | null
  transport_mode_id: string | null
  memo: string | null
  submission_token: string
  created_at: string
}

interface PageResult<T> {
  data: T[] | null
  error: unknown
}

export async function collectAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize = 1000,
): Promise<PageResult<T>> {
  const data: T[] = []

  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1)
    if (page.error) return { data: null, error: page.error }

    const rows = page.data ?? []
    data.push(...rows)
    if (rows.length < pageSize) return { data, error: null }
  }
}

function paletteHex(value: ItemRow['color_palette']) {
  if (Array.isArray(value)) return value[0]?.display_hex ?? '#B8B8B4'
  return value?.display_hex ?? '#B8B8B4'
}

function toWearLog(row: WearLogRow): WearLog {
  return {
    id: row.id,
    outfitId: row.outfit_id,
    wornOn: row.worn_on,
    tempOut: row.temp_out,
    tempBack: row.temp_back,
    tempBackInferred: row.temp_back_inferred,
    feelingOut: row.feeling_out,
    feelingBack: row.feeling_back,
    rainCondition: row.rain_condition,
    longWalkCondition: row.long_walk_condition,
    placeId: row.place_id,
    transportModeId: row.transport_mode_id,
    memo: row.memo,
    submissionToken: row.submission_token,
    createdAt: row.created_at,
  }
}

function numericValue(value: number | string | null, fallback = 0) {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullableNumericValue(value: number | string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export class SupabaseRepository implements ClosetRepository {
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

    const [
      itemsResult,
      outfitsResult,
      outfitItemsResult,
      logsResult,
      placesResult,
      transportsResult,
      imageAssets,
    ] = await Promise.all([
      this.client
        .from('closet_items')
        .select(
          'id,name,category,semantic_color,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,color_palette:closet_color_palette(display_hex)',
        )
        .eq('workspace_id', this.workspaceId)
        .order('acquired_on', { ascending: false, nullsFirst: false })
        .order('name'),
      this.client
        .from('closet_outfits')
        .select('id,display_name,rating')
        .eq('workspace_id', this.workspaceId)
        .order('created_at'),
      outfitItemsPromise,
      this.client
        .from('closet_wear_logs')
        .select(
          'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,submission_token,created_at',
        )
        .eq('workspace_id', this.workspaceId)
        .order('worn_on', { ascending: false }),
      this.client
        .from('closet_places')
        .select('id,name')
        .eq('workspace_id', this.workspaceId)
        .eq('active', true)
        .order('name'),
      this.client
        .from('closet_transport_modes')
        .select('id,name')
        .eq('workspace_id', this.workspaceId)
        .eq('active', true)
        .order('name'),
      imageAssetsPromise,
    ])

    const failure = [
      itemsResult,
      outfitsResult,
      outfitItemsResult,
      logsResult,
      placesResult,
      transportsResult,
    ].find((result) => result.error)
    if (failure?.error) throw failure.error

    const itemRows = (itemsResult.data ?? []) as unknown as ItemRow[]
    const outfitRows = (outfitsResult.data ?? []) as OutfitRow[]
    const links = (outfitItemsResult.data ?? []) as OutfitItemRow[]

    const items: Item[] = itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      semanticColor: row.semantic_color,
      displayHex: paletteHex(row.color_palette),
      seasons: row.seasons ?? [],
      retired: row.retired,
      rainOk: row.rain_ok,
      longWalkOk: row.long_walk_ok,
      memo: row.memo,
      acquiredOn: row.acquired_on,
      image: imageAssets.itemImages.get(row.id) ?? null,
    }))

    const outfits: Outfit[] = outfitRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      itemIds: links
        .filter((link) => link.outfit_id === row.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((link) => link.item_id),
      itemPlacements: links
        .filter((link) => link.outfit_id === row.id)
        .map((link) => ({
          itemId: link.item_id,
          slot: link.slot,
          positionX: nullableNumericValue(link.position_x),
          positionY: nullableNumericValue(link.position_y),
          itemScale: nullableNumericValue(link.scale),
          zIndex: link.z_index,
        })),
      preview: imageAssets.outfitPreviews.get(row.id) ?? null,
    }))

    return {
      items,
      outfits,
      wearLogs: ((logsResult.data ?? []) as WearLogRow[]).map(toWearLog),
      places: (placesResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
      transportModes: (transportsResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
      })),
    }
  }

  async updateItemSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) {
    const { error } = await this.client
      .from('closet_items')
      .update({
        rain_ok: rainOk,
        long_walk_ok: longWalkOk,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('workspace_id', this.workspaceId)

    if (error) throw error
  }

  async updateOutfitItemPosition(input: OutfitItemPositionInput) {
    const { data, error } = await this.client
      .from('closet_outfit_items')
      .update({
        position_x: input.positionX,
        position_y: input.positionY,
        scale: input.itemScale,
      })
      .eq('workspace_id', this.workspaceId)
      .eq('outfit_id', input.outfitId)
      .eq('item_id', input.itemId)
      .select('outfit_id,item_id,position_x,position_y,scale')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Outfit 구성 아이템을 찾을 수 없습니다.')
  }

  async createWearLog(input: WearLogInput) {
    const { data, error } = await this.client
      .from('closet_wear_logs')
      .insert({
        ...this.toMutableRow(input),
        id: crypto.randomUUID(),
        workspace_id: this.workspaceId,
        submission_token: input.submissionToken,
      })
      .select(
        'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,submission_token,created_at',
      )
      .single()

    if (error?.code === '23505') {
      const existing = await this.client
        .from('closet_wear_logs')
        .select(
          'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,submission_token,created_at',
        )
        .eq('workspace_id', this.workspaceId)
        .eq('submission_token', input.submissionToken)
        .maybeSingle()
      if (!existing.error && existing.data) {
        return toWearLog(existing.data as WearLogRow)
      }
    }
    if (error) throw error
    return toWearLog(data as WearLogRow)
  }

  async updateWearLog(id: string, input: WearLogInput) {
    const { data, error } = await this.client
      .from('closet_wear_logs')
      .update({
        ...this.toMutableRow(input),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)
      .select(
        'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,submission_token,created_at',
      )
      .single()

    if (error) throw error
    return toWearLog(data as WearLogRow)
  }

  async deleteWearLog(id: string) {
    const { error } = await this.client
      .from('closet_wear_logs')
      .delete()
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)

    if (error) throw error
  }

  private toMutableRow(input: WearLogInput) {
    return {
      outfit_id: input.outfitId,
      worn_on: input.wornOn,
      temp_out: input.tempOut,
      temp_back: input.tempBack,
      temp_back_inferred: input.tempBackInferred,
      feeling_out: input.feelingOut,
      feeling_back: input.feelingBack,
      rain_condition: input.rainCondition,
      long_walk_condition: input.longWalkCondition,
      place_id: input.placeId,
      transport_mode_id: input.transportModeId,
      memo: input.memo,
      temperature_source: 'manual',
    }
  }
}
