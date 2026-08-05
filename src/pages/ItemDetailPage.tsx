import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { OutfitCard } from '../components/OutfitCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { getCareRule } from '../features/maintenance/care-cycle'
import { ItemCareSection } from '../features/maintenance/components/ItemCareSection'
import {
  getMaintenanceSignals,
  getManagementBadgeClass,
} from '../features/maintenance/maintenance-signals'
import { useItemCareEvents } from '../features/maintenance/useItemCareEvents'
import { ItemReplacementLineageSection } from '../features/replacement-lines/components/ItemReplacementLineageSection'
import { ItemReplenishmentSection } from '../features/replenishment/components/ItemReplenishmentSection'
import {
  getPurchaseReplacementRule,
} from '../features/replenishment/purchase-replenishment'
import { useItemPurchaseEvents } from '../features/replenishment/useItemPurchaseEvents'
import { formatMonthDayYear, todayInKorea } from '../lib/date'
import { getItemStats, getOutfitStats } from '../lib/outfits'

const calendarMonths = Array.from({ length: 12 }, (_, index) => index + 1)

export function ItemDetailPage() {
  const { itemId = '' } = useParams()
  const { data, loading, error, refresh, purchases, care } = useClosetData()
  const item = data?.items.find((entry) => entry.id === itemId)
  const [visibleOutfitCount, setVisibleOutfitCount] = useState(9)
  const purchaseEventsState = useItemPurchaseEvents(purchases, itemId)
  const careEventsState = useItemCareEvents(care, itemId)
  const today = todayInKorea()

  useEffect(() => {
    setVisibleOutfitCount(9)
  }, [itemId])

  const includedOutfits = useMemo(
    () =>
      data
        ? data.outfits
            .filter((outfit) => outfit.itemIds.includes(itemId))
            .sort((left, right) => {
              const leftStats = getOutfitStats(left.id, data.wearLogs)
              const rightStats = getOutfitStats(right.id, data.wearLogs)
              return (
                (rightStats.lastWornOn ?? '').localeCompare(
                  leftStats.lastWornOn ?? '',
                ) ||
                rightStats.wearCount - leftStats.wearCount ||
                left.id.localeCompare(right.id)
              )
            })
        : [],
    [data, itemId],
  )
  const visibleIncludedOutfits = includedOutfits.slice(0, visibleOutfitCount)
  const stats =
    data && item ? getItemStats(item.id, data.outfits, data.wearLogs) : null
  const maintenanceSignals = useMemo(
    () =>
      data && item
        ? getMaintenanceSignals({
            items: [item],
            outfits: data.outfits,
            wearLogs: data.wearLogs,
            purchaseEvents: purchaseEventsState.events,
            careEvents: careEventsState.events,
            today,
            purchaseEventsAvailable: !purchaseEventsState.error,
            careEventsAvailable: !careEventsState.error,
          }).get(item.id) ?? null
        : null,
    [
      careEventsState.error,
      careEventsState.events,
      data,
      item,
      purchaseEventsState.error,
      purchaseEventsState.events,
      today,
    ],
  )
  const reviewSignal =
    maintenanceSignals?.inspection ?? maintenanceSignals?.declutter ?? null
  const purchaseCycle = maintenanceSignals?.replacement ?? null
  const careCycle = maintenanceSignals?.care ?? null
  const isReplacementTarget = Boolean(
    item && getPurchaseReplacementRule(item.category),
  )
  const maximumMonthlyWearCount = Math.max(
    0,
    ...(stats?.monthlyWearCounts ?? []),
  )
  const recordPeriod =
    stats?.firstWornOn && stats.lastWornOn
      ? stats.firstWornOn === stats.lastWornOn
        ? formatMonthDayYear(stats.firstWornOn)
        : `${formatMonthDayYear(stats.firstWornOn)} – ${formatMonthDayYear(stats.lastWornOn)}`
      : '기록 없음'

  return (
    <AppShell
      title={item?.name ?? 'Item'}
      eyebrow="ITEM DETAIL"
      back
      action={
        item ? (
          <Link
            className="button button--secondary"
            to={`/closet/${item.id}/edit`}
          >
            정보 수정
          </Link>
        ) : undefined
      }
    >
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && !item && (
        <ErrorState message="존재하지 않거나 접근할 수 없는 아이템입니다." />
      )}
      {item && data && (
        <>
          <section className="identity-card identity-card--item">
            <ItemVisual item={item} className="item-visual--detail" />
            <dl className="item-attribute-summary" aria-label="아이템 기본 정보">
              <div>
                <dt>카테고리</dt>
                <dd>{item.category}</dd>
              </div>
              <div>
                <dt>색상 카테고리</dt>
                <dd>{item.semanticColor ?? '미입력'}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd className="item-status-summary">
                  <span>{item.retired ? 'Retired' : '사용 중'}</span>
                  {maintenanceSignals?.allBadges.map((label) => (
                    <span
                      className={`badge badge--${getManagementBadgeClass(label)}`}
                      key={label}
                    >
                      {label}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="detail-grid detail-grid--item-stats"
            aria-label="아이템 사용 정보"
          >
            <div>
              <span>구매일</span>
              <strong>
                {item.acquiredOn ? (
                  <time dateTime={item.acquiredOn}>
                    {formatMonthDayYear(item.acquiredOn)}
                  </time>
                ) : (
                  '미입력'
                )}
              </strong>
            </div>
            <div>
              <span>착용 횟수</span>
              <strong>{stats?.wearCount ?? 0}회</strong>
            </div>
            <div>
              <span>마지막 착용</span>
              <strong>{formatMonthDayYear(stats?.lastWornOn ?? null)}</strong>
            </div>
          </section>

          {reviewSignal ? (
            <section
              className={`item-inspection-reason${reviewSignal.label === '정리 후보' ? ' item-inspection-reason--declutter' : ''}`}
              aria-labelledby="item-inspection-heading"
            >
              <div>
                <span className={`badge badge--${getManagementBadgeClass(reviewSignal.label)}`}>
                  {reviewSignal.label}
                </span>
                <h2 id="item-inspection-heading">{reviewSignal.label} 근거</h2>
              </div>
              <p>{reviewSignal.reason}</p>
            </section>
          ) : null}

          <section
            className="section monthly-wear-section"
            aria-labelledby="monthly-wear-heading"
          >
            <div className="section-heading">
              <h2 id="monthly-wear-heading">월별 착용 분포</h2>
              <span className="count">총 {stats?.wearCount ?? 0}회</span>
            </div>
            <p className="monthly-wear-period">
              전체 기록 기간 · {recordPeriod}
            </p>
            {stats?.isYearRound ? (
              <p className="monthly-wear-year-round">
                연중 착용 · 12/12개월
              </p>
            ) : (
              <p className="monthly-wear-month-count">
                기록이 있는 달 · {stats?.wornMonthCount ?? 0}/12개월
              </p>
            )}
            <div
              className="monthly-wear-chart"
              aria-label="1월부터 12월까지 전체 기록의 월별 착용 횟수"
            >
              {calendarMonths.map((month) => {
                const count = stats?.monthlyWearCounts[month - 1] ?? 0
                const height =
                  maximumMonthlyWearCount > 0
                    ? (count / maximumMonthlyWearCount) * 100
                    : 0
                return (
                  <div
                    className="monthly-wear-chart__column"
                    role="img"
                    tabIndex={0}
                    aria-label={`${month}월 ${count}회`}
                    key={month}
                  >
                    <span
                      className="monthly-wear-chart__count"
                      aria-hidden="true"
                    >
                      {count}
                    </span>
                    <span
                      className="monthly-wear-chart__track"
                      aria-hidden="true"
                    >
                      <span
                        className="monthly-wear-chart__bar"
                        style={{ height: `${height}%` }}
                      />
                    </span>
                    <span
                      className="monthly-wear-chart__month"
                      aria-hidden="true"
                    >
                      {month}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <ItemReplenishmentSection
            item={item}
            events={purchaseEventsState.events}
            loading={purchaseEventsState.loading}
            loadError={purchaseEventsState.error}
            reload={purchaseEventsState.reload}
            cycle={purchaseCycle}
            isReplacementTarget={isReplacementTarget}
            today={today}
            variant={
              isReplacementTarget ? 'managed-detail' : 'general-history'
            }
          />

          <ItemCareSection
            item={item}
            events={careEventsState.events}
            loading={careEventsState.loading}
            loadError={careEventsState.error}
            reload={careEventsState.reload}
            cycle={careCycle}
            rule={getCareRule(item.category)}
            today={today}
          />

          <ItemReplacementLineageSection item={item} items={data.items} />

          <section className="section">
            <div className="section-heading">
              <h2>포함된 Outfit</h2>
              <span className="count">{includedOutfits.length}개</span>
            </div>
            {includedOutfits.length === 0 ? (
              <EmptyState title="포함된 Outfit이 없어요" />
            ) : (
              <div className="outfit-grid">
                {visibleIncludedOutfits.map((outfit) => (
                  <OutfitCard
                    outfit={outfit}
                    data={data}
                    layout="grid"
                    key={outfit.id}
                  />
                ))}
              </div>
            )}
            {visibleOutfitCount < includedOutfits.length && (
              <button
                className="button button--secondary button--wide included-outfits-more"
                type="button"
                onClick={() =>
                  setVisibleOutfitCount((current) =>
                    Math.min(current + 9, includedOutfits.length),
                  )
                }
              >
                더보기 ({visibleOutfitCount}/{includedOutfits.length})
              </button>
            )}
          </section>
        </>
      )}
    </AppShell>
  )
}
