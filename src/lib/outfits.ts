import type { Item, Outfit, WearLog } from './types'
import { sortItemsForOutfitDisplay } from './item-categories'

export function outfitLabel(outfit: Outfit, items: Item[]): string {
  if (outfit.displayName?.trim()) return outfit.displayName

  const names = sortItemsForOutfitDisplay(
    outfit.itemIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is Item => Boolean(item)),
  ).map((item) => item.name)

  if (names.length === 0) return '구성 아이템 없음'
  if (names.length <= 3) return names.join(' + ')
  return `${names.slice(0, 3).join(' + ')} 외 ${names.length - 3}개`
}

export function getOutfitStats(outfitId: string, wearLogs: WearLog[]) {
  const logs = wearLogs
    .filter((log) => log.outfitId === outfitId)
    .sort((a, b) => b.wornOn.localeCompare(a.wornOn))

  return {
    wearCount: logs.length,
    lastWornOn: logs[0]?.wornOn ?? null,
  }
}

export function getItemStats(
  itemId: string,
  outfits: Outfit[],
  wearLogs: WearLog[],
) {
  const outfitIds = new Set(
    outfits.filter((outfit) => outfit.itemIds.includes(itemId)).map((outfit) => outfit.id),
  )
  const logs = wearLogs
    .filter((log) => outfitIds.has(log.outfitId))
    .sort((a, b) => b.wornOn.localeCompare(a.wornOn))
  const monthlyWearCounts = Array.from({ length: 12 }, () => 0)
  for (const log of logs) {
    const month = Number(log.wornOn.slice(5, 7))
    if (month >= 1 && month <= 12) monthlyWearCounts[month - 1] += 1
  }
  const wornMonthCount = monthlyWearCounts.filter(
    (count) => count > 0,
  ).length

  return {
    wearCount: logs.length,
    lastWornOn: logs[0]?.wornOn ?? null,
    firstWornOn: logs.at(-1)?.wornOn ?? null,
    monthlyWearCounts,
    wornMonthCount,
    isYearRound: wornMonthCount === 12,
  }
}
