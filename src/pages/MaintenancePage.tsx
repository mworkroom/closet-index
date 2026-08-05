import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  getMaintenanceSignals,
  getReplacementReason,
  type ManagementBadgeLabel,
} from '../features/maintenance/maintenance-signals'
import { useMaintenanceEvents } from '../features/maintenance/useMaintenanceEvents'
import { todayInKorea } from '../lib/date'
import type { Item } from '../lib/types'

interface MaintenanceRow {
  item: Item
  reason: string
  badge: ManagementBadgeLabel
  lastWornOn: string | null
}

type ManagementPageKind = 'maintenance' | 'laundry'

function badgeClass(label: ManagementBadgeLabel) {
  if (label === '점검') return 'warning'
  if (label === '교체') return 'error'
  return label === '손세탁' ? 'hand_wash' : 'dry_cleaning'
}

function MaintenanceSection({
  id,
  eyebrow,
  title,
  description,
  emptyTitle,
  rows,
}: {
  id: string
  eyebrow: string
  title: ManagementBadgeLabel
  description: string
  emptyTitle: string
  rows: MaintenanceRow[]
}) {
  return (
    <section className="section maintenance-section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
        <span className="count">{rows.length}개</span>
      </div>
      <p className="maintenance-section__description">{description}</p>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="maintenance-list">
          {rows.map(({ item, reason, badge }) => (
            <Link
              to={`/closet/${item.id}`}
              key={item.id}
              aria-label={`${item.name} ${badge}: ${reason}, Item 상세 보기`}
            >
              <ItemVisual item={item} className="item-visual--row" />
              <span className="maintenance-list__body" aria-hidden="true">
                <strong>{item.name}</strong>
                <span>{reason}</span>
              </span>
              <span className={`badge badge--${badgeClass(badge)}`} aria-hidden="true">
                {badge}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function ManagementPage({ kind }: { kind: ManagementPageKind }) {
  const { data, loading, error, refresh, purchases, care } = useClosetData()
  const today = todayInKorea()
  const activeItems = useMemo(
    () => data?.items.filter((item) => !item.retired) ?? [],
    [data],
  )
  const activeItemIds = useMemo(
    () => activeItems.map((item) => item.id),
    [activeItems],
  )
  const events = useMaintenanceEvents(purchases, care, activeItemIds)
  const sections = useMemo(() => {
    const empty = { inspection: [], replacement: [], handWash: [], dryCleaning: [] }
    if (!data || events.loading || events.error) return empty
    const signals = getMaintenanceSignals({
      items: activeItems,
      outfits: data.outfits,
      wearLogs: data.wearLogs,
      purchaseEvents: events.purchaseEvents,
      careEvents: events.careEvents,
      today,
    })
    const inspection: MaintenanceRow[] = []
    const replacement: MaintenanceRow[] = []
    const handWash: MaintenanceRow[] = []
    const dryCleaning: MaintenanceRow[] = []
    const itemIdsByOutfit = new Map(
      data.outfits.map((outfit) => [outfit.id, outfit.itemIds]),
    )
    const lastWornOnByItem = new Map<string, string>()
    for (const log of data.wearLogs) {
      for (const itemId of itemIdsByOutfit.get(log.outfitId) ?? []) {
        const current = lastWornOnByItem.get(itemId)
        if (!current || log.wornOn > current) {
          lastWornOnByItem.set(itemId, log.wornOn)
        }
      }
    }

    for (const item of activeItems) {
      const signal = signals.get(item.id)
      if (!signal) continue
      if (signal.inspection) {
        inspection.push({
          item,
          reason: signal.inspection.reason,
          badge: '점검',
          lastWornOn: lastWornOnByItem.get(item.id) ?? null,
        })
      }
      if (signal.replacement?.due) {
        replacement.push({
          item,
          reason: getReplacementReason(signal.replacement),
          badge: '교체',
          lastWornOn: lastWornOnByItem.get(item.id) ?? null,
        })
      }
      if (signal.care?.due) {
        const row: MaintenanceRow = {
          item,
          reason: signal.care.reason,
          badge: signal.care.label,
          lastWornOn: lastWornOnByItem.get(item.id) ?? null,
        }
        if (signal.care.method === 'hand_wash') handWash.push(row)
        else dryCleaning.push(row)
      }
    }

    const sortByOldestWear = (left: MaintenanceRow, right: MaintenanceRow) => {
      if (left.lastWornOn === null && right.lastWornOn !== null) return -1
      if (left.lastWornOn !== null && right.lastWornOn === null) return 1
      return (
        (left.lastWornOn ?? '').localeCompare(right.lastWornOn ?? '') ||
        left.item.name.localeCompare(right.item.name, 'ko')
      )
    }
    inspection.sort(sortByOldestWear)
    replacement.sort(sortByOldestWear)
    handWash.sort(sortByOldestWear)
    dryCleaning.sort(sortByOldestWear)
    return { inspection, replacement, handWash, dryCleaning }
  }, [activeItems, data, events, today])

  const contentLoading = loading || (Boolean(data) && events.loading)
  const isLaundry = kind === 'laundry'

  return (
    <AppShell
      title={isLaundry ? 'Laundry' : 'Maintenance'}
      eyebrow={isLaundry ? 'GARMENT CARE' : 'CLOSET UPKEEP'}
      back
    >
      {contentLoading ? <LoadingState label="관리 대상을 계산하는 중" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
      {!error && data && events.error ? (
        <ErrorState message={`관리 사건을 불러오지 못했습니다: ${events.error}`} onRetry={() => void events.reload()} />
      ) : null}
      {data && !events.loading && !events.error ? (
        <div className="maintenance-sections">
          {isLaundry ? (
            <>
              <MaintenanceSection id="hand-wash-heading" eyebrow="HAND WASH" title="손세탁" description="최근 관리 이후 착용 횟수가 손세탁 기준에 도달한 Item입니다." emptyTitle="지금 손세탁할 Item이 없어요" rows={sections.handWash} />
              <MaintenanceSection id="dry-cleaning-heading" eyebrow="DRY CLEANING" title="드라이클리닝" description="최근 관리 이후 착용 횟수가 드라이클리닝 기준에 도달한 Item입니다." emptyTitle="지금 드라이클리닝할 Item이 없어요" rows={sections.dryCleaning} />
            </>
          ) : (
            <>
              <MaintenanceSection id="inspection-heading" eyebrow="INSPECTION" title="점검" description="착용 기록이 없거나 마지막 착용 후 2년이 지난 Item입니다." emptyTitle="지금 점검할 Item이 없어요" rows={sections.inspection} />
              <MaintenanceSection id="replacement-heading" eyebrow="REPLACEMENT" title="교체" description="현재 구매 주기가 Category별 교체 기준에 도달한 Item입니다." emptyTitle="지금 교체할 Item이 없어요" rows={sections.replacement} />
            </>
          )}
        </div>
      ) : null}
    </AppShell>
  )
}

export function MaintenancePage() {
  return <ManagementPage kind="maintenance" />
}

export function LaundryPage() {
  return <ManagementPage kind="laundry" />
}
