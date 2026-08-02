import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { Swatch } from '../components/Swatch'
import { useStatisticsData } from '../features/statistics/useStatisticsData'
import { outfitLabel } from '../lib/outfits'

export function StatisticsPage() {
  const { snapshot, statistics, loading, error, refresh } = useStatisticsData()

  return (
    <AppShell title="Statistics" eyebrow="BASIC COUNTS" back>
      {loading && <LoadingState label="통계를 계산하는 중" />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {snapshot && statistics && (
        <>
          <section className="metric-grid" aria-label="전체 요약">
            <div>
              <span>Wear Logs</span>
              <strong>{statistics.summary.wearLogCount}</strong>
            </div>
            <div>
              <span>Outfits</span>
              <strong>{statistics.summary.outfitCount}</strong>
            </div>
            <div>
              <span>Items</span>
              <strong>{statistics.summary.itemCount}</strong>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>카테고리별 보유</h2>
              <span className="count">
                {statistics.detailedCategoryCount}종류
              </span>
            </div>
            <div className="category-stat-groups">
              {statistics.categoryGroups.map((group) => (
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
              <span className="count">{statistics.outfitRows.length}개</span>
            </div>
            <div className="ranking-list">
              {statistics.outfitRows.map(({ outfit, wearCount, lastWornOn }, index) => (
                <Link to={`/outfits/${outfit.id}`} key={outfit.id}>
                  <span className="ranking-list__rank">{index + 1}</span>
                  <span className="ranking-list__body">
                    <strong>{outfitLabel(outfit, snapshot.items)}</strong>
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
              <span className="count">{statistics.itemRows.length}개</span>
            </div>
            <div className="ranking-list">
              {statistics.itemRows.map(({ item, wearCount, lastWornOn }, index) => (
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
