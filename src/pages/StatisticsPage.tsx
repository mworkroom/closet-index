import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import {
  DEFAULT_STATISTICS_FILTERS,
  getStatisticsYears,
  isStatisticsCategoryId,
  STATISTICS_CATEGORY_OPTIONS,
  type StatisticsCategoryId,
  type StatisticsFilters,
  type StatisticsItemRow,
} from '../features/statistics/statistics-calculations'
import { useStatisticsData } from '../features/statistics/useStatisticsData'
import {
  createStatisticsItemListUrl,
  type StatisticsItemListKind,
} from '../features/statistics/statistics-navigation'
import { formatMonthDayYear } from '../lib/date'
import {
  isSeason,
  SEASONS,
  seasonLabels,
  type Season,
} from '../lib/seasons'

const STATISTICS_FILTER_STORAGE_KEY = 'closet-index:statistics-filters:v1'
const STATISTICS_SCROLL_STORAGE_KEY = 'closet-index:statistics-scroll:v1'

function readStoredFilters(): StatisticsFilters {
  try {
    const raw = window.localStorage.getItem(STATISTICS_FILTER_STORAGE_KEY)
    if (!raw) return DEFAULT_STATISTICS_FILTERS
    const parsed = JSON.parse(raw) as Partial<StatisticsFilters>
    const period =
      parsed.period?.kind === 'year' &&
      Number.isInteger(parsed.period.year)
        ? { kind: 'year' as const, year: parsed.period.year }
        : { kind: 'lifetime' as const }

    return {
      period,
      seasons: Array.isArray(parsed.seasons)
        ? parsed.seasons.filter(
            (value): value is Season =>
              typeof value === 'string' && isSeason(value),
          )
        : [],
      categories: Array.isArray(parsed.categories)
        ? parsed.categories.filter(
            (value): value is StatisticsCategoryId =>
              typeof value === 'string' && isStatisticsCategoryId(value),
          )
        : [],
    }
  } catch {
    return DEFAULT_STATISTICS_FILTERS
  }
}

function StatisticsItemPreview({
  title,
  rows,
  emptyDescription,
  filters,
  listKind,
}: {
  title: string
  rows: StatisticsItemRow[]
  emptyDescription: string
  filters: StatisticsFilters
  listKind: StatisticsItemListKind
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="count">{rows.length}개</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="해당 기록이 없어요" description={emptyDescription} />
      ) : (
        <>
          <div className="ranking-list">
            {rows.slice(0, 4).map((row, index) => (
              <Link to={`/closet/${row.item.id}`} key={row.item.id}>
                <span className="ranking-list__rank">{index + 1}</span>
                <ItemVisual item={row.item} className="item-visual--row" />
                <span className="ranking-list__body">
                  <strong>{row.item.name}</strong>
                  <span>
                    {row.wearCount > 0
                      ? `최근 ${formatMonthDayYear(row.lastWornOn)}`
                      : row.item.acquiredOn
                        ? `취득 ${formatMonthDayYear(row.item.acquiredOn)}`
                        : '취득일 미상'}
                  </span>
                </span>
                <strong>{row.wearCount}회</strong>
              </Link>
            ))}
          </div>
          {rows.length > 4 ? (
            <Link
              className="button button--secondary"
              to={createStatisticsItemListUrl(listKind, filters)}
            >
              Closet에서 전체 보기
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}

export function StatisticsPage() {
  const [filters, setFilters] = useState(readStoredFilters)
  const navigationType = useNavigationType()
  const { snapshot, statistics, loading, error, refresh } =
    useStatisticsData(filters)
  const years = useMemo(
    () => (snapshot ? getStatisticsYears(snapshot) : []),
    [snapshot],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STATISTICS_FILTER_STORAGE_KEY,
        JSON.stringify(filters),
      )
    } catch {
      // Storage can be unavailable; the filters still work for this view.
    }
  }, [filters])

  useEffect(() => {
    if (!statistics || navigationType !== 'POP') return
    let storedPosition = 0
    try {
      storedPosition = Number(
        window.sessionStorage.getItem(STATISTICS_SCROLL_STORAGE_KEY),
      )
    } catch {
      return
    }
    if (!Number.isFinite(storedPosition) || storedPosition <= 0) return
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: storedPosition })
      try {
        window.sessionStorage.removeItem(STATISTICS_SCROLL_STORAGE_KEY)
      } catch {
        // The restored view remains valid even if cleanup is unavailable.
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [navigationType, statistics])

  useEffect(
    () => () => {
      try {
        window.sessionStorage.setItem(
          STATISTICS_SCROLL_STORAGE_KEY,
          String(window.scrollY),
        )
      } catch {
        // Session storage can be unavailable; browser history still works.
      }
    },
    [],
  )

  const toggleSeason = (season: Season, checked: boolean) => {
    setFilters((current) => ({
      ...current,
      seasons: checked
        ? [...new Set([...current.seasons, season])]
        : current.seasons.filter((value) => value !== season),
    }))
  }

  const toggleCategory = (
    category: StatisticsCategoryId,
    checked: boolean,
  ) => {
    setFilters((current) => ({
      ...current,
      categories: checked
        ? [...new Set([...current.categories, category])]
        : current.categories.filter((value) => value !== category),
    }))
  }

  const periodLabel = statistics?.period.isLifetime
    ? '현재 보유 옷의 전체 기간 활용률'
    : `현재 보유 옷의 ${statistics?.period.year}년 활용률`
  const utilizationLabel =
    statistics?.summary.utilizationRate == null
      ? '—'
      : `${Math.round(statistics.summary.utilizationRate * 100)}%`
  const unwornTitle = statistics?.period.isLifetime
    ? 'Never Worn'
    : `${statistics?.period.year}년 기록 없음`

  return (
    <AppShell title="Statistics" eyebrow="ITEM USAGE" back>
      <section className="filter-panel" aria-label="통계 필터">
        <div className="filter-row filter-row--single">
          <select
            aria-label="통계 기간"
            value={
              filters.period.kind === 'lifetime'
                ? 'lifetime'
                : String(filters.period.year)
            }
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                period:
                  event.target.value === 'lifetime'
                    ? { kind: 'lifetime' }
                    : { kind: 'year', year: Number(event.target.value) },
              }))
            }
          >
            <option value="lifetime">Lifetime</option>
            {years.map((year) => (
              <option value={year} key={year}>
                {year}년
              </option>
            ))}
          </select>
        </div>

        <div>
          <strong>계절</strong>
          <div className="check-stack">
            {SEASONS.map((season) => (
              <label className="check-row" key={season}>
                <input
                  type="checkbox"
                  checked={filters.seasons.includes(season)}
                  onChange={(event) =>
                    toggleSeason(season, event.target.checked)
                  }
                />
                {seasonLabels[season]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <strong>카테고리</strong>
          <div className="check-stack">
            {STATISTICS_CATEGORY_OPTIONS.map((option) => (
              <label className="check-row" key={option.id}>
                <input
                  type="checkbox"
                  checked={filters.categories.includes(option.id)}
                  onChange={(event) =>
                    toggleCategory(option.id, event.target.checked)
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      {loading ? <LoadingState label="통계를 계산하는 중" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : null}
      {snapshot && statistics ? (
        <>
          <section className="section" aria-labelledby="utilization-heading">
            <div className="section-heading">
              <h2 id="utilization-heading">{periodLabel}</h2>
            </div>
            <div
              className="metric-grid metric-grid--two"
              aria-label="아이템 활용률 요약"
            >
              <div>
                <span>활용률</span>
                <strong>{utilizationLabel}</strong>
              </div>
              <div>
                <span>사용한 Item</span>
                <strong>
                  {statistics.summary.usedItemCount}/
                  {statistics.summary.targetItemCount}개
                </strong>
              </div>
            </div>
            <p className="muted">
              현재 Active Item과 고정된 Outfit 구성, Wear Log를 기준으로
              계산합니다.
              {statistics.summary.excludedUnknownAcquiredCount > 0
                ? ` 취득일 미상 ${statistics.summary.excludedUnknownAcquiredCount}개는 과거 연도 분모에서 제외했습니다.`
                : ''}
            </p>
          </section>

          <StatisticsItemPreview
            title="Most Worn"
            rows={statistics.mostWornRows}
            emptyDescription="선택한 기간과 필터에 해당하는 Wear Log가 없습니다."
            filters={filters}
            listKind="most-worn"
          />
          <StatisticsItemPreview
            title={unwornTitle}
            rows={statistics.unwornRows}
            emptyDescription="선택한 조건에서 기록이 없는 Active Item이 없습니다."
            filters={filters}
            listKind="unworn"
          />

          <section className="section">
            <div className="section-heading">
              <h2>카테고리별 Active 보유</h2>
              <span className="count">
                {statistics.summary.targetItemCount}개
              </span>
            </div>
            {statistics.categoryRows.length === 0 ? (
              <EmptyState
                title="조건에 맞는 Active Item이 없어요"
                description="기간·계절·카테고리 선택을 바꿔 확인해 주세요."
              />
            ) : (
              <dl className="category-stat-list">
                {statistics.categoryRows.map((row) => (
                  <div key={row.id}>
                    <dt>{row.label}</dt>
                    <dd>
                      <strong>{row.activeCount}개</strong>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="section replacement-lines-entry" aria-labelledby="replacement-lines-entry-heading">
            <div>
              <p className="eyebrow">REPLACEMENT LINEAGE</p>
              <h2 id="replacement-lines-entry-heading">Replacement Lines</h2>
              <p className="muted">
                같은 역할을 이어 온 Item을 Style Identity별로 확인합니다.
              </p>
            </div>
            <Link className="button button--secondary" to="/statistics/replacement-lines">
              Line Overview 열기
            </Link>
          </section>
        </>
      ) : null}
    </AppShell>
  )
}
