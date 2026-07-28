import type {
  OutfitItemPositionInput,
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

function cloneDemoData() {
  return structuredClone(demoData)
}

function readData() {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return cloneDemoData()

  try {
    const data = JSON.parse(stored) as typeof demoData
    data.weatherLocations ??= structuredClone(demoData.weatherLocations)
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

export class DemoRepository implements ClosetRepository {
  async load() {
    return readData()
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

  async updateOutfitItemPosition(input: OutfitItemPositionInput) {
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
      existing.positionX = input.positionX
      existing.positionY = input.positionY
      existing.itemScale = input.itemScale
    } else {
      outfit.itemPlacements.push({
        itemId: input.itemId,
        slot: null,
        positionX: input.positionX,
        positionY: input.positionY,
        itemScale: input.itemScale,
        zIndex: null,
      })
    }
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
