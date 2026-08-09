import type {
  Item,
  ItemCreateInput,
  OutfitItemWriteInput,
  PlaceHvacProfile,
  ThermalFeeling,
  WearLog,
  WearLogInput,
  WearLogPatch,
  WeatherLocation,
} from '../../lib/types'

export interface PaletteRelation {
  display_hex: string
  display_name?: string | null
}

export interface ItemRow {
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
  current_quantity?: number | null
  display_hex?: string | null
  color_palette: PaletteRelation | PaletteRelation[] | null
}

export interface OutfitRow {
  id: string
  display_name: string | null
  rating: 'favorite' | 'ok' | 'error' | null
  archived_at?: string | null
}

export interface OutfitItemRow {
  outfit_id: string
  item_id: string
  sort_order: number
  slot: string | null
  position_x: number | string | null
  position_y: number | string | null
  scale: number | string | null
  z_index: number | null
}

export interface WearLogRow {
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
  observed_hvac_mode: WearLog['observedHvacMode']
  observed_hvac_intensity: WearLog['observedHvacIntensity']
  observed_hvac_memo: string | null
  memo: string | null
  temperature_source: WearLog['temperatureSource']
  weather_location_id: string | null
  weather_issued_at: string | null
  weather_overridden: boolean
  submission_token: string
  created_at: string
}

export interface PlaceHvacProfileRow {
  workspace_id: string
  place_id: string
  season: PlaceHvacProfile['season']
  expected_hvac_mode: PlaceHvacProfile['expectedMode']
  expected_hvac_intensity: PlaceHvacProfile['expectedIntensity']
  memo: string | null
  source: PlaceHvacProfile['source']
  last_confirmed_on: string
  created_at: string
}

export interface WeatherLocationRow {
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

function paletteName(value: ItemRow['color_palette']) {
  if (Array.isArray(value)) return value[0]?.display_name ?? null
  return value?.display_name ?? null
}

export function toItem(row: ItemRow, image: Item['image'] = null): Item {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    semanticColor: row.semantic_color,
    paletteName: paletteName(row.color_palette),
    displayHex: row.display_hex ?? paletteHex(row.color_palette),
    seasons: row.seasons ?? [],
    retired: row.retired,
    rainOk: row.rain_ok,
    longWalkOk: row.long_walk_ok,
    memo: row.memo,
    acquiredOn: row.acquired_on,
    currentQuantity: row.current_quantity ?? null,
    image,
  }
}

export function itemMatchesInput(row: ItemRow, input: ItemCreateInput) {
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

export function toOutfitItemWriteRow(item: OutfitItemWriteInput) {
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

export function toWearLog(row: WearLogRow): WearLog {
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
    observedHvacMode: row.observed_hvac_mode,
    observedHvacIntensity: row.observed_hvac_intensity,
    observedHvacMemo: row.observed_hvac_memo,
    memo: row.memo,
    temperatureSource: row.temperature_source,
    weatherLocationId: row.weather_location_id,
    weatherIssuedAt: row.weather_issued_at,
    weatherOverridden: row.weather_overridden,
    submissionToken: row.submission_token,
    createdAt: row.created_at,
  }
}

export function toWeatherLocation(row: WeatherLocationRow): WeatherLocation {
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

export function nullableNumericValue(value: number | string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toWearLogMutableRow(input: WearLogInput) {
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
    observed_hvac_mode: input.observedHvacMode,
    observed_hvac_intensity: input.observedHvacIntensity,
    observed_hvac_memo: input.observedHvacMemo,
    memo: input.memo,
    temperature_source: input.temperatureSource,
    weather_location_id: input.weatherLocationId,
    weather_issued_at: input.weatherIssuedAt,
    weather_overridden: input.weatherOverridden,
  }
}

export function toPlaceHvacProfile(row: PlaceHvacProfileRow): PlaceHvacProfile {
  return {
    workspaceId: row.workspace_id,
    placeId: row.place_id,
    season: row.season,
    expectedMode: row.expected_hvac_mode,
    expectedIntensity: row.expected_hvac_intensity,
    memo: row.memo,
    source: row.source,
    lastConfirmedOn: row.last_confirmed_on,
    createdAt: row.created_at,
  }
}

export function toWearLogPatchRow(input: WearLogPatch) {
  const row: Record<string, unknown> = {}

  if (input.wornOn !== undefined) row.worn_on = input.wornOn
  if (input.tempOut !== undefined) row.temp_out = input.tempOut
  if (input.tempBack !== undefined) row.temp_back = input.tempBack
  if (input.tempBackInferred !== undefined) {
    row.temp_back_inferred = input.tempBackInferred
  }
  if (input.feelingOut !== undefined) row.feeling_out = input.feelingOut
  if (input.feelingBack !== undefined) row.feeling_back = input.feelingBack
  if (input.rainCondition !== undefined) {
    row.rain_condition = input.rainCondition
  }
  if (input.longWalkCondition !== undefined) {
    row.long_walk_condition = input.longWalkCondition
  }
  if (input.placeId !== undefined) row.place_id = input.placeId
  if (input.transportModeId !== undefined) {
    row.transport_mode_id = input.transportModeId
  }
  if (input.observedHvacMode !== undefined) {
    row.observed_hvac_mode = input.observedHvacMode
  }
  if (input.observedHvacIntensity !== undefined) {
    row.observed_hvac_intensity = input.observedHvacIntensity
  }
  if (input.observedHvacMemo !== undefined) {
    row.observed_hvac_memo = input.observedHvacMemo
  }
  if (input.memo !== undefined) row.memo = input.memo

  return row
}
