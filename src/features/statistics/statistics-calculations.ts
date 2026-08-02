import { getItemCategoryStatistics } from '../../lib/item-categories'
import { getItemStats, getOutfitStats } from '../../lib/outfits'
import type { AppData } from '../../lib/types'

export interface StatisticsSnapshot {
  items: AppData['items']
  outfits: AppData['outfits']
  wearLogs: AppData['wearLogs']
  places: AppData['places']
  transportModes: AppData['transportModes']
}

export function selectStatisticsSnapshot(data: AppData): StatisticsSnapshot {
  return {
    items: data.items,
    outfits: data.outfits,
    wearLogs: data.wearLogs,
    places: data.places,
    transportModes: data.transportModes,
  }
}

export function calculateStatistics(snapshot: StatisticsSnapshot) {
  const outfitRows = snapshot.outfits
    .map((outfit) => ({
      outfit,
      ...getOutfitStats(outfit.id, snapshot.wearLogs),
    }))
    .sort(
      (a, b) =>
        b.wearCount - a.wearCount ||
        (b.lastWornOn ?? '').localeCompare(a.lastWornOn ?? ''),
    )
  const itemRows = snapshot.items
    .map((item) => ({
      item,
      ...getItemStats(item.id, snapshot.outfits, snapshot.wearLogs),
    }))
    .sort(
      (a, b) =>
        b.wearCount - a.wearCount ||
        (b.lastWornOn ?? '').localeCompare(a.lastWornOn ?? ''),
    )
  const categoryGroups = getItemCategoryStatistics(snapshot.items)

  return {
    summary: {
      wearLogCount: snapshot.wearLogs.length,
      outfitCount: snapshot.outfits.length,
      itemCount: snapshot.items.length,
    },
    outfitRows,
    itemRows,
    categoryGroups,
    detailedCategoryCount: categoryGroups.reduce(
      (total, group) => total + group.categories.length,
      0,
    ),
  }
}
