import { Search, Thermometer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { SeasonScopeSummary } from '../components/SeasonScopeSummary'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ItemVisual } from '../components/ItemVisual'
import { useClosetData } from '../context/DataContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import {
  getMaintenanceSignals,
  getManagementBadgeClass,
} from '../features/maintenance/maintenance-signals'
import { useMaintenanceEvents } from '../features/maintenance/useMaintenanceEvents'
import { formatMonthDayYear, todayInKorea } from '../lib/date'
import {
  getAvailableItemCategoryGroups,
  isItemCategoryFilterGroupId,
  isMadeItemCategory,
  isItemVisibleInWardrobeSelection,
  itemMatchesCategoryGroup,
  type ItemCategoryFilterGroupId,
} from '../lib/item-categories'
import { isWishItem, sortItems, type ItemSort } from '../lib/items'
import {
  buildItemTemperatureEvidenceIndex,
  itemHasTemperatureEvidenceNear,
} from '../lib/item-temperature-evidence'
import { getItemStats } from '../lib/outfits'
import { itemMatchesSeasonScope } from '../lib/seasons'
import { COLLECTION_BATCH_SIZE } from '../lib/collection-pagination'
import { COLOR_CATEGORIES } from '../lib/types'

const defaultSort: ItemSort = 'acquired-desc'
const CLOSET_FILTER_STORAGE_KEY = 'closet-index:closet-filters:v2'

interface StoredClosetFilters {
  categoryGroup: ItemCategoryFilterGroupId | ''
  color: string
  includeRetired: boolean
  madeOnly: boolean
  unwornOnly: boolean
  wishOnly: boolean
  temperature: string
  sort: ItemSort
}

const defaultFilters: StoredClosetFilters = {
  categoryGroup: '',
  color: '',
  includeRetired: false,
  madeOnly: false,
  unwornOnly: false,
  wishOnly: false,
  temperature: '',
  sort: defaultSort,
}

function parseTargetTemperature(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= -50 && parsed <= 60
    ? parsed
    : null
}

function readStoredFilters(): StoredClosetFilters {
  try {
    const raw = window.localStorage.getItem(CLOSET_FILTER_STORAGE_KEY)
    if (!raw) return defaultFilters
    const parsed = JSON.parse(raw) as Partial<StoredClosetFilters>
    const validSorts: ItemSort[] = ['acquired-desc', 'acquired-asc', 'name']
    const storedCategoryGroup =
      typeof parsed.categoryGroup === 'string' &&
      isItemCategoryFilterGroupId(parsed.categoryGroup)
        ? parsed.categoryGroup
        : ''
    return {
      categoryGroup: storedCategoryGroup,
      color: typeof parsed.color === 'string' ? parsed.color : '',
      includeRetired:
        typeof parsed.includeRetired === 'boolean'
          ? parsed.includeRetired
          : false,
      madeOnly: typeof parsed.madeOnly === 'boolean' ? parsed.madeOnly : false,
      unwornOnly:
        typeof parsed.unwornOnly === 'boolean' ? parsed.unwornOnly : false,
      wishOnly: typeof parsed.wishOnly === 'boolean' ? parsed.wishOnly : false,
      temperature:
        typeof parsed.temperature === 'string' ? parsed.temperature : '',
      sort: validSorts.includes(parsed.sort as ItemSort)
        ? (parsed.sort as ItemSort)
        : defaultSort,
    }
  } catch {
    return defaultFilters
  }
}

export function ClosetPage() {
  const { data, loading, error, refresh, purchases, care } = useClosetData()
  const { activeSeasons } = useSeasonScope()
  const [initialFilters] = useState(readStoredFilters)
  const [query, setQuery] = useState('')
  const [categoryGroup, setCategoryGroup] = useState(
    initialFilters.categoryGroup,
  )
  const [color, setColor] = useState(initialFilters.color)
  const [includeRetired, setIncludeRetired] = useState(
    initialFilters.includeRetired,
  )
  const [madeOnly, setMadeOnly] = useState(initialFilters.madeOnly)
  const [unwornOnly, setUnwornOnly] = useState(initialFilters.unwornOnly)
  const [wishOnly, setWishOnly] = useState(initialFilters.wishOnly)
  const [temperature, setTemperature] = useState(initialFilters.temperature)
  const [sort, setSort] = useState<ItemSort>(initialFilters.sort)
  const [visibleItemCount, setVisibleItemCount] = useState(COLLECTION_BATCH_SIZE)
  const today = todayInKorea()

  useEffect(() => {
    const filters: StoredClosetFilters = {
      categoryGroup,
      color,
      includeRetired,
      madeOnly,
      unwornOnly,
      wishOnly,
      temperature,
      sort,
    }
    try {
      window.localStorage.setItem(
        CLOSET_FILTER_STORAGE_KEY,
        JSON.stringify(filters),
      )
    } catch {
      // Storage can be unavailable in private browsing; filters still work in memory.
    }
  }, [categoryGroup, color, includeRetired, madeOnly, sort, temperature, unwornOnly, wishOnly])

  useEffect(() => {
    setVisibleItemCount(COLLECTION_BATCH_SIZE)
  }, [
    activeSeasons,
    categoryGroup,
    color,
    includeRetired,
    madeOnly,
    query,
    sort,
    temperature,
    unwornOnly,
    wishOnly,
  ])

  const categoryGroups = useMemo(
    () => getAvailableItemCategoryGroups(data?.items ?? []),
    [data],
  )
  const colors = COLOR_CATEGORIES
  const targetTemperature = parseTargetTemperature(temperature)
  const hasInvalidTemperature =
    temperature.trim() !== '' && targetTemperature === null
  const temperatureEvidence = useMemo(
    () => (data ? buildItemTemperatureEvidenceIndex(data) : new Map()),
    [data],
  )
  const wornItemIds = useMemo(() => {
    if (!data) return new Set<string>()
    const wornOutfitIds = new Set(data.wearLogs.map((log) => log.outfitId))
    return new Set(
      data.outfits.flatMap((outfit) =>
        wornOutfitIds.has(outfit.id) ? outfit.itemIds : [],
      ),
    )
  }, [data])
  const candidateItems = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLocaleLowerCase('ko')
    return sortItems(
      data.items.filter((item) => {
        if (!isItemVisibleInWardrobeSelection(item)) return false
        if (!includeRetired && item.retired) return false
        if (madeOnly && !isMadeItemCategory(item)) return false
        if (unwornOnly && wornItemIds.has(item.id)) return false
        if (wishOnly && !isWishItem(item)) return false
        if (!itemMatchesSeasonScope(item, activeSeasons)) return false
        if (!itemMatchesCategoryGroup(item, categoryGroup)) return false
        if (color && item.semanticColor !== color) return false
        return (
          !normalized ||
          item.name.toLocaleLowerCase('ko').includes(normalized) ||
          item.category.toLocaleLowerCase('ko').includes(normalized)
        )
      }),
      sort,
    )
  }, [
    activeSeasons,
    categoryGroup,
    color,
    data,
    includeRetired,
    madeOnly,
    query,
    sort,
    unwornOnly,
    wishOnly,
    wornItemIds,
  ])
  const items = useMemo(
    () =>
      targetTemperature === null
        ? candidateItems
        : candidateItems.filter((item) => {
            const evidence = temperatureEvidence.get(item.id)
            return (
              evidence !== undefined &&
              itemHasTemperatureEvidenceNear(evidence, targetTemperature)
            )
          }),
    [candidateItems, targetTemperature, temperatureEvidence],
  )
  const temperatureSummary = useMemo(() => {
    if (targetTemperature === null) return null

    let unknown = 0
    let otherTemperature = 0
    for (const item of candidateItems) {
      const evidence = temperatureEvidence.get(item.id)
      if (!evidence) unknown += 1
      else if (!itemHasTemperatureEvidenceNear(evidence, targetTemperature)) {
        otherTemperature += 1
      }
    }

    return { unknown, otherTemperature }
  }, [candidateItems, targetTemperature, temperatureEvidence])
  const visibleItems = items.slice(0, visibleItemCount)
  const visibleItemIds = useMemo(
    () => visibleItems.map((item) => item.id),
    [visibleItems],
  )
  const maintenanceEvents = useMaintenanceEvents(
    purchases,
    care,
    visibleItemIds,
  )
  const maintenanceSignals = useMemo(
    () =>
      data && !maintenanceEvents.loading && !maintenanceEvents.error
        ? getMaintenanceSignals({
            items: visibleItems,
            outfits: data.outfits,
            wearLogs: data.wearLogs,
            purchaseEvents: maintenanceEvents.purchaseEvents,
            careEvents: maintenanceEvents.careEvents,
            today,
          })
        : new Map(),
    [data, maintenanceEvents, today, visibleItems],
  )

  const reset = () => {
    setQuery('')
    setCategoryGroup('')
    setColor('')
    setIncludeRetired(false)
    setMadeOnly(false)
    setUnwornOnly(false)
    setWishOnly(false)
    setTemperature('')
    setSort(defaultSort)
  }

  return (
    <AppShell
      title="Closet"
      eyebrow="ALL ITEMS"
      action={
        <Link className="button button--primary" to="/closet/new">
          Add
        </Link>
      }
    >
      <section className="filter-panel">
        <SeasonScopeSummary />
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">아이템 검색</span>
          <input
            type="search"
            value={query}
            placeholder="이름 또는 카테고리 검색"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-row">
          <select
            aria-label="카테고리"
            value={categoryGroup}
            onChange={(event) =>
              setCategoryGroup(
                event.target.value as ItemCategoryFilterGroupId | '',
              )
            }
          >
            <option value="">모든 카테고리</option>
            {categoryGroups.map((group) => (
              <option value={group.id} key={group.id}>
                {group.label}
              </option>
            ))}
          </select>
          <select
            aria-label="색상"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          >
            <option value="">모든 색상</option>
            {colors.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="정렬"
            value={sort}
            onChange={(event) => setSort(event.target.value as ItemSort)}
          >
            <option value="acquired-desc">구매일 최신순</option>
            <option value="acquired-asc">구매일 오래된순</option>
            <option value="name">이름순</option>
          </select>
        </div>
        <div className="closet-temperature-filter">
          <Thermometer size={18} aria-hidden="true" />
          <label className="closet-temperature-filter__field">
            <span>오늘 온도</span>
            <span className="closet-temperature-filter__input">
              <input
                type="number"
                inputMode="numeric"
                min="-50"
                max="60"
                step="1"
                value={temperature}
                placeholder="선택 안 함"
                aria-label="오늘 온도"
                aria-invalid={hasInvalidTemperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
              <span aria-hidden="true">°C</span>
            </span>
          </label>
        </div>

        <div className="check-stack">
          <label className="check-row">
            <input
              type="checkbox"
              checked={unwornOnly}
              onChange={(event) => setUnwornOnly(event.target.checked)}
            />
            Unworn
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeRetired}
              onChange={(event) => setIncludeRetired(event.target.checked)}
            />
            Retired 포함
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={madeOnly}
              onChange={(event) => setMadeOnly(event.target.checked)}
            />
            Made
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={wishOnly}
              onChange={(event) => setWishOnly(event.target.checked)}
            />
            Wish
          </label>
        </div>
      </section>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && maintenanceEvents.error ? (
        <div className="maintenance-load-error" role="alert">
          <span>관리 상태를 불러오지 못했습니다: {maintenanceEvents.error}</span>
          <button className="button button--secondary" type="button" onClick={() => void maintenanceEvents.reload()}>
            다시 시도
          </button>
        </div>
      ) : null}
      {data && (
        <section className="section">
          <div className="section-heading">
            <h2>아이템</h2>
            <span className="count">{items.length}개</span>
          </div>
          {items.length === 0 ? (
            <EmptyState
              title="필터에 맞는 아이템이 없어요"
              action={
                <button className="button button--secondary" type="button" onClick={reset}>
                  필터 초기화
                </button>
              }
            />
          ) : (
            <>
              <div className="item-grid">
                {visibleItems.map((item) => {
                  const stats = getItemStats(item.id, data.outfits, data.wearLogs)
                  const evidence = temperatureEvidence.get(item.id)
                  const evidenceLabel = evidence
                    ? `${evidence.okRange.min}~${evidence.okRange.max}°C · OK 관측 ${evidence.okObservationCount}개`
                    : '온도 근거 없음'
                  const maintenanceSignal = maintenanceSignals.get(item.id)
                  const wish = isWishItem(item)
                  const badge = wish
                    ? '구매 전'
                    : maintenanceSignal?.primaryBadge ?? null
                  const badgeClass = wish
                    ? 'wish'
                    : badge
                      ? getManagementBadgeClass(badge)
                      : null

                  return (
                    <Link
                      className="item-card"
                      to={`/closet/${item.id}`}
                      key={item.id}
                      aria-label={`${item.name} 아이템 상세 보기${badge ? `, ${wish ? '구매 상태' : '관리 상태'} ${badge}` : ''}${targetTemperature !== null ? `, ${evidenceLabel}` : ''}`}
                    >
                      <div className="item-card__visual">
                        <ItemVisual item={item} className="item-visual--grid" />
                        {badge ? (
                          <span
                            className={`item-card__badge badge badge--${badgeClass}`}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </div>
                      <span className="item-card__summary" aria-hidden="true">
                        <span className="item-card__stats">
                          <span>착용 {stats.wearCount}회</span>
                          <span>
                            {stats.lastWornOn
                              ? `최근 ${formatMonthDayYear(stats.lastWornOn)}`
                              : '최근 기록 없음'}
                          </span>
                          <span className={evidence ? undefined : 'item-card__temperature--unknown'}>
                            {evidenceLabel}
                          </span>
                        </span>
                      </span>
                    </Link>
                  )
                })}
              </div>
              {visibleItemCount < items.length && (
                <div className="collection-load-more">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() =>
                      setVisibleItemCount((current) =>
                        Math.min(current + COLLECTION_BATCH_SIZE, items.length),
                      )
                    }
                  >
                    더 보기 ({Math.min(visibleItemCount, items.length)}/{items.length})
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </AppShell>
  )
}
