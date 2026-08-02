import type {
  Item,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  MatchingOutfit,
  Outfit,
  OutfitCloneInput,
  OutfitCreateInput,
  OutfitItemPlacementInput,
  OutfitPreviewUploadInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocation,
  WeatherLocationInput,
  WearLog,
  WearLogInput,
} from '../lib/types'
import { demoData } from './demo-data'
import type { ClosetRepository } from './repository'

const STORAGE_KEY = 'closet-index-demo-data-v3'

function normalizeItem(input: ItemWriteInput, id: string): Item {
  const name = input.name.trim()
  const category = input.category.trim()
  if (!name) throw new Error('Item 이름을 입력해 주세요.')
  if (!category) throw new Error('Item 카테고리를 선택해 주세요.')
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.displayHex)) {
    throw new Error('fallback 색상은 6자리 HEX여야 합니다.')
  }

  return {
    id,
    name,
    category,
    semanticColor: input.semanticColor?.trim() || null,
    displayHex: input.displayHex.toUpperCase(),
    seasons: [...input.seasons],
    retired: false,
    rainOk: input.rainOk,
    longWalkOk: input.longWalkOk,
    memo: input.memo?.trim() || null,
    acquiredOn: input.acquiredOn,
    image: null,
  }
}

function itemSetKey(itemIds: string[]) {
  return [...new Set(itemIds)].sort().join('\n')
}

function cloneDemoData() {
  return structuredClone(demoData)
}

function readData() {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return cloneDemoData()

  try {
    const data = JSON.parse(stored) as typeof demoData
    data.weatherLocations ??= structuredClone(demoData.weatherLocations)
    for (const outfit of data.outfits) outfit.archivedAt ??= null
    for (const outfit of data.outfits) {
      outfit.previewState ??= outfit.preview ? 'ready' : 'missing'
      if (outfit.preview) outfit.preview.sourceFingerprint ??= null
    }
    data.wearLogs = data.wearLogs.map((log) => {
      const normalized = { ...log }
      normalized.temperatureSource ??= 'notion'
      normalized.weatherLocationId ??= null
      normalized.weatherIssuedAt ??= null
      normalized.weatherOverridden ??= false
      return normalized
    })
    return data
  } catch {
    return cloneDemoData()
  }
}

function writeData(data: typeof demoData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () =>
      reject(new Error('이미지 미리보기를 저장하지 못했습니다.')),
    )
    reader.readAsDataURL(blob)
  })
}

export class DemoRepository implements ClosetRepository {
  async load() {
    return readData()
  }

  async createItem(input: ItemCreateInput) {
    const data = readData()
    const existing = data.items.find((item) => item.id === input.id)
    if (existing) return existing

    const item = normalizeItem(input, input.id)
    data.items.push(item)
    writeData(data)
    return item
  }

  async updateItem(itemId: string, input: ItemWriteInput) {
    const data = readData()
    const index = data.items.findIndex((item) => item.id === itemId)
    if (index < 0) throw new Error('Item을 찾을 수 없습니다.')

    const current = data.items[index]
    const item = {
      ...normalizeItem(input, itemId),
      retired: current.retired,
      image: current.image ?? null,
    }
    data.items[index] = item
    writeData(data)
    return item
  }

  async replaceItemImage(itemId: string, input: ItemImageUploadInput) {
    const data = readData()
    const item = data.items.find((entry) => entry.id === itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    item.image = {
      id: crypto.randomUUID(),
      storagePath: `demo/items/${itemId}/cutout.webp`,
      url: await blobToDataUrl(input.blob),
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      expiresAt: null,
    }
    for (const outfit of data.outfits) {
      if (!outfit.itemIds.includes(itemId)) continue
      outfit.previewState = outfit.preview ? 'stale' : 'missing'
      outfit.preview = null
    }
    writeData(data)
  }

  async replaceOutfitPreview(
    outfitId: string,
    input: OutfitPreviewUploadInput,
  ) {
    const data = readData()
    const outfit = data.outfits.find((entry) => entry.id === outfitId)
    if (!outfit) throw new Error('Outfit을 찾을 수 없습니다.')
    outfit.preview = {
      id: crypto.randomUUID(),
      storagePath: `demo/outfits/${outfitId}/preview/v${(outfit.preview?.compositionVersion ?? 0) + 1}.webp`,
      url: await blobToDataUrl(input.blob),
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      expiresAt: null,
      compositionVersion: (outfit.preview?.compositionVersion ?? 0) + 1,
      sourceFingerprint: input.sourceFingerprint,
    }
    outfit.previewState = 'ready'
    writeData(data)
  }

  async setItemRetired(itemId: string, retired: boolean) {
    const data = readData()
    const item = data.items.find((entry) => entry.id === itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    item.retired = retired
    writeData(data)
  }

  async deleteItem(itemId: string) {
    const data = readData()
    const item = data.items.find((entry) => entry.id === itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    if (data.outfits.some((outfit) => outfit.itemIds.includes(itemId))) {
      throw new Error('이 Item이 포함된 Outfit이 있어 삭제할 수 없습니다.')
    }
    data.items = data.items.filter((entry) => entry.id !== itemId)
    writeData(data)
  }

  async updateItemSuitability(
    itemId: string,
    rainOk: boolean,
    longWalkOk: boolean,
  ) {
    const data = readData()
    const item = data.items.find((entry) => entry.id === itemId)
    if (!item) throw new Error('아이템을 찾을 수 없습니다.')
    item.rainOk = rainOk
    item.longWalkOk = longWalkOk
    writeData(data)
  }

  async updateOutfitItemPlacement(input: OutfitItemPlacementInput) {
    const data = readData()
    const outfit = data.outfits.find((entry) => entry.id === input.outfitId)
    if (!outfit || !outfit.itemIds.includes(input.itemId)) {
      throw new Error('Outfit 구성 아이템을 찾을 수 없습니다.')
    }

    outfit.itemPlacements ??= []
    const existing = outfit.itemPlacements.find(
      (placement) => placement.itemId === input.itemId,
    )
    if (existing) {
      existing.slot = input.slot
      existing.positionX = input.positionX
      existing.positionY = input.positionY
      existing.itemScale = input.itemScale
      existing.zIndex = input.zIndex
    } else {
      outfit.itemPlacements.push({
        itemId: input.itemId,
        slot: input.slot,
        positionX: input.positionX,
        positionY: input.positionY,
        itemScale: input.itemScale,
        zIndex: input.zIndex,
      })
    }
    outfit.previewState = outfit.preview ? 'stale' : 'missing'
    outfit.preview = null
    writeData(data)
  }

  async findMatchingOutfits(itemIds: string[]): Promise<MatchingOutfit[]> {
    const targetKey = itemSetKey(itemIds)
    if (!targetKey || new Set(itemIds).size !== itemIds.length) {
      throw new Error('Outfit Item은 비어 있지 않고 중복이 없어야 합니다.')
    }

    return readData()
      .outfits.filter((outfit) => itemSetKey(outfit.itemIds) === targetKey)
      .map((outfit) => ({
        id: outfit.id,
        displayName: outfit.displayName,
        rating: outfit.rating,
        archivedAt: outfit.archivedAt ?? null,
      }))
  }

  async createOutfit(input: OutfitCreateInput): Promise<Outfit> {
    const data = readData()
    const existing = data.outfits.find((outfit) => outfit.id === input.id)
    if (existing) return existing
    if (input.items.length === 0) {
      throw new Error('Outfit에는 Item이 하나 이상 필요합니다.')
    }

    const itemIds = input.items.map((item) => item.itemId)
    if (new Set(itemIds).size !== itemIds.length) {
      throw new Error('같은 Item을 Outfit에 두 번 넣을 수 없습니다.')
    }
    if (itemIds.some((itemId) => !data.items.some((item) => item.id === itemId))) {
      throw new Error('Outfit Item을 찾을 수 없습니다.')
    }

    const targetKey = itemSetKey(itemIds)
    const duplicates = data.outfits.filter(
      (outfit) => itemSetKey(outfit.itemIds) === targetKey,
    )
    if (!input.allowDuplicate && duplicates.length > 0) {
      throw new Error('같은 Item 조합의 Outfit이 이미 있습니다.')
    }

    const outfit: Outfit = {
      id: input.id,
      displayName: input.displayName?.trim() || null,
      rating: null,
      archivedAt: null,
      itemIds,
      itemPlacements: input.items.map((item) => ({
        itemId: item.itemId,
        slot: item.slot,
        positionX: item.positionX,
        positionY: item.positionY,
        itemScale: item.itemScale,
        zIndex: item.zIndex,
      })),
      preview: null,
      previewState: 'missing',
    }
    data.outfits.push(outfit)
    writeData(data)
    return outfit
  }

  async cloneOutfit(input: OutfitCloneInput): Promise<Outfit> {
    const data = readData()
    const source = data.outfits.find(
      (outfit) => outfit.id === input.sourceOutfitId,
    )
    if (!source) throw new Error('복제할 Outfit을 찾을 수 없습니다.')

    return this.createOutfit({
      id: input.id,
      displayName: input.displayName ?? source.displayName,
      allowDuplicate: true,
      items: source.itemIds.map((itemId, index) => {
        const placement = source.itemPlacements?.find(
          (entry) => entry.itemId === itemId,
        )
        return {
          itemId,
          slot: placement?.slot ?? null,
          sortOrder: index,
          positionX: placement?.positionX ?? null,
          positionY: placement?.positionY ?? null,
          itemScale: placement?.itemScale ?? null,
          zIndex: placement?.zIndex ?? null,
        }
      }),
    })
  }

  async setOutfitArchived(outfitId: string, archived: boolean) {
    const data = readData()
    const outfit = data.outfits.find((entry) => entry.id === outfitId)
    if (!outfit) throw new Error('Outfit을 찾을 수 없습니다.')
    outfit.archivedAt = archived ? new Date().toISOString() : null
    writeData(data)
  }

  async deleteOutfit(outfitId: string) {
    const data = readData()
    const outfit = data.outfits.find((entry) => entry.id === outfitId)
    if (!outfit) throw new Error('Outfit을 찾을 수 없습니다.')
    if (data.wearLogs.some((log) => log.outfitId === outfitId)) {
      throw new Error('착용 기록이 있는 Outfit은 삭제할 수 없습니다.')
    }
    data.outfits = data.outfits.filter((entry) => entry.id !== outfitId)
    writeData(data)
  }

  async saveDefaultWeatherLocation(input: WeatherLocationInput) {
    const data = readData()
    const current = input.id
      ? data.weatherLocations?.find((location) => location.id === input.id)
      : data.weatherLocations?.find((location) => location.isDefault)
    const location: WeatherLocation = {
      ...input,
      id: current?.id ?? crypto.randomUUID(),
      isDefault: true,
    }

    data.weatherLocations = [
      ...(data.weatherLocations ?? [])
        .filter((entry) => entry.id !== location.id)
        .map((entry) => ({ ...entry, isDefault: false })),
      location,
    ]
    writeData(data)
    return location
  }

  async fetchWeatherForecast(
    input: WeatherForecastRequest,
  ): Promise<WeatherForecastResponse> {
    const data = readData()
    const location = data.weatherLocations?.find(
      (entry) => entry.id === input.locationId,
    )
    if (!location) throw new Error('기본 날씨 위치를 찾을 수 없습니다.')

    const point = (
      time: string,
      temperature: number,
      humidity: number,
    ): WeatherForecastResponse['departure'] => ({
      at: `${input.forecastDate}T${time}:00+09:00`,
      temperature,
      humidity,
      precipitationProbability: 20,
      precipitationType: 'none',
      precipitationAmount: { value: null, label: null, hasAmount: false },
      snowAmount: { value: null, label: null, hasAmount: false },
      sky: 'mostly-cloudy',
      windSpeed: 1.8,
      hasPrecipitation: false,
      missingCategories: [],
    })

    return {
      source: 'kma-vilage-fcst',
      issuedAt: `${input.forecastDate}T05:00:00+09:00`,
      fetchedAt: new Date().toISOString(),
      nx: location.nx,
      ny: location.ny,
      location: { id: location.id, label: location.label },
      departure: point(input.departureTime, 24, 62),
      return: point(input.returnTime, 20, 78),
      period: {
        hasPrecipitation: false,
        precipitationTypes: [],
        maxPrecipitationProbability: 30,
        minHumidity: 62,
        maxHumidity: 78,
      },
      stale: false,
      warnings: [],
    }
  }

  async createWearLog(input: WearLogInput) {
    const data = readData()
    const duplicate = data.wearLogs.find(
      (log) => log.submissionToken === input.submissionToken,
    )
    if (duplicate) return duplicate

    const log: WearLog = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    data.wearLogs.push(log)
    writeData(data)
    return log
  }

  async updateWearLog(id: string, input: WearLogInput) {
    const data = readData()
    const index = data.wearLogs.findIndex((log) => log.id === id)
    if (index < 0) throw new Error('착용 기록을 찾을 수 없습니다.')

    const log: WearLog = {
      ...data.wearLogs[index],
      ...input,
      id,
    }
    data.wearLogs[index] = log
    writeData(data)
    return log
  }

  async deleteWearLog(id: string) {
    const data = readData()
    data.wearLogs = data.wearLogs.filter((log) => log.id !== id)
    writeData(data)
  }
}
