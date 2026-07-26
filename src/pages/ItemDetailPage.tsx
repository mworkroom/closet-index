import { CloudRain, Footprints } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { Swatch } from '../components/Swatch'
import { useClosetData } from '../context/DataContext'
import { getItemStats, outfitLabel } from '../lib/outfits'

export function ItemDetailPage() {
  const { itemId = '' } = useParams()
  const { data, loading, error, refresh, updateItemSuitability } = useClosetData()
  const item = data?.items.find((entry) => entry.id === itemId)
  const [rainOk, setRainOk] = useState(true)
  const [longWalkOk, setLongWalkOk] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!item) return
    setRainOk(item.rainOk)
    setLongWalkOk(item.longWalkOk)
  }, [item])

  const includedOutfits = useMemo(
    () => data?.outfits.filter((outfit) => outfit.itemIds.includes(itemId)) ?? [],
    [data, itemId],
  )
  const stats =
    data && item ? getItemStats(item.id, data.outfits, data.wearLogs) : null
  const isShoes = item?.category.toLowerCase().includes('shoe') ?? false

  const save = async () => {
    if (!item) return
    setSaving(true)
    setSaved(false)
    try {
      await updateItemSuitability(item.id, rainOk, longWalkOk)
      setSaved(true)
    } catch {
      // DataContext owns the user-facing error state.
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title={item?.name ?? 'Item'} eyebrow="ITEM DETAIL" back>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && !item && (
        <ErrorState message="존재하지 않거나 접근할 수 없는 아이템입니다." />
      )}
      {item && data && (
        <>
          <section className="identity-card">
            <Swatch
              color={item.displayHex}
              label={item.semanticColor ?? item.name}
              size="large"
            />
            <div>
              <h2>{item.name}</h2>
              <p className="muted">
                {item.semanticColor ?? '색상 미입력'} · {item.displayHex}
              </p>
            </div>
          </section>

          <section className="detail-grid">
            <div>
              <span>카테고리</span>
              <strong>{item.category}</strong>
            </div>
            <div>
              <span>상태</span>
              <strong>{item.retired ? 'Retired' : '사용 중'}</strong>
            </div>
            <div>
              <span>구매일</span>
              <strong>
                {item.acquiredOn ? (
                  <time dateTime={item.acquiredOn}>{item.acquiredOn}</time>
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
              <strong>{stats?.lastWornOn ?? '기록 없음'}</strong>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">EDITABLE IN PHASE 1</p>
                <h2>조건 적합성</h2>
              </div>
            </div>
            <label className="field field--checkbox">
              <span>
                <CloudRain size={17} />
                비 오는 날 착용 불가
              </span>
              <input
                type="checkbox"
                checked={!rainOk}
                onChange={(event) => setRainOk(!event.target.checked)}
              />
            </label>
            {isShoes && (
              <label className="field field--checkbox">
                <span>
                  <Footprints size={17} />
                  장거리 걷기 불가
                </span>
                <input
                  type="checkbox"
                  checked={!longWalkOk}
                  onChange={(event) => setLongWalkOk(!event.target.checked)}
                />
              </label>
            )}
            <button
              className="button button--primary button--wide"
              type="button"
              disabled={
                saving ||
                (rainOk === item.rainOk && longWalkOk === item.longWalkOk)
              }
              onClick={() => void save()}
            >
              {saving ? '저장 중…' : '적합성 저장'}
            </button>
            {saved && <p className="success-message">저장했습니다.</p>}
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>포함된 Outfit</h2>
              <span className="count">{includedOutfits.length}개</span>
            </div>
            {includedOutfits.length === 0 ? (
              <EmptyState title="포함된 Outfit이 없어요" />
            ) : (
              <div className="simple-list">
                {includedOutfits.map((outfit) => (
                  <Link to={`/outfits/${outfit.id}`} key={outfit.id}>
                    <span>{outfitLabel(outfit, data.items)}</span>
                    <span className="muted">보기</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  )
}
