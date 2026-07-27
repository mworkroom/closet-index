import type { Item, Outfit } from './types'

export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const

export type Season = (typeof SEASONS)[number]

export const seasonLabels: Record<Season, string> = {
  Spring: '봄',
  Summer: '여름',
  Fall: '가을',
  Winter: '겨울',
}

const accessoryCategoryPrefixes = [
  'acc-',
  'accessory',
  'accessories',
  'bag',
  'bags',
]

export function isSeason(value: string): value is Season {
  return SEASONS.includes(value as Season)
}

export function normalizeSeasonScope(values: unknown): Season[] {
  if (!Array.isArray(values)) return []
  const selected = new Set(
    values.filter((value): value is Season =>
      typeof value === 'string' && isSeason(value),
    ),
  )
  return SEASONS.filter((season) => selected.has(season))
}

export function itemMatchesSeasonScope(
  item: Item,
  activeSeasons: readonly Season[],
) {
  return (
    activeSeasons.length === 0 ||
    item.seasons.some(
      (season) => isSeason(season) && activeSeasons.includes(season),
    )
  )
}

export function isSeasonDefiningItem(item: Item) {
  const category = item.category.trim().toLocaleLowerCase('en')
  return !accessoryCategoryPrefixes.some((prefix) =>
    category.startsWith(prefix),
  )
}

export function outfitMatchesSeasonScope(
  outfit: Outfit,
  items: readonly Item[],
  activeSeasons: readonly Season[],
) {
  if (activeSeasons.length === 0) return true

  return outfit.itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item))
    .filter(isSeasonDefiningItem)
    .some((item) => itemMatchesSeasonScope(item, activeSeasons))
}

export function formatSeasonScope(activeSeasons: readonly Season[]) {
  if (activeSeasons.length === 0) return '전체 계절'
  return activeSeasons.map((season) => seasonLabels[season]).join(' · ')
}
