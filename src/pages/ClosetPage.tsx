import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ItemVisual } from '../components/ItemVisual'
import { useClosetData } from '../context/DataContext'
import { formatMonthDayYear } from '../lib/date'
import { sortItems, type ItemSort } from '../lib/items'
import { getItemStats } from '../lib/outfits'

const defaultSort: ItemSort = 'acquired-desc'

export function ClosetPage() {
  const { data, loading, error, refresh } = useClosetData()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [color, setColor] = useState('')
  const [includeRetired, setIncludeRetired] = useState(false)
  const [sort, setSort] = useState<ItemSort>(defaultSort)

  const categories = useMemo(
    () => [...new Set(data?.items.map((item) => item.category) ?? [])].sort(),
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
  const items = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLocaleLowerCase('ko')
    return sortItems(
      data.items.filter((item) => {
        if (!includeRetired && item.retired) return false
        if (category && item.category !== category) return false
        if (color && item.semanticColor !== color) return false
        return (
          !normalized ||
          item.name.toLocaleLowerCase('ko').includes(normalized) ||
          item.category.toLocaleLowerCase('ko').includes(normalized)
        )
      }),
      sort,
    )
  }, [category, color, data, includeRetired, query, sort])

  const reset = () => {
    setQuery('')
    setCategory('')
    setColor('')
    setIncludeRetired(false)
    setSort(defaultSort)
  }

  return (
    <AppShell title="Closet" eyebrow="ALL ITEMS">
      <section className="filter-panel">
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
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">모든 카테고리</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
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
        <label className="check-row">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(event) => setIncludeRetired(event.target.checked)}
          />
          Retired 포함
        </label>
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
            <div className="item-grid">
              {items.map((item) => {
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
          )}
        </section>
      )}
    </AppShell>
  )
}
