import type {
  Item,
  ItemCreateInput,
  ItemImageUploadInput,
  ItemWriteInput,
  MatchingOutfit,
  Outfit,
  OutfitCloneInput,
  OutfitCreateInput,
  OutfitUpdateInput,
  OutfitItemPlacementInput,
  PlaceHvacProfile,
  PlaceHvacProfileInput,
  PurchaseEvent,
  PurchaseEventCreateInput,
  PurchaseEventDeleteInput,
  PurchaseEventUpdateInput,
  CurrentQuantityUpdateInput,
  CareEvent,
  CareEventCreateInput,
  CareEventDeleteInput,
  CareEventUpdateInput,
  WeatherForecastRequest,
  WeatherForecastResponse,
  WeatherLocation,
  WeatherLocationInput,
  WearLog,
  WearLogPatch,
  WearLogInput,
} from '../lib/types'
import { demoData } from './demo-data'
import { DemoReplacementLineRepository } from './demo/replacement-lines'
import type { PurchaseRepository } from './purchase-repository'
import type { CareRepository } from './care-repository'
import type { ClosetRepository } from './repository'
import { todayInKorea } from '../lib/date'

const STORAGE_KEY = 'closet-index-demo-data-v3'
const PURCHASE_EVENT_STORAGE_KEY = 'closet-index-demo-purchase-events:v1'
const CARE_EVENT_STORAGE_KEY = 'closet-index-demo-care-events:v1'

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
    currentQuantity: null,
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
    data.placeHvacProfiles ??= []
    for (const item of data.items) item.currentQuantity ??= null
    for (const outfit of data.outfits) outfit.archivedAt ??= null
    data.places = data.places.map((place) => ({
      ...place,
      kind: place.name === '기타' ? 'generic_category' : 'specific_venue',
    }))
    data.wearLogs = data.wearLogs.map((log) => {
      const normalized = { ...log }
      normalized.temperatureSource ??= 'notion'
      normalized.weatherLocationId ??= null
      normalized.weatherIssuedAt ??= null
      normalized.weatherOverridden ??= false
      normalized.observedHvacMode ??= 'off'
      normalized.observedHvacIntensity ??= null
      normalized.observedHvacMemo ??= null
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

function readPurchaseEvents(): PurchaseEvent[] {
  try {
    const stored = window.localStorage.getItem(PURCHASE_EVENT_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as PurchaseEvent[]) : []
  } catch {
    return []
  }
}

function writePurchaseEvents(events: PurchaseEvent[]) {
  window.localStorage.setItem(PURCHASE_EVENT_STORAGE_KEY, JSON.stringify(events))
}

function readCareEvents(): CareEvent[] {
  try {
    const stored = window.localStorage.getItem(CARE_EVENT_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as CareEvent[]) : []
  } catch {
    return []
  }
}

function writeCareEvents(events: CareEvent[]) {
  window.localStorage.setItem(CARE_EVENT_STORAGE_KEY, JSON.stringify(events))
}

function sortCareEvents(events: CareEvent[]) {
  return events.sort(
    (left, right) =>
      right.caredOn.localeCompare(left.caredOn) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  )
}

function validateCareDate(caredOn: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(caredOn)) {
    throw new Error('올바른 관리 날짜를 입력해 주세요.')
  }
  const [year, month, day] = caredOn.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('올바른 관리 날짜를 입력해 주세요.')
  }
  if (caredOn > todayInKorea()) {
    throw new Error('미래 날짜에는 관리를 기록할 수 없습니다.')
  }
}

class DemoCareRepository implements CareRepository {
  async load(itemId: string) {
    return structuredClone(
      sortCareEvents(readCareEvents().filter((event) => event.itemId === itemId)),
    )
  }

  async loadForItems(itemIds: readonly string[]) {
    const ids = new Set(itemIds)
    return structuredClone(sortCareEvents(readCareEvents().filter((event) => ids.has(event.itemId))))
  }

  async create(input: CareEventCreateInput) {
    const item = readData().items.find((entry) => entry.id === input.itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    validateCareDate(input.caredOn)
    const events = readCareEvents()
    const existing = events.find((event) => event.id === input.id)
    if (existing) {
      if (
        existing.itemId === input.itemId &&
        existing.caredOn === input.caredOn &&
        existing.method === input.method
      ) {
        return structuredClone(existing)
      }
      throw new Error('이미 다른 내용으로 사용된 관리 기록 ID입니다.')
    }

    const changedAt = new Date().toISOString()
    const careEvent: CareEvent = {
      id: input.id,
      itemId: input.itemId,
      caredOn: input.caredOn,
      method: input.method,
      createdAt: changedAt,
      updatedAt: changedAt,
    }
    events.push(careEvent)
    writeCareEvents(events)
    return structuredClone(careEvent)
  }

  async update(input: CareEventUpdateInput) {
    const events = readCareEvents()
    const event = events.find((entry) => entry.id === input.eventId)
    if (!event || event.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('관리 기록이 변경되었습니다. 다시 불러와 주세요.')
    }
    validateCareDate(input.caredOn)
    event.caredOn = input.caredOn
    event.method = input.method
    event.updatedAt = new Date(
      Math.max(Date.now(), new Date(event.updatedAt).getTime() + 1),
    ).toISOString()
    writeCareEvents(events)
    return structuredClone(event)
  }

  async delete(input: CareEventDeleteInput) {
    const events = readCareEvents()
    const event = events.find((entry) => entry.id === input.eventId)
    if (!event || event.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('관리 기록이 변경되었습니다. 다시 불러와 주세요.')
    }
    writeCareEvents(events.filter((entry) => entry.id !== input.eventId))
  }
}

function validateQuantity(value: number, label: string, allowZero: boolean) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${label}은 ${allowZero ? '0' : '1'} 이상의 정수여야 합니다.`)
  }
}

function validatePurchaseDate(item: Item, purchasedOn: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) {
    throw new Error('올바른 재구매 날짜를 입력해 주세요.')
  }
  if (purchasedOn > todayInKorea()) {
    throw new Error('미래 날짜에는 재구매를 기록할 수 없습니다.')
  }
  if (item.acquiredOn && purchasedOn < item.acquiredOn) {
    throw new Error('최초 구매일보다 앞선 재구매는 기록할 수 없습니다.')
  }
}

class DemoPurchaseRepository implements PurchaseRepository {
  async load(itemId: string) {
    return structuredClone(
      readPurchaseEvents()
        .filter((event) => event.itemId === itemId)
        .sort(
          (left, right) =>
            right.purchasedOn.localeCompare(left.purchasedOn) ||
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        ),
    )
  }

  async loadForItems(itemIds: readonly string[]) {
    const ids = new Set(itemIds)
    return structuredClone(
      readPurchaseEvents()
        .filter((event) => ids.has(event.itemId))
        .sort(
          (left, right) =>
            right.purchasedOn.localeCompare(left.purchasedOn) ||
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        ),
    )
  }

  async create(input: PurchaseEventCreateInput) {
    const data = readData()
    const item = data.items.find((entry) => entry.id === input.itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    validatePurchaseDate(item, input.purchasedOn)
    validateQuantity(input.quantity, '구매 수량', false)
    if (input.currentQuantity !== null) {
      validateQuantity(input.currentQuantity, '현재 수량', true)
    }

    const events = readPurchaseEvents()
    const existing = events.find((event) => event.id === input.id)
    if (existing) {
      if (
        existing.itemId === input.itemId &&
        existing.purchasedOn === input.purchasedOn &&
        existing.quantity === input.quantity
      ) {
        return structuredClone(existing)
      }
      throw new Error('이미 다른 내용으로 사용된 재구매 기록 ID입니다.')
    }

    const changedAt = new Date().toISOString()
    const event: PurchaseEvent = {
      id: input.id,
      itemId: input.itemId,
      purchasedOn: input.purchasedOn,
      quantity: input.quantity,
      createdAt: changedAt,
      updatedAt: changedAt,
    }
    if (input.currentQuantity !== null) {
      item.currentQuantity = input.currentQuantity
    }
    events.push(event)
    writeData(data)
    writePurchaseEvents(events)
    return structuredClone(event)
  }

  async update(input: PurchaseEventUpdateInput) {
    const events = readPurchaseEvents()
    const event = events.find((entry) => entry.id === input.eventId)
    if (!event || event.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('재구매 기록이 변경되었습니다. 다시 불러와 주세요.')
    }
    const item = readData().items.find((entry) => entry.id === event.itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    validatePurchaseDate(item, input.purchasedOn)
    validateQuantity(input.quantity, '구매 수량', false)
    event.purchasedOn = input.purchasedOn
    event.quantity = input.quantity
    event.updatedAt = new Date(
      Math.max(Date.now(), new Date(event.updatedAt).getTime() + 1),
    ).toISOString()
    writePurchaseEvents(events)
    return structuredClone(event)
  }

  async delete(input: PurchaseEventDeleteInput) {
    const events = readPurchaseEvents()
    const event = events.find((entry) => entry.id === input.eventId)
    if (!event || event.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('재구매 기록이 변경되었습니다. 다시 불러와 주세요.')
    }
    writePurchaseEvents(events.filter((entry) => entry.id !== input.eventId))
  }

  async setCurrentQuantity(input: CurrentQuantityUpdateInput) {
    if (input.currentQuantity !== null) {
      validateQuantity(input.currentQuantity, '현재 수량', true)
    }
    const data = readData()
    const item = data.items.find((entry) => entry.id === input.itemId)
    if (!item) throw new Error('Item을 찾을 수 없습니다.')
    item.currentQuantity = input.currentQuantity
    writeData(data)
    return input.currentQuantity
  }
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
  readonly replacementLines = new DemoReplacementLineRepository((itemId) =>
    readData().items.some((item) => item.id === itemId),
  )
  readonly purchases = new DemoPurchaseRepository()
  readonly care = new DemoCareRepository()

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
      currentQuantity: current.currentQuantity ?? null,
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
    writePurchaseEvents(
      readPurchaseEvents().filter((event) => event.itemId !== itemId),
    )
    writeCareEvents(readCareEvents().filter((event) => event.itemId !== itemId))
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
      rating: 'ok',
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

  async updateOutfit(
    outfitId: string,
    input: OutfitUpdateInput,
  ): Promise<Outfit> {
    const data = readData()
    const outfit = data.outfits.find((entry) => entry.id === outfitId)
    if (!outfit) throw new Error('Outfit을 찾을 수 없습니다.')
    if (input.items.length === 0) {
      throw new Error('Outfit에는 Item이 하나 이상 필요합니다.')
    }

    const itemIds = input.items.map((item) => item.itemId)
    if (new Set(itemIds).size !== itemIds.length) {
      throw new Error('같은 Item을 Outfit에 두 번 넣을 수 없습니다.')
    }
    if (
      itemIds.some(
        (itemId) => !data.items.some((item) => item.id === itemId),
      )
    ) {
      throw new Error('Outfit Item을 찾을 수 없습니다.')
    }
    const duplicate = data.outfits.some(
      (entry) =>
        entry.id !== outfitId &&
        itemSetKey(entry.itemIds) === itemSetKey(itemIds),
    )
    if (!input.allowDuplicate && duplicate) {
      throw new Error('같은 Item 조합의 Outfit이 이미 있습니다.')
    }

    outfit.displayName = input.displayName?.trim() || null
    outfit.rating = input.rating
    outfit.itemIds = itemIds
    outfit.itemPlacements = input.items.map((item) => ({
      itemId: item.itemId,
      slot: item.slot,
      positionX: item.positionX,
      positionY: item.positionY,
      itemScale: item.itemScale,
      zIndex: item.zIndex,
    }))
    writeData(data)
    return outfit
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

  async savePlaceHvacProfile(input: PlaceHvacProfileInput) {
    const data = readData()
    const existingIndex = data.placeHvacProfiles.findIndex(
      (profile) =>
        profile.placeId === input.placeId && profile.season === input.season,
    )
    const existing = existingIndex >= 0 ? data.placeHvacProfiles[existingIndex] : null
    const profile: PlaceHvacProfile = {
      ...input,
      workspaceId: 'demo-workspace',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }

    if (existingIndex >= 0) data.placeHvacProfiles[existingIndex] = profile
    else data.placeHvacProfiles.push(profile)
    writeData(data)
    return profile
  }

  async updateWearLogFields(id: string, patch: WearLogPatch) {
    const data = readData()
    const index = data.wearLogs.findIndex((log) => log.id === id)
    if (index < 0) throw new Error('착용 기록을 찾을 수 없습니다.')
    if (Object.keys(patch).length === 0) {
      throw new Error('변경된 Wear Log 필드가 없습니다.')
    }

    const log: WearLog = {
      ...data.wearLogs[index],
      ...patch,
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
