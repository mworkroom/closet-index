import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from '@supabase/supabase-js'
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
  OutfitItemWriteInput,
  OutfitItemPositionInput,
  ThermalFeeling,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocation,
  WeatherLocationInput,
  WearLog,
  WearLogInput,
} from '../lib/types'
import {
  CLOSET_IMAGE_BUCKET,
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
  palette_id?: string | null
  seasons: string[]
  retired: boolean
  rain_ok: boolean
  long_walk_ok: boolean
  memo: string | null
  acquired_on: string | null
  display_hex?: string | null
  color_palette: PaletteRelation | PaletteRelation[] | null
}

interface OutfitRow {
  id: string
  display_name: string | null
  rating: 'favorite' | 'ok' | 'error' | null
  archived_at?: string | null
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
  temperature_source: WearLog['temperatureSource']
  weather_location_id: string | null
  weather_issued_at: string | null
  weather_overridden: boolean
  submission_token: string
  created_at: string
}

interface WeatherLocationRow {
  id: string
  label: string
  official_name: string | null
  admin_code: string | null
  nx: number
  ny: number
  is_default: boolean
}

interface PageResult<T> {
  data: T[] | null
  error: unknown
}

type WeatherFunctionErrorCode =
  | 'invalid-request'
  | 'workspace-forbidden'
  | 'location-not-found'
  | 'weather-upstream-timeout'
  | 'weather-upstream-error'
  | 'weather-invalid-response'
  | 'weather-no-data'
  | 'weather-time-unavailable'
  | 'server-misconfigured'
  | 'internal-error'

export class WeatherForecastRequestError extends Error {
  constructor(
    readonly code: WeatherFunctionErrorCode | 'network-error',
    message: string,
  ) {
    super(message)
    this.name = 'WeatherForecastRequestError'
  }
}

const weatherErrorMessages: Record<WeatherFunctionErrorCode, string> = {
  'invalid-request': '날짜와 출발·귀가 시각을 다시 확인해 주세요.',
  'workspace-forbidden': '이 옷장의 날씨를 조회할 권한이 없습니다.',
  'location-not-found': '기본 날씨 위치를 찾을 수 없습니다.',
  'weather-upstream-timeout': '기상청 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.',
  'weather-upstream-error': '기상청 예보를 불러오지 못했습니다.',
  'weather-invalid-response': '기상청 예보 형식을 확인하지 못했습니다.',
  'weather-no-data': '선택한 날짜의 예보가 아직 없습니다.',
  'weather-time-unavailable': '선택한 시각의 실제 예보가 없습니다. 다른 시각을 골라 주세요.',
  'server-misconfigured': '날씨 서버 설정을 확인해야 합니다.',
  'internal-error': '날씨를 불러오는 중 오류가 발생했습니다.',
}

function isWeatherFunctionErrorCode(
  value: unknown,
): value is WeatherFunctionErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(weatherErrorMessages, value)
  )
}

async function toWeatherForecastError(cause: unknown) {
  if (cause instanceof FunctionsHttpError) {
    try {
      const payload = (await cause.context.json()) as {
        error?: { code?: unknown; message?: unknown }
      }
      const code = payload.error?.code
      if (isWeatherFunctionErrorCode(code)) {
        return new WeatherForecastRequestError(
          code,
          weatherErrorMessages[code],
        )
      }
    } catch {
      // 안정된 앱 메시지로 대체한다.
    }
    return new WeatherForecastRequestError(
      'internal-error',
      weatherErrorMessages['internal-error'],
    )
  }

  if (
    cause instanceof FunctionsFetchError ||
    cause instanceof FunctionsRelayError
  ) {
    return new WeatherForecastRequestError(
      'network-error',
      '날씨 서버에 연결하지 못했습니다. 직접 입력으로 계속할 수 있습니다.',
    )
  }

  return cause instanceof Error
    ? cause
    : new WeatherForecastRequestError(
        'network-error',
        '날씨를 불러오지 못했습니다.',
      )
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

function toItem(row: ItemRow, image: Item['image'] = null): Item {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    semanticColor: row.semantic_color,
    displayHex: row.display_hex ?? paletteHex(row.color_palette),
    seasons: row.seasons ?? [],
    retired: row.retired,
    rainOk: row.rain_ok,
    longWalkOk: row.long_walk_ok,
    memo: row.memo,
    acquiredOn: row.acquired_on,
    image,
  }
}

function itemMatchesInput(row: ItemRow, input: ItemCreateInput) {
  return (
    row.name === input.name.trim() &&
    row.category === input.category.trim() &&
    row.semantic_color === (input.semanticColor?.trim() || null) &&
    (row.palette_id ?? null) === input.paletteId &&
    (row.display_hex ?? paletteHex(row.color_palette)).toUpperCase() ===
      input.displayHex.toUpperCase() &&
    JSON.stringify(row.seasons ?? []) === JSON.stringify(input.seasons) &&
    row.rain_ok === input.rainOk &&
    row.long_walk_ok === input.longWalkOk &&
    row.memo === (input.memo?.trim() || null) &&
    row.acquired_on === input.acquiredOn
  )
}

function toOutfitItemWriteRow(item: OutfitItemWriteInput) {
  return {
    item_id: item.itemId,
    slot: item.slot,
    sort_order: item.sortOrder,
    position_x: item.positionX,
    position_y: item.positionY,
    item_scale: item.itemScale,
    z_index: item.zIndex,
  }
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
    temperatureSource: row.temperature_source,
    weatherLocationId: row.weather_location_id,
    weatherIssuedAt: row.weather_issued_at,
    weatherOverridden: row.weather_overridden,
    submissionToken: row.submission_token,
    createdAt: row.created_at,
  }
}

function toWeatherLocation(row: WeatherLocationRow): WeatherLocation {
  return {
    id: row.id,
    label: row.label,
    officialName: row.official_name,
    adminCode: row.admin_code,
    nx: row.nx,
    ny: row.ny,
    isDefault: row.is_default,
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
      weatherLocationsResult,
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
          'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
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
      this.client
        .from('closet_weather_locations')
        .select('id,label,official_name,admin_code,nx,ny,is_default')
        .eq('workspace_id', this.workspaceId)
        .order('is_default', { ascending: false })
        .order('label'),
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
    ].find((result) => result.error)
    if (failure?.error) throw failure.error

    const itemRows = (itemsResult.data ?? []) as unknown as ItemRow[]
    const outfitRows = (outfitsResult.data ?? []) as OutfitRow[]
    const links = (outfitItemsResult.data ?? []) as OutfitItemRow[]

    const items: Item[] = itemRows.map((row) =>
      toItem(row, imageAssets.itemImages.get(row.id) ?? null),
    )

    const outfits: Outfit[] = outfitRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at ?? null,
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
      weatherLocations: (
        (weatherLocationsResult.data ?? []) as WeatherLocationRow[]
      ).map(toWeatherLocation),
    }
  }

  async createItem(input: ItemCreateInput) {
    const row = {
      id: input.id,
      workspace_id: this.workspaceId,
      name: input.name.trim(),
      category: input.category.trim(),
      semantic_color: input.semanticColor?.trim() || null,
      palette_id: input.paletteId,
      display_hex: input.displayHex.toUpperCase(),
      seasons: input.seasons,
      rain_ok: input.rainOk,
      long_walk_ok: input.longWalkOk,
      memo: input.memo?.trim() || null,
      acquired_on: input.acquiredOn,
    }
    const selection =
      'id,name,category,semantic_color,palette_id,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,display_hex,color_palette:closet_color_palette(display_hex)'
    const { data, error } = await this.client
      .from('closet_items')
      .insert(row)
      .select(selection)
      .single()

    if (error?.code === '23505') {
      const existing = await this.client
        .from('closet_items')
        .select(selection)
        .eq('id', input.id)
        .eq('workspace_id', this.workspaceId)
        .maybeSingle()
      if (!existing.error && existing.data) {
        const existingRow = existing.data as unknown as ItemRow
        if (itemMatchesInput(existingRow, input)) return toItem(existingRow)
      }
    }
    if (error) throw error
    return toItem(data as unknown as ItemRow)
  }

  async updateItem(itemId: string, input: ItemWriteInput) {
    const selection =
      'id,name,category,semantic_color,palette_id,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,display_hex,color_palette:closet_color_palette(display_hex)'
    const { data, error } = await this.client
      .from('closet_items')
      .update({
        name: input.name.trim(),
        category: input.category.trim(),
        semantic_color: input.semanticColor?.trim() || null,
        palette_id: input.paletteId,
        display_hex: input.displayHex.toUpperCase(),
        seasons: input.seasons,
        rain_ok: input.rainOk,
        long_walk_ok: input.longWalkOk,
        memo: input.memo?.trim() || null,
        acquired_on: input.acquiredOn,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('workspace_id', this.workspaceId)
      .select(selection)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Item을 찾을 수 없습니다.')
    return toItem(data as unknown as ItemRow)
  }

  async replaceItemImage(itemId: string, input: ItemImageUploadInput) {
    const begin = await this.client.functions.invoke('closet-item-image', {
      body: {
        action: 'begin',
        workspaceId: this.workspaceId,
        itemId,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        bytes: input.bytes,
      },
    })
    if (begin.error) throw begin.error
    const ticket = begin.data as {
      imageId: string
      storagePath: string
      token: string
      contentType: string
    }

    try {
      const upload = await this.client.storage
        .from(CLOSET_IMAGE_BUCKET)
        .uploadToSignedUrl(
          ticket.storagePath,
          ticket.token,
          input.blob,
          {
            contentType: 'image/webp',
            cacheControl: '31536000',
          },
        )
      if (upload.error) throw upload.error

      const finalize = await this.client.functions.invoke(
        'closet-item-image',
        {
          body: {
            action: 'finalize',
            workspaceId: this.workspaceId,
            itemId,
            imageId: ticket.imageId,
          },
        },
      )
      if (finalize.error) throw finalize.error
    } catch (cause) {
      try {
        await this.client.functions.invoke('closet-item-image', {
          body: {
            action: 'cancel',
            workspaceId: this.workspaceId,
            itemId,
            imageId: ticket.imageId,
          },
        })
      } catch {
        // A later orphan sweep can clean an interrupted pending upload.
      }
      throw cause
    }
  }

  async setItemRetired(itemId: string, retired: boolean) {
    const { data, error } = await this.client
      .from('closet_items')
      .update({
        retired,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('workspace_id', this.workspaceId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Item을 찾을 수 없습니다.')
  }

  async findMatchingOutfits(itemIds: string[]): Promise<MatchingOutfit[]> {
    const { data, error } = await this.client.rpc(
      'find_matching_closet_outfits',
      {
        p_workspace_id: this.workspaceId,
        p_item_ids: itemIds,
      },
    )
    if (error) throw error

    return (
      (data ?? []) as Array<{
        id: string
        display_name: string | null
        rating: Outfit['rating']
        archived_at: string | null
      }>
    ).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at,
    }))
  }

  async createOutfit(input: OutfitCreateInput): Promise<Outfit> {
    const { data, error } = await this.client.rpc('create_closet_outfit', {
      p_workspace_id: this.workspaceId,
      p_outfit_id: input.id,
      p_display_name: input.displayName?.trim() || null,
      p_items: input.items.map(toOutfitItemWriteRow),
      p_allow_duplicate: input.allowDuplicate,
    })
    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as OutfitRow | null
    if (!row) throw new Error('저장된 Outfit을 불러오지 못했습니다.')
    return {
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at ?? null,
      itemIds: input.items.map((item) => item.itemId),
      itemPlacements: input.items.map((item) => ({
        itemId: item.itemId,
        slot: item.slot,
        positionX: item.positionX,
        positionY: item.positionY,
        itemScale: item.itemScale,
        zIndex: item.zIndex,
      })),
      preview: null,
    }
  }

  async cloneOutfit(input: OutfitCloneInput): Promise<Outfit> {
    const { data, error } = await this.client.rpc('clone_closet_outfit', {
      p_workspace_id: this.workspaceId,
      p_source_outfit_id: input.sourceOutfitId,
      p_outfit_id: input.id,
      p_display_name: input.displayName?.trim() || null,
    })
    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as OutfitRow | null
    if (!row) throw new Error('복제된 Outfit을 불러오지 못했습니다.')
    const relations = await collectAllPages<OutfitItemRow>(
      async (from, to) => {
        const result = await this.client
          .from('closet_outfit_items')
          .select(
            'outfit_id,item_id,sort_order,slot,position_x,position_y,scale,z_index',
          )
          .eq('workspace_id', this.workspaceId)
          .eq('outfit_id', input.id)
          .order('sort_order')
          .order('item_id')
          .range(from, to)
        return {
          data: result.data as OutfitItemRow[] | null,
          error: result.error,
        }
      },
    )
    if (relations.error) throw relations.error

    const links = relations.data ?? []
    return {
      id: row.id,
      displayName: row.display_name,
      rating: row.rating,
      archivedAt: row.archived_at ?? null,
      itemIds: links.map((link) => link.item_id),
      itemPlacements: links.map((link) => ({
        itemId: link.item_id,
        slot: link.slot,
        positionX: nullableNumericValue(link.position_x),
        positionY: nullableNumericValue(link.position_y),
        itemScale: nullableNumericValue(link.scale),
        zIndex: link.z_index,
      })),
      preview: null,
    }
  }

  async setOutfitArchived(outfitId: string, archived: boolean) {
    const { data, error } = await this.client
      .from('closet_outfits')
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', outfitId)
      .eq('workspace_id', this.workspaceId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Outfit을 찾을 수 없습니다.')
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

  async saveDefaultWeatherLocation(input: WeatherLocationInput) {
    const mutableRow = {
      label: input.label.trim(),
      official_name: input.officialName?.trim() || null,
      admin_code: input.adminCode?.trim() || null,
      nx: input.nx,
      ny: input.ny,
      is_default: true,
      updated_at: new Date().toISOString(),
    }
    const selection = 'id,label,official_name,admin_code,nx,ny,is_default'

    if (input.id) {
      const { data, error } = await this.client
        .from('closet_weather_locations')
        .update(mutableRow)
        .eq('id', input.id)
        .eq('workspace_id', this.workspaceId)
        .select(selection)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('기본 날씨 위치를 찾을 수 없습니다.')
      return toWeatherLocation(data as WeatherLocationRow)
    }

    const { data, error } = await this.client
      .from('closet_weather_locations')
      .insert({
        ...mutableRow,
        id: crypto.randomUUID(),
        workspace_id: this.workspaceId,
      })
      .select(selection)
      .single()

    if (error) throw error
    return toWeatherLocation(data as WeatherLocationRow)
  }

  async fetchWeatherForecast(
    input: WeatherForecastRequest,
  ): Promise<WeatherForecastResponse> {
    const { data, error } = await this.client.functions.invoke(
      'closet-weather-forecast',
      {
        body: {
          workspaceId: this.workspaceId,
          locationId: input.locationId,
          forecastDate: input.forecastDate,
          departureTime: input.departureTime,
          returnTime: input.returnTime,
        },
      },
    )

    if (error) throw await toWeatherForecastError(error)
    return data as WeatherForecastResponse
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
        'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
      )
      .single()

    if (error?.code === '23505') {
      const existing = await this.client
        .from('closet_wear_logs')
        .select(
          'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
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
        'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
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
      temperature_source: input.temperatureSource,
      weather_location_id: input.weatherLocationId,
      weather_issued_at: input.weatherIssuedAt,
      weather_overridden: input.weatherOverridden,
    }
  }
}
