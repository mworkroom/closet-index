import {
  DEFAULT_STATISTICS_FILTERS,
  isStatisticsCategoryId,
  type StatisticsFilters,
} from './statistics-calculations'
import { isSeason, type Season } from '../../lib/seasons'

export type StatisticsItemListKind = 'most-worn' | 'unworn'

export function createStatisticsItemListUrl(
  kind: StatisticsItemListKind,
  filters: StatisticsFilters,
) {
  const params = new URLSearchParams()
  params.set('result', kind)
  params.set(
    'period',
    filters.period.kind === 'lifetime'
      ? 'lifetime'
      : String(filters.period.year),
  )
  for (const season of filters.seasons) params.append('season', season)
  for (const category of filters.categories) {
    params.append('category', category)
  }
  return `/statistics/items?${params.toString()}`
}

export function readStatisticsItemListSearchParams(
  params: URLSearchParams,
): {
  kind: StatisticsItemListKind
  filters: StatisticsFilters
} {
  const periodValue = params.get('period')
  const parsedYear = Number(periodValue)
  const period =
    periodValue &&
    periodValue !== 'lifetime' &&
    Number.isInteger(parsedYear) &&
    parsedYear >= 1900 &&
    parsedYear <= 9999
      ? ({ kind: 'year', year: parsedYear } as const)
      : DEFAULT_STATISTICS_FILTERS.period
  const seasons = params
    .getAll('season')
    .filter(
      (value): value is Season =>
        typeof value === 'string' && isSeason(value),
    )
  const categories = params
    .getAll('category')
    .filter(
      (value) =>
        typeof value === 'string' && isStatisticsCategoryId(value),
    )

  return {
    kind: params.get('result') === 'unworn' ? 'unworn' : 'most-worn',
    filters: {
      period,
      seasons: [...new Set(seasons)],
      categories: [...new Set(categories)],
    },
  }
}
