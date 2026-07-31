import {
  AlertTriangle,
  BusFront,
  CarFront,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CloudRain,
  Footprints,
  MapPin,
  Thermometer,
  TrainFront,
} from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { LayeredOutfitPreview } from '../components/LayeredOutfitPreview'
import { OutfitPositionEditor } from '../components/OutfitPositionEditor'
import { OutfitVisual } from '../components/OutfitVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { formatMonthDayYear } from '../lib/date'
import type { RecommendationNavigationState } from '../lib/navigation'
import { getOutfitStats, outfitLabel } from '../lib/outfits'
import { feelingLabels, ratingLabels, recommendationLabels } from '../lib/types'

function TransportIcon({ name }: { name: string }) {
  const iconProps = { size: 15, 'aria-hidden': true as const }

  switch (name.trim()) {
    case '도보':
      return <Footprints {...iconProps} />
    case '차':
      return <CarFront {...iconProps} />
    case '버스':
      return <BusFront {...iconProps} />
    case '지하철':
      return <TrainFront {...iconProps} />
    default:
      return <CircleHelp {...iconProps} />
  }
}

export function OutfitDetailPage() {
  const { outfitId = '' } = useParams()
  const location = useLocation()
  const navigationState = (location.state ?? {}) as RecommendationNavigationState
  const {
    data,
    loading,
    error,
    refresh,
    updateOutfitItemPlacement,
  } = useClosetData()
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
  const hasCompleteCutoutSet =
    Boolean(outfit) &&
    items.length === outfit?.itemIds.length &&
    items.every((item) => Boolean(item.image))
  const canAdjustPositions = Boolean(outfit) && items.some((item) => item.image)

  return (
    <AppShell
      title="착장 상세"
      eyebrow="OUTFIT DETAIL"
      back
      hideTitle
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
              {navigationState.recommendation.similarEvidence && (
                <div className="similar-outfits">
                  <div className="similar-outfits__heading">
                    <div>
                      <p className="eyebrow">PARTIAL EVIDENCE</p>
                      <h2>비슷한 과거 착장</h2>
                    </div>
                    <span
                      className={`level level--partial-${navigationState.recommendation.similarEvidence.confidence}`}
                    >
                      근거{' '}
                      {navigationState.recommendation.similarEvidence.confidence ===
                      'medium'
                        ? '보통'
                        : '낮음'}
                    </span>
                  </div>
                  <p className="similar-outfits__note">
                    직접 입어본 기록은 아닙니다. 겹치는 아우터·하의·원피스에
                    더 큰 비중을 두고, 저장된 과거 Outfit만 비교했습니다.
                  </p>
                  <div className="similar-outfits__list">
                    {navigationState.recommendation.similarEvidence.matches.map(
                      (match) => {
                        const matchedOutfit = data.outfits.find(
                          (entry) => entry.id === match.outfitId,
                        )
                        if (!matchedOutfit) return null

                        return (
                          <Link
                            className="similar-outfit-row"
                            to={`/outfits/${match.outfitId}`}
                            key={match.outfitId}
                          >
                            <span>
                              <strong>
                                {outfitLabel(matchedOutfit, data.items)}
                              </strong>
                              <small>
                                {match.sharedItemCount}/{match.targetItemCount}개
                                일치 · 착용 {match.wearCount}회
                              </small>
                              {match.changedItemNames.length > 0 && (
                                <small>
                                  달라진 아이템 ·{' '}
                                  {match.changedItemNames.join(', ')}
                                </small>
                              )}
                            </span>
                            <span className="similar-outfit-row__range">
                              {match.okRange
                                ? `${match.okRange.min}~${match.okRange.max}°C`
                                : 'OK 온도 없음'}
                            </span>
                          </Link>
                        )
                      },
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="identity-card identity-card--outfit">
            {hasCompleteCutoutSet ? (
              <LayeredOutfitPreview
                outfit={outfit}
                items={data.items}
                className="layered-outfit-preview--hero"
              />
            ) : (
              <OutfitVisual
                outfit={outfit}
                items={data.items}
                className="outfit-visual--hero"
                maxSwatches={items.length}
              />
            )}
            <dl className="outfit-summary" aria-label="착장 요약">
              <div className="outfit-summary__item">
                <dt>선호도</dt>
                <dd>{outfit.rating ? ratingLabels[outfit.rating] : '미입력'}</dd>
              </div>
              <div className="outfit-summary__item">
                <dt>마지막 착용</dt>
                <dd>{formatMonthDayYear(stats?.lastWornOn ?? null)}</dd>
              </div>
              <div className="outfit-summary__item">
                <dt>착용 횟수</dt>
                <dd>{stats?.wearCount ?? 0}회</dd>
              </div>
            </dl>
          </section>

          {items.length !== outfit.itemIds.length && (
            <p className="relation-warning" role="alert">
              <AlertTriangle size={17} />
              연결된 아이템 일부를 찾을 수 없습니다.
            </p>
          )}

          <section className="section">
            <div className="section-heading">
              <h2>구성 아이템</h2>
              <span className="count">{items.length}개</span>
            </div>
            <div className="item-list">
              {items.map((item) => (
                <Link className="item-row" to={`/closet/${item.id}`} key={item.id}>
                  <ItemVisual item={item} className="item-visual--row" />
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
              <h2>착용 기록</h2>
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
                          <TransportIcon
                            name={transportName(log.transportModeId)!}
                          />
                          {transportName(log.transportModeId)}
                        </span>
                      )}
                      <span>
                        <CloudRain size={15} />
                        비 {log.rainCondition === 'yes' ? '해당' : '해당 없음'}
                      </span>
                      <span>
                        <Footprints size={15} />
                        걷기 {log.longWalkCondition === 'yes' ? '해당' : '해당 없음'}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div
            className={
              canAdjustPositions
                ? 'sticky-action sticky-action--after-position-editor'
                : 'sticky-action'
            }
          >
            <Link
              className="button button--primary button--wide"
              to={`/wear/${outfit.id}`}
              state={{
                input: navigationState.input,
                weather: navigationState.weather,
              }}
            >
              오늘 입기
            </Link>
          </div>

          {canAdjustPositions && (
            <details className="position-editor-disclosure">
              <summary>
                <span>
                  <small>OUTFIT IMAGE</small>
                  <strong>착장 이미지 수정</strong>
                </span>
                <ChevronDown size={22} aria-hidden="true" />
              </summary>
              <OutfitPositionEditor
                outfit={outfit}
                items={data.items}
                onSave={updateOutfitItemPlacement}
              />
            </details>
          )}
        </>
      )}
    </AppShell>
  )
}
