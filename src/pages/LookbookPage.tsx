import { Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { OutfitCard } from '../components/OutfitCard'
import { SeasonScopeSummary } from '../components/SeasonScopeSummary'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import { getOutfitStats, outfitLabel } from '../lib/outfits'
import { sortPlacesForSelection } from '../lib/place-options'
import { outfitMatchesSeasonScope } from '../lib/seasons'
import { COLLECTION_BATCH_SIZE } from '../lib/collection-pagination'

function parseOptionalNumber(value: string) {
  return value.trim() === '' ? null : Number(value)
}

export function LookbookPage({ favoriteOnly = false }: { favoriteOnly?: boolean }) {
  const { data, loading, error, refresh } = useClosetData()
  const { activeSeasons } = useSeasonScope()
  const [query, setQuery] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [unwornOnly, setUnwornOnly] = useState(false)
  const [notWornRecently, setNotWornRecently] = useState(false)
  const [minimumTemp, setMinimumTemp] = useState('')
  const [maximumTemp, setMaximumTemp] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [includeUnavailable, setIncludeUnavailable] = useState(false)
  const [visibleOutfitCount, setVisibleOutfitCount] = useState(COLLECTION_BATCH_SIZE)

  useEffect(() => {
    setVisibleOutfitCount(COLLECTION_BATCH_SIZE)
  }, [
    activeSeasons,
    favorite,
    favoriteOnly,
    includeUnavailable,
    maximumTemp,
    minimumTemp,
    notWornRecently,
    placeId,
    query,
    unwornOnly,
  ])

  const outfits = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLocaleLowerCase('ko')
    const minTemp = parseOptionalNumber(minimumTemp)
    const maxTemp = parseOptionalNumber(maximumTemp)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffDate = cutoff.toISOString().slice(0, 10)
    const lastWornOnByOutfit = new Map<string, string>()
    for (const log of data.wearLogs) {
      const current = lastWornOnByOutfit.get(log.outfitId)
      if (!current || log.wornOn > current) {
        lastWornOnByOutfit.set(log.outfitId, log.wornOn)
      }
    }

    return data.outfits
      .filter((outfit) => {
        const items = outfit.itemIds
          .map((id) => data.items.find((item) => item.id === id))
          .filter((item): item is (typeof data.items)[number] => Boolean(item))
        const unavailable =
          Boolean(outfit.archivedAt) ||
          outfit.rating === 'error' ||
          items.length !== outfit.itemIds.length ||
          items.some((item) => item.retired)
        if (!includeUnavailable && unavailable) return false
        if ((favoriteOnly || favorite) && outfit.rating !== 'favorite') return false
        if (!outfitMatchesSeasonScope(outfit, data.items, activeSeasons)) {
          return false
        }
        if (
          normalized &&
          !`${outfitLabel(outfit, data.items)} ${items.map((item) => item.name).join(' ')}`
            .toLocaleLowerCase('ko')
            .includes(normalized)
        ) {
          return false
        }
        const logs = data.wearLogs.filter((log) => log.outfitId === outfit.id)
        if (unwornOnly && logs.length > 0) return false
        if (placeId && !logs.some((log) => log.placeId === placeId)) return false
        if (notWornRecently) {
          const last = getOutfitStats(outfit.id, data.wearLogs).lastWornOn
          if (last && last > cutoffDate) return false
        }
        if (minTemp !== null || maxTemp !== null) {
          const okTemps = logs.flatMap((log) => [
            ...(log.feelingOut === 'ok' && log.tempOut !== null ? [log.tempOut] : []),
            ...(log.feelingBack === 'ok' && log.tempBack !== null ? [log.tempBack] : []),
          ])
          const overlaps = okTemps.some(
            (temp) =>
              (minTemp === null || temp >= minTemp) &&
              (maxTemp === null || temp <= maxTemp),
          )
          if (!overlaps) return false
        }
        return true
      })
      .sort((a, b) =>
        (lastWornOnByOutfit.get(b.id) ?? '').localeCompare(
          lastWornOnByOutfit.get(a.id) ?? '',
        ),
      )
  }, [
    activeSeasons,
    data,
    favorite,
    favoriteOnly,
    includeUnavailable,
    maximumTemp,
    minimumTemp,
    notWornRecently,
    placeId,
    query,
    unwornOnly,
  ])

  const reset = () => {
    setQuery('')
    setFavorite(false)
    setUnwornOnly(false)
    setNotWornRecently(false)
    setMinimumTemp('')
    setMaximumTemp('')
    setPlaceId('')
    setIncludeUnavailable(false)
  }

  return (
    <AppShell
      title={favoriteOnly ? 'Favorite' : 'Lookbook'}
      eyebrow={favoriteOnly ? 'FAVORITE OUTFITS' : 'ALL OUTFITS'}
      action={
        !favoriteOnly ? (
          <Link className="button button--primary" to="/outfits/new">
            Add
          </Link>
        ) : undefined
      }
    >
      {favoriteOnly && (
        <p className="scope-note">Favorite로 평가한 착장만 보고 있습니다.</p>
      )}
      <section className="filter-panel">
        <SeasonScopeSummary />
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">착장 검색</span>
          <input
            type="search"
            placeholder="착장 또는 아이템 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-row">
          <select
            aria-label="장소"
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
          >
            <option value="">모든 장소</option>
            {sortPlacesForSelection(data?.places ?? []).map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>
        <div className="temperature-filter" aria-label="OK 온도 범위">
          <SlidersHorizontal size={18} aria-hidden="true" />
          <input
            type="number"
            step="1"
            min="-50"
            max="60"
            value={minimumTemp}
            placeholder="최저 °C"
            aria-label="최저 온도"
            onChange={(event) => setMinimumTemp(event.target.value)}
          />
          <span>—</span>
          <input
            type="number"
            step="1"
            min="-50"
            max="60"
            value={maximumTemp}
            placeholder="최고 °C"
            aria-label="최고 온도"
            onChange={(event) => setMaximumTemp(event.target.value)}
          />
        </div>
        <div className="check-stack">
          {!favoriteOnly && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={favorite}
                onChange={(event) => setFavorite(event.target.checked)}
              />
              Favorite
            </label>
          )}
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
              checked={notWornRecently}
              onChange={(event) => setNotWornRecently(event.target.checked)}
            />
            최근 90일 미착용
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeUnavailable}
              onChange={(event) => setIncludeUnavailable(event.target.checked)}
            />
            Error·Retired·보관 포함
          </label>
        </div>
      </section>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && (
        <section className="section">
          <div className="section-heading">
            <h2>{favoriteOnly ? 'Favorite 착장' : '착장'}</h2>
            <span className="count">{outfits.length}개</span>
          </div>
          {outfits.length === 0 ? (
            <EmptyState
              title={favoriteOnly ? 'Favorite 착장이 없어요' : '필터에 맞는 착장이 없어요'}
              description={
                favoriteOnly
                  ? 'Lookbook에서 전체 착장을 확인할 수 있습니다.'
                  : undefined
              }
              action={
                favoriteOnly ? (
                  <Link className="button button--secondary" to="/lookbook">
                    전체 Lookbook 보기
                  </Link>
                ) : (
                  <button className="button button--secondary" type="button" onClick={reset}>
                    필터 초기화
                  </button>
                )
              }
            />
          ) : (
            <>
              <div className="outfit-grid">
                {outfits.slice(0, visibleOutfitCount).map((outfit) => (
                  <OutfitCard
                    outfit={outfit}
                    data={data}
                    layout="grid"
                    key={outfit.id}
                  />
                ))}
              </div>
              {visibleOutfitCount < outfits.length && (
                <div className="collection-load-more">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() =>
                      setVisibleOutfitCount((current) =>
                        Math.min(current + COLLECTION_BATCH_SIZE, outfits.length),
                      )
                    }
                  >
                    더 보기 ({Math.min(visibleOutfitCount, outfits.length)}/{outfits.length})
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
