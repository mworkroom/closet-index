import type { CareEvent, Item, Outfit, PurchaseEvent, WearLog } from '../../lib/types'
import { getPurchaseCycleStatus, type PurchaseCycleStatus } from '../replenishment/purchase-replenishment'
import { getCareCycleStatus, type CareCycleStatus } from './care-cycle'
import { getItemInspectionSignals, type ItemInspectionSignal } from './inspection-signal'

export type ManagementBadgeLabel =
  | '점검'
  | '정리 후보'
  | '교체'
  | '손세탁'
  | '드라이클리닝'

export interface ItemMaintenanceSignals {
  inspection: ItemInspectionSignal | null
  declutter: ItemInspectionSignal | null
  replacement: PurchaseCycleStatus | null
  care: CareCycleStatus | null
  primaryBadge: ManagementBadgeLabel | null
  allBadges: ManagementBadgeLabel[]
}

function groupByItemId<T extends { itemId: string }>(events: readonly T[]) {
  const grouped = new Map<string, T[]>()
  for (const event of events) {
    const current = grouped.get(event.itemId) ?? []
    current.push(event)
    grouped.set(event.itemId, current)
  }
  return grouped
}

export function getReplacementReason(cycle: PurchaseCycleStatus) {
  return cycle.metric === 'wear_count'
    ? `최근 구매 이후 ${cycle.currentValue ?? 0}회 착용`
    : `최근 구매 이후 ${cycle.currentValue ?? 0}일 경과`
}

export function getManagementBadgeClass(label: ManagementBadgeLabel) {
  if (label === '점검') return 'warning'
  if (label === '정리 후보') return 'declutter'
  if (label === '교체') return 'error'
  return label === '손세탁' ? 'hand_wash' : 'dry_cleaning'
}

export function getMaintenanceSignals({
  items,
  outfits,
  wearLogs,
  purchaseEvents,
  careEvents,
  today,
  purchaseEventsAvailable = true,
  careEventsAvailable = true,
}: {
  items: readonly Item[]
  outfits: readonly Outfit[]
  wearLogs: readonly WearLog[]
  purchaseEvents: readonly PurchaseEvent[]
  careEvents: readonly CareEvent[]
  today: string
  purchaseEventsAvailable?: boolean
  careEventsAvailable?: boolean
}): ReadonlyMap<string, ItemMaintenanceSignals> {
  const inspectionSignals = getItemInspectionSignals({ items, outfits, wearLogs, today })
  const purchaseEventsByItem = groupByItemId(purchaseEvents)
  const careEventsByItem = groupByItemId(careEvents)
  const signals = new Map<string, ItemMaintenanceSignals>()

  for (const item of items) {
    const reviewSignal = inspectionSignals.get(item.id) ?? null
    const inspection = reviewSignal?.label === '점검' ? reviewSignal : null
    const declutter = reviewSignal?.label === '정리 후보' ? reviewSignal : null
    const replacement = purchaseEventsAvailable
      ? getPurchaseCycleStatus({
          item,
          events: purchaseEventsByItem.get(item.id) ?? [],
          outfits,
          wearLogs,
          today,
        })
      : null
    const care = careEventsAvailable
      ? getCareCycleStatus({
          item,
          events: careEventsByItem.get(item.id) ?? [],
          outfits,
          wearLogs,
          today,
        })
      : null
    const allBadges: ManagementBadgeLabel[] = []
    if (inspection) allBadges.push('점검')
    if (declutter) allBadges.push('정리 후보')
    if (replacement?.due) allBadges.push('교체')
    if (care?.due) allBadges.push(care.label)
    signals.set(item.id, {
      inspection,
      declutter,
      replacement,
      care,
      primaryBadge: allBadges[0] ?? null,
      allBadges,
    })
  }

  return signals
}
