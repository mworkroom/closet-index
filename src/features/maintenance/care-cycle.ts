import type { CareEvent, CareMethod, Item, Outfit, WearLog } from '../../lib/types'

export interface CareRule {
  method: CareMethod
  label: '손세탁' | '드라이클리닝'
  threshold: 5 | 10
}

export interface CareCycleStatus extends CareRule {
  basisDate: string | null
  currentValue: number
  remaining: number
  due: boolean
  reason: string
}

const CARE_RULES: Record<CareMethod, CareRule> = {
  hand_wash: { method: 'hand_wash', label: '손세탁', threshold: 5 },
  dry_cleaning: {
    method: 'dry_cleaning',
    label: '드라이클리닝',
    threshold: 10,
  },
}

function normalizeCategory(category: string) {
  return category.trim().replace(/\s+/gu, '').toLocaleLowerCase('en-US')
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  )
}

export function getCareRule(category: string): CareRule | null {
  const normalized = normalizeCategory(category)
  if (normalized === 'bags-made') return null
  if (normalized.includes('made')) return CARE_RULES.hand_wash
  if (normalized.includes('outer')) return CARE_RULES.dry_cleaning
  if (normalized.includes('knitwear')) return CARE_RULES.dry_cleaning
  return null
}

export function getLatestCareDate(
  events: readonly Pick<CareEvent, 'caredOn'>[],
  today: string,
) {
  return events
    .map((event) => event.caredOn)
    .filter((date) => isCalendarDate(date) && date <= today)
    .sort()
    .at(-1) ?? null
}

export function getCareCycleStatus({
  item,
  events,
  outfits,
  wearLogs,
  today,
}: {
  item: Item
  events: readonly CareEvent[]
  outfits: readonly Outfit[]
  wearLogs: readonly WearLog[]
  today: string
}): CareCycleStatus | null {
  if (item.retired) return null
  const rule = getCareRule(item.category)
  if (!rule) return null

  const basisDate = getLatestCareDate(events, today)
  const outfitIds = new Set(
    outfits
      .filter((outfit) => outfit.itemIds.includes(item.id))
      .map((outfit) => outfit.id),
  )
  const currentValue = wearLogs.filter(
    (log) => outfitIds.has(log.outfitId) && (!basisDate || log.wornOn > basisDate),
  ).length

  return {
    ...rule,
    basisDate,
    currentValue,
    remaining: Math.max(0, rule.threshold - currentValue),
    due: currentValue >= rule.threshold,
    reason: basisDate
      ? `최근 ${rule.label} 이후 ${currentValue}회 착용`
      : `관리 이력 없이 ${currentValue}회 착용`,
  }
}

export function careMethodLabel(method: CareMethod) {
  return CARE_RULES[method].label
}
