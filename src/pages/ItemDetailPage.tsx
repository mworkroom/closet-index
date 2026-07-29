import { CloudRain, Footprints } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemImageEditor } from '../components/ItemImageEditor'
import { ItemVisual } from '../components/ItemVisual'
import { OutfitCard } from '../components/OutfitCard'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { formatMonthDayYear } from '../lib/date'
import { getItemStats, getOutfitStats } from '../lib/outfits'

export function ItemDetailPage() {
  const { itemId = '' } = useParams()
  const {
    data,
    loading,
    error,
    refresh,
    setItemRetired,
    updateItemSuitability,
  } = useClosetData()
  const item = data?.items.find((entry) => entry.id === itemId)
  const [rainOk, setRainOk] = useState(true)
  const [longWalkOk, setLongWalkOk] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [retireConfirming, setRetireConfirming] = useState(false)
  const [retireSaving, setRetireSaving] = useState(false)
  const [visibleOutfitCount, setVisibleOutfitCount] = useState(9)

  useEffect(() => {
    if (!item) return
    setRainOk(item.rainOk)
    setLongWalkOk(item.longWalkOk)
  }, [item])

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

  const changeRetired = async (retired: boolean) => {
    if (!item) return
    setRetireSaving(true)
    try {
      await setItemRetired(item.id, retired)
      setRetireConfirming(false)
    } catch {
      // DataContext owns the user-facing error state.
    } finally {
      setRetireSaving(false)
    }
  }

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
                <dd>{item.retired ? 'Retired' : '사용 중'}</dd>
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

          <ItemImageEditor item={item} />

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

          <section className="panel item-lifecycle-panel">
            <div>
              <p className="eyebrow">LIFECYCLE</p>
              <h2>{item.retired ? 'Retired Item' : '사용 중인 Item'}</h2>
            </div>
            <p>
              {item.retired
                ? '목록의 Retired 포함 필터에서 계속 확인할 수 있습니다.'
                : '더 이상 사용하지 않는 Item은 기록을 지우지 않고 Retired로 전환합니다.'}
            </p>
            {item.retired ? (
              <button
                className="button button--secondary button--wide"
                type="button"
                disabled={retireSaving}
                onClick={() => void changeRetired(false)}
              >
                {retireSaving ? '변경 중…' : '사용 중으로 되돌리기'}
              </button>
            ) : retireConfirming ? (
              <div className="retire-confirmation" role="alert">
                <strong>이 Item을 Retired로 전환할까요?</strong>
                <p>기존 Outfit과 착용 기록은 그대로 유지됩니다.</p>
                <div>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={retireSaving}
                    onClick={() => setRetireConfirming(false)}
                  >
                    취소
                  </button>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={retireSaving}
                    onClick={() => void changeRetired(true)}
                  >
                    {retireSaving ? '변경 중…' : 'Retired로 전환'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="button button--secondary button--wide"
                type="button"
                onClick={() => setRetireConfirming(true)}
              >
                Retired로 전환
              </button>
            )}
          </section>

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
