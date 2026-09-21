import { isCompleteRecommendationOutfit } from './complete-outfit'
import { temperatureRangeFor } from './temperature-range'
import type { AppData, ItemTemperatureEvidence, WearLog } from './types'

export interface ClosetItemTemperatureEvidence
  extends ItemTemperatureEvidence {
  okTemperatures: number[]
}

interface ItemEvidenceAccumulator {
  okTemperatures: number[]
  wearLogIds: Set<string>
  lastWornOn: string | null
}

function okTemperaturesFor(log: WearLog) {
  const temperatures: number[] = []

  if (log.tempOut !== null && log.feelingOut === 'ok') {
    temperatures.push(log.tempOut)
  }

  if (
    log.tempBack !== null &&
    log.feelingBack === 'ok' &&
    !temperatures.includes(log.tempBack)
  ) {
    temperatures.push(log.tempBack)
  }

  return temperatures
}

export function buildItemTemperatureEvidenceIndex(
  data: Pick<AppData, 'items' | 'outfits' | 'wearLogs'>,
) {
  const itemById = new Map(data.items.map((item) => [item.id, item]))
  const logsByOutfitId = new Map<string, WearLog[]>()
  const accumulators = new Map<string, ItemEvidenceAccumulator>()

  for (const log of data.wearLogs) {
    const logs = logsByOutfitId.get(log.outfitId)
    if (logs) logs.push(log)
    else logsByOutfitId.set(log.outfitId, [log])
  }

  for (const outfit of data.outfits) {
    if (outfit.rating === 'error') continue

    const items = outfit.itemIds
      .map((itemId) => itemById.get(itemId))
      .filter((item) => item !== undefined)

    if (!isCompleteRecommendationOutfit(items)) {
      continue
    }

    for (const log of logsByOutfitId.get(outfit.id) ?? []) {
      const temperatures = okTemperaturesFor(log)
      if (temperatures.length === 0) continue

      for (const item of items) {
        const accumulator = accumulators.get(item.id) ?? {
          okTemperatures: [],
          wearLogIds: new Set<string>(),
          lastWornOn: null,
        }
        accumulator.okTemperatures.push(...temperatures)
        accumulator.wearLogIds.add(log.id)
        if (
          accumulator.lastWornOn === null ||
          log.wornOn > accumulator.lastWornOn
        ) {
          accumulator.lastWornOn = log.wornOn
        }
        accumulators.set(item.id, accumulator)
      }
    }
  }

  const evidenceByItemId = new Map<string, ClosetItemTemperatureEvidence>()

  for (const [itemId, accumulator] of accumulators) {
    const item = itemById.get(itemId)
    if (!item || accumulator.okTemperatures.length === 0) continue

    const okRange = temperatureRangeFor(accumulator.okTemperatures)
    if (!okRange) continue

    evidenceByItemId.set(itemId, {
      itemId,
      itemName: item.name,
      category: item.category,
      wearCount: accumulator.wearLogIds.size,
      lastWornOn: accumulator.lastWornOn,
      okRange,
      okObservationCount: accumulator.okTemperatures.length,
      okTemperatures: accumulator.okTemperatures,
    })
  }

  return evidenceByItemId
}

export function itemHasTemperatureEvidenceAt(
  evidence: ClosetItemTemperatureEvidence,
  targetTemperature: number,
) {
  return evidence.okTemperatures.includes(targetTemperature)
}
