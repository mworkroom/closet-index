import {
  getItemCategoryGroupId,
  isMadeItemCategory,
  type ItemCategoryGroupId,
} from '../../lib/item-categories'
import { todayInKorea } from '../../lib/date'
import { isSeason, type Season } from '../../lib/seasons'
import type { AppData, Item, WearLog } from '../../lib/types'

export interface StatisticsSnapshot {
  items: AppData['items']
  outfits: AppData['outfits']
  wearLogs: AppData['wearLogs']
  places: AppData['places']
  transportModes: AppData['transportModes']
}

export type StatisticsPeriod =
  | { kind: 'lifetime' }
  | { kind: 'year'; year: number }

export type StatisticsCategoryId =
  | 'outer'
  | 'top'
  | 'bottom'
  | 'dress'
  | 'shoes'
  | 'bag'
  | 'made'

export interface StatisticsFilters {
  period: StatisticsPeriod
  seasons: Season[]
  categories: StatisticsCategoryId[]
}

export interface StatisticsItemRow {
  item: Item
  wearCount: number
  lastWornOn: string | null
  firstWornOn: string | null
  monthlyWearCounts: number[]
  wornMonthCount: number
  isYearRound: boolean
}

export const STATISTICS_CATEGORY_OPTIONS: ReadonlyArray<{
  id: StatisticsCategoryId
  label: string
}> = [
  { id: 'outer', label: 'Outer' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'dress', label: 'Dress' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'bag', label: 'Bag' },
  { id: 'made', label: 'Made' },
]

const wearableGroupIds = new Set<ItemCategoryGroupId>([
  'outer',
  'top',
  'bottom',
  'dress',
  'shoes',
  'bag',
])

const categoryOptionIds = new Set(
  STATISTICS_CATEGORY_OPTIONS.map((option) => option.id),
)

export const DEFAULT_STATISTICS_FILTERS: StatisticsFilters = {
  period: { kind: 'lifetime' },
  seasons: [],
  categories: [],
}

export function isStatisticsCategoryId(
  value: string,
): value is StatisticsCategoryId {
  return categoryOptionIds.has(value as StatisticsCategoryId)
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

export function getStatisticsYears(
  snapshot: StatisticsSnapshot,
  today = todayInKorea(),
) {
  const currentYear = Number(today.slice(0, 4))
  const years = new Set<number>([currentYear])

  for (const log of snapshot.wearLogs) {
    const year = Number(log.wornOn.slice(0, 4))
    if (Number.isInteger(year) && year <= currentYear) years.add(year)
  }
  for (const item of snapshot.items) {
    const year = Number(item.acquiredOn?.slice(0, 4))
    if (Number.isInteger(year) && year <= currentYear) years.add(year)
  }

  return [...years].sort((left, right) => right - left)
}

function getItemStatisticsCategoryIds(item: Pick<Item, 'category'>) {
  const ids = new Set<StatisticsCategoryId>()
  const groupId = getItemCategoryGroupId(item.category)
  if (wearableGroupIds.has(groupId)) {
    ids.add(groupId as Exclude<StatisticsCategoryId, 'made'>)
  }
  if (isMadeItemCategory(item)) {
    ids.add('made')
  }
  return ids
}

function itemMatchesCategories(
  item: Pick<Item, 'category'>,
  categories: readonly StatisticsCategoryId[],
) {
  const itemCategoryIds = getItemStatisticsCategoryIds(item)
  if (itemCategoryIds.size === 0) return false
  return (
    categories.length === 0 ||
    categories.some((category) => itemCategoryIds.has(category))
  )
}

function itemMatchesSeasons(
  item: Pick<Item, 'seasons'>,
  seasons: readonly Season[],
) {
  return (
    seasons.length === 0 ||
    item.seasons.some(
      (season) => isSeason(season) && seasons.includes(season),
    )
  )
}

function getPeriodBounds(period: StatisticsPeriod, today: string) {
  if (period.kind === 'lifetime') {
    return { start: null, end: today }
  }

  const currentYear = Number(today.slice(0, 4))
  return {
    start: `${period.year}-01-01`,
    end: period.year === currentYear ? today : `${period.year}-12-31`,
  }
}

function dateFallsInPeriod(
  date: string,
  bounds: ReturnType<typeof getPeriodBounds>,
) {
  return (!bounds.start || date >= bounds.start) && date <= bounds.end
}

function buildItemWearLogs(snapshot: StatisticsSnapshot, today: string) {
  const outfitItems = new Map(
    snapshot.outfits.map((outfit) => [outfit.id, new Set(outfit.itemIds)]),
  )
  const itemWearLogs = new Map<string, WearLog[]>()

  for (const log of snapshot.wearLogs) {
    if (log.wornOn > today) continue
    const itemIds = outfitItems.get(log.outfitId)
    if (!itemIds) continue
    for (const itemId of itemIds) {
      const logs = itemWearLogs.get(itemId) ?? []
      logs.push(log)
      itemWearLogs.set(itemId, logs)
    }
  }

  return itemWearLogs
}

function toItemRow(
  item: Item,
  allLogs: readonly WearLog[],
  selectedLogs: readonly WearLog[],
): StatisticsItemRow {
  const selectedDates = selectedLogs
    .map((log) => log.wornOn)
    .sort((left, right) => left.localeCompare(right))
  const allDates = allLogs
    .map((log) => log.wornOn)
    .sort((left, right) => left.localeCompare(right))
  const monthlyWearCounts = Array.from({ length: 12 }, () => 0)

  for (const date of allDates) {
    const month = Number(date.slice(5, 7))
    if (month >= 1 && month <= 12) monthlyWearCounts[month - 1] += 1
  }

  const wornMonthCount = monthlyWearCounts.filter((count) => count > 0).length
  return {
    item,
    wearCount: selectedDates.length,
    lastWornOn: selectedDates.at(-1) ?? null,
    firstWornOn: allDates[0] ?? null,
    monthlyWearCounts,
    wornMonthCount,
    isYearRound: wornMonthCount === 12,
  }
}

function sortItemRows(rows: StatisticsItemRow[]) {
  return rows.sort(
    (left, right) =>
      right.wearCount - left.wearCount ||
      (right.lastWornOn ?? '').localeCompare(left.lastWornOn ?? '') ||
      left.item.name.localeCompare(right.item.name, 'ko'),
  )
}

export function calculateStatistics(
  snapshot: StatisticsSnapshot,
  filters: StatisticsFilters = DEFAULT_STATISTICS_FILTERS,
  today = todayInKorea(),
) {
  const bounds = getPeriodBounds(filters.period, today)
  const currentYear = Number(today.slice(0, 4))
  const isPastYear =
    filters.period.kind === 'year' && filters.period.year < currentYear
  const itemWearLogs = buildItemWearLogs(snapshot, today)
  const scopedItems = snapshot.items.filter(
    (item) =>
      itemMatchesCategories(item, filters.categories) &&
      itemMatchesSeasons(item, filters.seasons),
  )
  const selectedLogsByItem = new Map<string, WearLog[]>()
  const rowsByItem = new Map<string, StatisticsItemRow>()

  for (const item of scopedItems) {
    const allLogs = itemWearLogs.get(item.id) ?? []
    const selectedLogs = allLogs.filter((log) =>
      dateFallsInPeriod(log.wornOn, bounds),
    )
    selectedLogsByItem.set(item.id, selectedLogs)
    rowsByItem.set(item.id, toItemRow(item, allLogs, selectedLogs))
  }

  const activeScopedItems = scopedItems.filter((item) => !item.retired)
  const excludedUnknownAcquiredItems = activeScopedItems.filter(
    (item) => isPastYear && !item.acquiredOn,
  )
  const targetItems = activeScopedItems.filter((item) => {
    if (!item.acquiredOn) return !isPastYear
    return item.acquiredOn <= bounds.end
  })
  const usedItems = targetItems.filter(
    (item) => (selectedLogsByItem.get(item.id)?.length ?? 0) > 0,
  )
  const mostWornRows = sortItemRows(
    scopedItems
      .map((item) => rowsByItem.get(item.id)!)
      .filter((row) => row.wearCount > 0),
  )
  const unwornRows = targetItems
    .filter((item) => (selectedLogsByItem.get(item.id)?.length ?? 0) === 0)
    .map((item) => rowsByItem.get(item.id)!)
    .sort(
      (left, right) =>
        (right.item.acquiredOn ?? '').localeCompare(
          left.item.acquiredOn ?? '',
        ) || left.item.name.localeCompare(right.item.name, 'ko'),
    )
  const categoryOptions =
    filters.categories.length > 0
      ? STATISTICS_CATEGORY_OPTIONS.filter((option) =>
          filters.categories.includes(option.id),
        )
      : STATISTICS_CATEGORY_OPTIONS
  const categoryRows = categoryOptions
    .map((option) => ({
      ...option,
      activeCount: targetItems.filter((item) =>
        getItemStatisticsCategoryIds(item).has(option.id),
      ).length,
    }))
    .filter((row) => row.activeCount > 0)

  return {
    period: {
      ...bounds,
      isLifetime: filters.period.kind === 'lifetime',
      year: filters.period.kind === 'year' ? filters.period.year : null,
    },
    summary: {
      targetItemCount: targetItems.length,
      usedItemCount: usedItems.length,
      utilizationRate:
        targetItems.length === 0 ? null : usedItems.length / targetItems.length,
      excludedUnknownAcquiredCount: excludedUnknownAcquiredItems.length,
    },
    mostWornRows,
    unwornRows,
    categoryRows,
    itemRows: scopedItems.map((item) => rowsByItem.get(item.id)!),
  }
}
