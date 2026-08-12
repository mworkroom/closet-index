import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import {
  STATISTICS_CATEGORY_OPTIONS,
  type StatisticsItemRow,
} from '../features/statistics/statistics-calculations'
import { readStatisticsItemListSearchParams } from '../features/statistics/statistics-navigation'
import { useStatisticsData } from '../features/statistics/useStatisticsData'
import { formatMonthDayYear } from '../lib/date'
import { COLLECTION_BATCH_SIZE } from '../lib/collection-pagination'
import { seasonLabels } from '../lib/seasons'

const STATISTICS_LIST_COUNT_STORAGE_PREFIX =
  'closet-index:statistics-list-visible-count:v1:'

function readVisibleCount(storageKey: string) {
  try {
    const stored = Number(window.sessionStorage.getItem(storageKey))
    return Number.isInteger(stored) && stored >= COLLECTION_BATCH_SIZE
      ? stored
      : COLLECTION_BATCH_SIZE
  } catch {
    return COLLECTION_BATCH_SIZE
  }
}

function filterSummary(
  filters: ReturnType<
    typeof readStatisticsItemListSearchParams
  >['filters'],
) {
  const period =
    filters.period.kind === 'lifetime'
      ? 'Lifetime'
      : `${filters.period.year}년`
  const seasons =
    filters.seasons.length === 0
      ? '모든 계절'
      : filters.seasons.map((season) => seasonLabels[season]).join(' · ')
  const categories =
    filters.categories.length === 0
      ? '모든 카테고리'
      : STATISTICS_CATEGORY_OPTIONS.filter((option) =>
          filters.categories.includes(option.id),
        )
          .map((option) => option.label)
          .join(' · ')
  const retired = filters.excludeRetired ? 'Retired 제외' : null
  return [period, seasons, categories, retired].filter(Boolean).join(' · ')
}

function StatisticsFullList({
  rows,
  ranked,
}: {
  rows: StatisticsItemRow[]
  ranked: boolean
}) {
  return (
    <div className="ranking-list statistics-full-list">
      {rows.map((row, index) => (
        <Link
          to={`/closet/${row.item.id}`}
          key={row.item.id}
          aria-label={`${row.item.name} Item 상세 보기`}
        >
          {ranked ? (
            <span className="ranking-list__rank">{index + 1}</span>
          ) : null}
          <ItemVisual item={row.item} className="item-visual--row" />
          <span className="ranking-list__body" aria-hidden="true">
            <strong>{row.item.name}</strong>
            <span>
              {row.wearCount > 0
                ? `최근 ${formatMonthDayYear(row.lastWornOn)}`
                : row.item.acquiredOn
                  ? `취득 ${formatMonthDayYear(row.item.acquiredOn)}`
                  : '취득일 미상'}
            </span>
          </span>
          <strong aria-hidden="true">{row.wearCount}회</strong>
        </Link>
      ))}
    </div>
  )
}

export function StatisticsItemListPage() {
  const [searchParams] = useSearchParams()
  const navigationType = useNavigationType()
  const search = searchParams.toString()
  const paginationStorageKey = `${STATISTICS_LIST_COUNT_STORAGE_PREFIX}${search}`
  const [paginationState, setPaginationState] = useState(() => ({
    storageKey: paginationStorageKey,
    count:
      navigationType === 'POP'
        ? readVisibleCount(paginationStorageKey)
        : COLLECTION_BATCH_SIZE,
  }))
  const visibleItemCount =
    paginationState.storageKey === paginationStorageKey
      ? paginationState.count
      : navigationType === 'POP'
        ? readVisibleCount(paginationStorageKey)
        : COLLECTION_BATCH_SIZE
  const { kind, filters } = useMemo(
    () => readStatisticsItemListSearchParams(new URLSearchParams(search)),
    [search],
  )
  const { statistics, loading, error, refresh } =
    useStatisticsData(filters)
  const rows =
    kind === 'most-worn'
      ? statistics?.mostWornRows ?? []
      : statistics?.unwornRows ?? []
  const title =
    kind === 'most-worn'
      ? 'Most Worn 전체'
      : filters.period.kind === 'lifetime'
        ? 'Never Worn 전체'
        : `${filters.period.year}년 기록 없음 전체`

  useEffect(() => {
    if (navigationType === 'POP') return
    window.scrollTo({ top: 0 })
  }, [navigationType])

  useEffect(() => {
    const nextCount =
      navigationType === 'POP'
        ? readVisibleCount(paginationStorageKey)
        : COLLECTION_BATCH_SIZE
    setPaginationState({ storageKey: paginationStorageKey, count: nextCount })
    if (navigationType !== 'POP') {
      try {
        window.sessionStorage.removeItem(paginationStorageKey)
      } catch {
        // The list still starts from the first batch without session storage.
      }
    }
  }, [navigationType, paginationStorageKey])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        paginationStorageKey,
        String(visibleItemCount),
      )
    } catch {
      // Pagination remains usable in memory when session storage is unavailable.
    }
  }, [paginationStorageKey, visibleItemCount])

  const visibleRows = rows.slice(0, visibleItemCount)

  return (
    <AppShell title={title} eyebrow="STATISTICS ITEMS" back>
      <section
        className="statistics-list-context"
        aria-label="적용된 통계 조건"
      >
        <strong>{filterSummary(filters)}</strong>
        <span>
          Statistics에서 선택한 조건과 같은 Item 집합입니다.
        </span>
      </section>

      {loading ? <LoadingState label="전체 Item을 계산하는 중" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : null}
      {statistics ? (
        <section className="section" aria-labelledby="statistics-list-heading">
          <div className="section-heading">
            <h2 id="statistics-list-heading">아이템</h2>
            <span className="count">{rows.length}개</span>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              title="조건에 맞는 Item이 없어요"
              description="뒤로 돌아가 기간·계절·카테고리를 바꿔 주세요."
            />
          ) : (
            <StatisticsFullList
              rows={visibleRows}
              ranked={kind === 'most-worn'}
            />
          )}
          {visibleItemCount < rows.length ? (
            <div className="collection-load-more">
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  setPaginationState({
                    storageKey: paginationStorageKey,
                    count: Math.min(
                      visibleItemCount + COLLECTION_BATCH_SIZE,
                      rows.length,
                    ),
                  })
                }
              >
                더 보기 ({Math.min(visibleItemCount, rows.length)}/{rows.length})
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  )
}
