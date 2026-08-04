import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { SeasonScopeSummary } from '../components/SeasonScopeSummary'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ItemVisual } from '../components/ItemVisual'
import { useClosetData } from '../context/DataContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import { formatMonthDayYear } from '../lib/date'
import {
  getAvailableItemCategoryGroups,
  isItemCategoryFilterGroupId,
  isItemVisibleInWardrobeSelection,
  itemMatchesCategoryGroup,
  type ItemCategoryFilterGroupId,
} from '../lib/item-categories'
import { sortItems, type ItemSort } from '../lib/items'
import { getItemStats } from '../lib/outfits'
import { itemMatchesSeasonScope } from '../lib/seasons'
import { COLLECTION_BATCH_SIZE } from '../lib/collection-pagination'

const defaultSort: ItemSort = 'acquired-desc'
const CLOSET_FILTER_STORAGE_KEY = 'closet-index:closet-filters:v2'

interface StoredClosetFilters {
  categoryGroup: ItemCategoryFilterGroupId | ''
  color: string
  includeRetired: boolean
  unwornOnly: boolean
  sort: ItemSort
}

const defaultFilters: StoredClosetFilters = {
  categoryGroup: '',
  color: '',
  includeRetired: false,
  unwornOnly: false,
  sort: defaultSort,
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
      unwornOnly:
        typeof parsed.unwornOnly === 'boolean' ? parsed.unwornOnly : false,
      sort: validSorts.includes(parsed.sort as ItemSort)
        ? (parsed.sort as ItemSort)
        : defaultSort,
    }
  } catch {
    return defaultFilters
  }
}

export function ClosetPage() {
  const { data, loading, error, refresh } = useClosetData()
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
  const [unwornOnly, setUnwornOnly] = useState(initialFilters.unwornOnly)
  const [sort, setSort] = useState<ItemSort>(initialFilters.sort)
  const [visibleItemCount, setVisibleItemCount] = useState(COLLECTION_BATCH_SIZE)

  useEffect(() => {
    const filters: StoredClosetFilters = {
      categoryGroup,
      color,
      includeRetired,
      unwornOnly,
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
  }, [categoryGroup, color, includeRetired, sort, unwornOnly])

  useEffect(() => {
    setVisibleItemCount(COLLECTION_BATCH_SIZE)
  }, [
    activeSeasons,
    categoryGroup,
    color,
    includeRetired,
    query,
    sort,
    unwornOnly,
  ])

  const categoryGroups = useMemo(
    () => getAvailableItemCategoryGroups(data?.items ?? []),
    [data],
  )
  const colors = useMemo(
    () =>
      [
        ...new Set(
          data?.items
            .map((item) => item.semanticColor)
            .filter((value): value is string => Boolean(value)) ?? [],
        ),
      ].sort(),
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
  const items = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLocaleLowerCase('ko')
    return sortItems(
      data.items.filter((item) => {
        if (!isItemVisibleInWardrobeSelection(item)) return false
        if (!includeRetired && item.retired) return false
        if (unwornOnly && wornItemIds.has(item.id)) return false
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
    query,
    sort,
    unwornOnly,
    wornItemIds,
  ])

  const reset = () => {
    setQuery('')
    setCategoryGroup('')
    setColor('')
    setIncludeRetired(false)
    setUnwornOnly(false)
    setSort(defaultSort)
  }

  return (
    <AppShell
      title="Closet"
      eyebrow="ALL ITEMS"
      action={
        <Link className="button button--primary" to="/closet/new">
          새 Item
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
        </div>
      </section>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
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
                {items.slice(0, visibleItemCount).map((item) => {
                  const stats = getItemStats(item.id, data.outfits, data.wearLogs)

                  return (
                    <Link
                      className="item-card"
                      to={`/closet/${item.id}`}
                      key={item.id}
                      aria-label={`${item.name} 아이템 상세 보기`}
                    >
                      <ItemVisual item={item} className="item-visual--grid" />
                      <span className="item-card__summary" aria-hidden="true">
                        <span>착용 {stats.wearCount}회</span>
                        <span>
                          {stats.lastWornOn
                            ? `최근 ${formatMonthDayYear(stats.lastWornOn)}`
                            : '최근 기록 없음'}
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
