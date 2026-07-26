import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { Swatch } from '../components/Swatch'
import { useClosetData } from '../context/DataContext'
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
