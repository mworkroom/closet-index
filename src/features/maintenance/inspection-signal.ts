import type { Item, Outfit, WearLog } from '../../lib/types'

export interface ItemInspectionSignal {
  kind: 'inspection'
  label: '점검' | '정리 후보'
  reason: string
  wearCount: number
  lastWornOn: string | null
}

interface CalendarDate {
  year: number
  month: number
  day: number
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null
  return { year, month, day }
}

export function getCompletedCalendarMonths(from: string, to: string) {
  const start = parseCalendarDate(from)
  const end = parseCalendarDate(to)
  if (!start || !end || from > to) return null
  const monthDifference =
    (end.year - start.year) * 12 + end.month - start.month
  return monthDifference - (end.day < start.day ? 1 : 0)
}

export function formatInspectionElapsedTime(months: number) {
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (years === 0) return `${remainingMonths}개월 전`
  if (remainingMonths === 0) return `${years}년 전`
  return `${years}년 ${remainingMonths}개월 전`
}

export function getItemInspectionSignals({
  items,
  outfits,
  wearLogs,
  today,
}: {
  items: readonly Item[]
  outfits: readonly Outfit[]
  wearLogs: readonly WearLog[]
  today: string
}): ReadonlyMap<string, ItemInspectionSignal> {
  const itemIdsByOutfit = new Map<string, readonly string[]>(
    outfits.map((outfit) => [outfit.id, outfit.itemIds]),
  )
  const wearSummaryByItem = new Map<
    string,
    { wearCount: number; lastWornOn: string | null }
  >()

  for (const log of wearLogs) {
    for (const itemId of itemIdsByOutfit.get(log.outfitId) ?? []) {
      const current = wearSummaryByItem.get(itemId) ?? {
        wearCount: 0,
        lastWornOn: null,
      }
      current.wearCount += 1
      if (!current.lastWornOn || log.wornOn > current.lastWornOn) {
        current.lastWornOn = log.wornOn
      }
      wearSummaryByItem.set(itemId, current)
    }
  }

  const signals = new Map<string, ItemInspectionSignal>()
  for (const item of items) {
    if (
      item.retired ||
      item.category.trim().toLocaleLowerCase('en-US').includes('innerwear')
    ) {
      continue
    }

    const summary = wearSummaryByItem.get(item.id) ?? {
      wearCount: 0,
      lastWornOn: null,
    }
    if (summary.wearCount === 0) {
      signals.set(item.id, {
        kind: 'inspection',
        label: '점검',
        reason: '착용 기록 0회',
        ...summary,
      })
      continue
    }

    if (!summary.lastWornOn) continue
    const elapsedMonths = getCompletedCalendarMonths(summary.lastWornOn, today)
    if (elapsedMonths === null || elapsedMonths < 24) continue
    signals.set(item.id, {
      kind: 'inspection',
      label: elapsedMonths >= 36 ? '정리 후보' : '점검',
      reason: `마지막 착용 ${formatInspectionElapsedTime(elapsedMonths)}`,
      ...summary,
    })
  }

  return signals
}
