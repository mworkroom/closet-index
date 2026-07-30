import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { Swatch } from '../components/Swatch'
import { useClosetData } from '../context/DataContext'
import { getItemCategoryStatistics } from '../lib/item-categories'
import { getItemStats, getOutfitStats, outfitLabel } from '../lib/outfits'

export function StatisticsPage() {
  const { data, loading, error, refresh } = useClosetData()
  const outfitRows = useMemo(
    () =>
      data
        ? data.outfits
            .map((outfit) => ({
              outfit,
              ...getOutfitStats(outfit.id, data.wearLogs),
            }))
            .sort(
              (a, b) =>
                b.wearCount - a.wearCount ||
                (b.lastWornOn ?? '').localeCompare(a.lastWornOn ?? ''),
            )
        : [],
    [data],
  )
  const itemRows = useMemo(
    () =>
      data
        ? data.items
            .map((item) => ({
              item,
              ...getItemStats(item.id, data.outfits, data.wearLogs),
            }))
            .sort(
              (a, b) =>
                b.wearCount - a.wearCount ||
                (b.lastWornOn ?? '').localeCompare(a.lastWornOn ?? ''),
            )
        : [],
    [data],
  )
  const categoryGroups = useMemo(
    () => getItemCategoryStatistics(data?.items ?? []),
    [data],
  )

  return (
    <AppShell title="Statistics" eyebrow="BASIC COUNTS" back>
      {loading && <LoadingState label="통계를 계산하는 중" />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && (
        <>
          <section className="metric-grid" aria-label="전체 요약">
            <div>
              <span>Wear Logs</span>
              <strong>{data.wearLogs.length}</strong>
            </div>
            <div>
              <span>Outfits</span>
              <strong>{data.outfits.length}</strong>
            </div>
            <div>
              <span>Items</span>
              <strong>{data.items.length}</strong>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>카테고리별 보유</h2>
              <span className="count">
                {categoryGroups.reduce(
                  (total, group) => total + group.categories.length,
                  0,
                )}
                종류
              </span>
            </div>
            <div className="category-stat-groups">
              {categoryGroups.map((group) => (
                <section
                  className="category-stat-group"
                  aria-labelledby={`category-group-${group.id}`}
                  key={group.id}
                >
                  <div className="category-stat-group__heading">
                    <h3 id={`category-group-${group.id}`}>{group.label}</h3>
                    <span>
                      전체 {group.totalCount}개 · 사용 중 {group.activeCount}개
                    </span>
                  </div>
                  <dl className="category-stat-list">
                    {group.categories.map((category) => (
                      <div key={category.category}>
                        <dt>{category.category}</dt>
                        <dd>
                          <strong>{category.totalCount}개</strong>
                          <span>사용 중 {category.activeCount}개</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Outfit별 착용</h2>
              <span className="count">{outfitRows.length}개</span>
            </div>
            <div className="ranking-list">
              {outfitRows.map(({ outfit, wearCount, lastWornOn }, index) => (
                <Link to={`/outfits/${outfit.id}`} key={outfit.id}>
                  <span className="ranking-list__rank">{index + 1}</span>
                  <span className="ranking-list__body">
                    <strong>{outfitLabel(outfit, data.items)}</strong>
                    <span>{lastWornOn ? `최근 ${lastWornOn}` : '기록 없음'}</span>
                  </span>
                  <strong>{wearCount}회</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Item별 착용</h2>
              <span className="count">{itemRows.length}개</span>
            </div>
            <div className="ranking-list">
              {itemRows.map(({ item, wearCount, lastWornOn }, index) => (
                <Link to={`/closet/${item.id}`} key={item.id}>
                  <span className="ranking-list__rank">{index + 1}</span>
                  <Swatch
                    color={item.displayHex}
                    label={item.semanticColor ?? item.name}
                    size="small"
                  />
                  <span className="ranking-list__body">
                    <strong>{item.name}</strong>
                    <span>{lastWornOn ? `최근 ${lastWornOn}` : '기록 없음'}</span>
                  </span>
                  <strong>{wearCount}회</strong>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  )
}
