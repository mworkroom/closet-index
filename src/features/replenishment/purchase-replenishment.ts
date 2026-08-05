import type { Item, Outfit, PurchaseEvent, WearLog } from '../../lib/types'

export type PurchaseReplacementMetric = 'wear_count' | 'elapsed_days'

export interface PurchaseReplacementRule {
  category: 'Top-T-shirts-innerwear' | 'Socks' | 'Innerwear'
  metric: PurchaseReplacementMetric
  threshold: number
}

export interface PurchaseCycleStatus extends PurchaseReplacementRule {
  basisDate: string | null
  currentValue: number | null
  remaining: number | null
  due: boolean
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

function normalizeCategory(category: string) {
  return category.trim().replace(/\s+/gu, '').toLocaleLowerCase('en-US')
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return timestamp
}

export function getPurchaseReplacementRule(
  category: string,
): PurchaseReplacementRule | null {
  const normalized = normalizeCategory(category)
  if (normalized === 'top-t-shirts-innerwear') {
    return {
      category: 'Top-T-shirts-innerwear',
      metric: 'wear_count',
      threshold: 60,
    }
  }
  if (normalized === 'socks') {
    return { category: 'Socks', metric: 'wear_count', threshold: 30 }
  }
  if (normalized === 'innerwear') {
    return { category: 'Innerwear', metric: 'elapsed_days', threshold: 730 }
  }
  return null
}

export function getPurchaseCycleBasisDate(
  item: Pick<Item, 'acquiredOn'>,
  events: readonly Pick<PurchaseEvent, 'purchasedOn'>[],
  today: string,
) {
  return [item.acquiredOn, ...events.map((event) => event.purchasedOn)]
    .filter((date): date is string => Boolean(date))
    .filter((date) => parseCalendarDate(date) !== null && date <= today)
    .sort()
    .at(-1) ?? null
}

export function getElapsedCalendarDays(from: string, to: string) {
  const fromTimestamp = parseCalendarDate(from)
  const toTimestamp = parseCalendarDate(to)
  if (fromTimestamp === null || toTimestamp === null || fromTimestamp > toTimestamp) {
    return null
  }
  return Math.floor((toTimestamp - fromTimestamp) / DAY_IN_MILLISECONDS)
}

export function getPurchaseCycleStatus({
  item,
  events,
  outfits,
  wearLogs,
  today,
}: {
  item: Item
  events: readonly PurchaseEvent[]
  outfits: readonly Outfit[]
  wearLogs: readonly WearLog[]
  today: string
}): PurchaseCycleStatus | null {
  if (item.retired) return null
  const rule = getPurchaseReplacementRule(item.category)
  if (!rule) return null

  const basisDate = getPurchaseCycleBasisDate(item, events, today)
  if (rule.metric === 'elapsed_days') {
    const currentValue = basisDate
      ? getElapsedCalendarDays(basisDate, today)
      : null
    return {
      ...rule,
      basisDate,
      currentValue,
      remaining:
        currentValue === null ? null : Math.max(0, rule.threshold - currentValue),
      due: currentValue !== null && currentValue >= rule.threshold,
    }
  }

  const itemOutfitIds = new Set(
    outfits
      .filter((outfit) => outfit.itemIds.includes(item.id))
      .map((outfit) => outfit.id),
  )
  const currentValue = wearLogs.filter(
    (log) =>
      itemOutfitIds.has(log.outfitId) &&
      (!basisDate || log.wornOn >= basisDate),
  ).length

  return {
    ...rule,
    basisDate,
    currentValue,
    remaining: Math.max(0, rule.threshold - currentValue),
    due: currentValue >= rule.threshold,
  }
}
