import {
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Footprints,
  MapPin,
  Thermometer,
  TrainFront,
} from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { Swatch } from '../components/Swatch'
import { useClosetData } from '../context/DataContext'
import type { RecommendationNavigationState } from '../lib/navigation'
import { getOutfitStats, outfitLabel } from '../lib/outfits'
import { feelingLabels, ratingLabels, recommendationLabels } from '../lib/types'

export function OutfitDetailPage() {
  const { outfitId = '' } = useParams()
  const location = useLocation()
  const navigationState = (location.state ?? {}) as RecommendationNavigationState
  const { data, loading, error, refresh } = useClosetData()
  const outfit = data?.outfits.find((entry) => entry.id === outfitId)
  const items =
    outfit && data
      ? outfit.itemIds
          .map((id) => data.items.find((item) => item.id === id))
          .filter((item): item is (typeof data.items)[number] => Boolean(item))
      : []
  const logs =
    data?.wearLogs
      .filter((log) => log.outfitId === outfitId)
      .sort((a, b) => b.wornOn.localeCompare(a.wornOn)) ?? []
  const stats = data ? getOutfitStats(outfitId, data.wearLogs) : null
  const placeName = (id: string | null) =>
    data?.places.find((place) => place.id === id)?.name ?? null
  const transportName = (id: string | null) =>
    data?.transportModes.find((mode) => mode.id === id)?.name ?? null

  return (
    <AppShell
      title={outfit && data ? outfitLabel(outfit, data.items) : 'Outfit'}
      eyebrow="OUTFIT DETAIL"
      back
    >
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && !outfit && (
        <ErrorState message="존재하지 않거나 접근할 수 없는 Outfit입니다." />
      )}
      {data && outfit && (
        <>
          {navigationState.recommendation && (
            <section className="recommendation-detail">
              <div className="recommendation-detail__heading">
                <span
                  className={`level level--${
                    navigationState.recommendation.evidence === 'untried'
                      ? 'trial'
                      : navigationState.recommendation.level
                  }`}
                >
                  {navigationState.recommendation.evidence === 'untried'
                    ? '시험 착장'
                    : recommendationLabels[navigationState.recommendation.level]}
                </span>
                <strong>
                  {navigationState.recommendation.evidence === 'untried'
                    ? `입력 ${navigationState.recommendation.targetTemp.toFixed(1)}°C · 미검증`
                    : `기준 ${navigationState.recommendation.targetTemp.toFixed(1)}°C`}
                </strong>
              </div>
              <ul className="evidence-list">
                {navigationState.recommendation.reasons.map((reason) => (
                  <li key={reason}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    {reason}
                  </li>
                ))}
                {navigationState.recommendation.warnings.map((warning) => (
                  <li className="warning-text" key={warning}>
                    <AlertTriangle size={17} aria-hidden="true" />
                    {warning}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="identity-card identity-card--outfit">
            <div className="outfit-card__swatches">
              {items.map((item) => (
                <Swatch
                  key={item.id}
                  color={item.displayHex}
                  label={item.semanticColor ?? item.name}
                  size="large"
                />
              ))}
            </div>
            <div>
              <p className="muted">품질 상태</p>
              <h2>{outfit.rating ? ratingLabels[outfit.rating] : '미입력'}</h2>
            </div>
          </section>

          {items.length !== outfit.itemIds.length && (
            <p className="relation-warning" role="alert">
              <AlertTriangle size={17} />
              연결된 아이템 일부를 찾을 수 없습니다.
            </p>
          )}

          <section className="detail-grid">
            <div>
              <span>착용 횟수</span>
              <strong>{stats?.wearCount ?? 0}회</strong>
            </div>
            <div>
              <span>마지막 착용</span>
              <strong>{stats?.lastWornOn ?? '기록 없음'}</strong>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>구성 아이템</h2>
              <span className="count">{items.length}개</span>
            </div>
            <div className="item-list">
              {items.map((item) => (
                <Link className="item-row" to={`/closet/${item.id}`} key={item.id}>
                  <Swatch
                    color={item.displayHex}
                    label={item.semanticColor ?? item.name}
                  />
                  <span className="item-row__body">
                    <strong>{item.name}</strong>
                    <span>{item.category}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>착용 근거</h2>
              <span className="count">{logs.length}개 기록</span>
            </div>
            {logs.length === 0 ? (
              <EmptyState title="아직 착용 기록이 없어요" />
            ) : (
              <div className="history-list">
                {logs.map((log) => (
                  <article className="history-card" key={log.id}>
                    <div className="history-card__heading">
                      <strong>{log.wornOn}</strong>
                      <Link to={`/records/${log.id}/edit`}>수정</Link>
                    </div>
                    <div className="history-card__facts">
                      <span>
                        <Thermometer size={15} />
                        출발 {log.tempOut ?? '—'}° / 귀가 {log.tempBack ?? '—'}°
                      </span>
                      <span>
                        체감 {log.feelingOut ? feelingLabels[log.feelingOut] : '—'} ·{' '}
                        {log.feelingBack ? feelingLabels[log.feelingBack] : '—'}
                      </span>
                      {placeName(log.placeId) && (
                        <span>
                          <MapPin size={15} />
                          {placeName(log.placeId)}
                        </span>
                      )}
                      {transportName(log.transportModeId) && (
                        <span>
                          <TrainFront size={15} />
                          {transportName(log.transportModeId)}
                        </span>
                      )}
                      <span>
                        <CloudRain size={15} />
                        비 {log.rainCondition === 'yes' ? '해당' : '해당 없음/미지정'}
                      </span>
                      <span>
                        <Footprints size={15} />
                        걷기 {log.longWalkCondition === 'yes' ? '해당' : '해당 없음/미지정'}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="sticky-action">
            <Link
              className="button button--primary button--wide"
              to={`/wear/${outfit.id}`}
              state={{ input: navigationState.input }}
            >
              오늘 입기
            </Link>
          </div>
        </>
      )}
    </AppShell>
  )
}
