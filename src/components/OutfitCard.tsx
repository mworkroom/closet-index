import { AlertTriangle, ChevronRight, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AppData, Outfit, RecommendationResult } from '../lib/types'
import { formatMonthDayYear } from '../lib/date'
import { getOutfitStats, outfitLabel } from '../lib/outfits'
import { ratingLabels, recommendationLabels } from '../lib/types'
import { OutfitVisual } from './OutfitVisual'

export function OutfitCard({
  outfit,
  data,
  recommendation,
  purchaseHighlight = false,
  state,
  layout = 'list',
}: {
  outfit: Outfit
  data: AppData
  recommendation?: RecommendationResult
  purchaseHighlight?: boolean
  state?: unknown
  layout?: 'list' | 'grid' | 'home'
}) {
  const items = outfit.itemIds
    .map((id) => data.items.find((item) => item.id === id))
    .filter((item): item is AppData['items'][number] => Boolean(item))
  const stats = getOutfitStats(outfit.id, data.wearLogs)
  const isTrial = recommendation?.evidence === 'untried'
  const similarEvidence = recommendation?.similarEvidence
  const similarMatch = similarEvidence?.matches[0]
  const homeRange = isTrial
    ? (similarEvidence?.aggregateOkRange ?? similarMatch?.okRange)
    : recommendation?.okRange
  const homeOkCount = isTrial
    ? similarEvidence?.aggregateOkRange
      ? similarEvidence.aggregateOkObservationCount
      : similarMatch?.okObservationCount
    : recommendation?.okObservationCount
  const accessibleLabel = `${outfit.archivedAt ? '보관된 ' : ''}${outfitLabel(
    outfit,
    data.items,
  )} 착장 상세 보기`

  return (
    <Link
      className={`outfit-card outfit-card--${layout}`}
      to={`/outfits/${outfit.id}`}
      state={state}
      aria-label={
        layout === 'home' || layout === 'grid' ? accessibleLabel : undefined
      }
    >
      <OutfitVisual
        outfit={outfit}
        items={data.items}
        className="outfit-card__visual"
      />
      {layout === 'home' ? (
        <div className="outfit-card__home-summary" aria-hidden="true">
          <div className="outfit-card__home-group">
            {outfit.rating && (
              <strong className={`outfit-card__home-rating badge--${outfit.rating}`}>
                {outfit.rating === 'favorite' && (
                  <Heart size={14} fill="currentColor" />
                )}
                {outfit.rating === 'error' && <AlertTriangle size={14} />}
                {ratingLabels[outfit.rating]}
              </strong>
            )}
            <span>착용 {stats.wearCount}회</span>
            <span>
              {stats.lastWornOn
                ? `최근 ${formatMonthDayYear(stats.lastWornOn)}`
                : '최근 기록 없음'}
            </span>
          </div>

          {recommendation && (
            <div className="outfit-card__home-group outfit-card__home-group--evidence">
              <strong
                className={`outfit-card__home-level outfit-card__home-level--${
                  isTrial ? 'trial' : recommendation.level
                }`}
              >
                {isTrial
                  ? '시험 착장'
                  : recommendationLabels[recommendation.level]}
              </strong>
              {isTrial && similarEvidence && (
                <span>
                  부분 근거{' '}
                  {similarEvidence.confidence === 'medium' ? '보통' : '낮음'}
                </span>
              )}
              <span>
                {homeRange
                  ? `${homeRange.min}~${homeRange.max}°C ${
                      isTrial ? '시험 범위' : '적정 범위'
                    }`
                  : '적정 범위 없음'}
              </span>
              <span>
                {homeOkCount
                  ? `${isTrial ? '근거 ' : ''}OK ${homeOkCount}${
                      isTrial ? '개' : '회'
                    }`
                  : 'OK 기록 없음'}
              </span>
            </div>
          )}
        </div>
      ) : layout === 'grid' ? (
        <div className="outfit-card__grid-summary" aria-hidden="true">
          {outfit.archivedAt && <strong>보관됨</strong>}
          <span>착용 {stats.wearCount}회</span>
          <span>
            {stats.lastWornOn
              ? `최근 ${formatMonthDayYear(stats.lastWornOn)}`
              : '최근 기록 없음'}
          </span>
        </div>
      ) : (
        <div className="outfit-card__body">
          <div className="outfit-card__title-row">
            <h2>{outfitLabel(outfit, data.items)}</h2>
            <ChevronRight size={19} aria-hidden="true" />
          </div>
          <p className="muted outfit-card__items">
            {items.map((item) => item.name).join(' · ')}
          </p>
          <div className="meta-row">
            {outfit.rating && (
              <span className={`badge badge--${outfit.rating}`}>
                {outfit.rating === 'favorite' && (
                  <Heart size={13} fill="currentColor" />
                )}
                {outfit.rating === 'error' && <AlertTriangle size={13} />}
                {ratingLabels[outfit.rating]}
              </span>
            )}
            {purchaseHighlight && recommendation?.latestAcquiredOn && (
              <span className="badge badge--recent">
                최근 구매 {recommendation.latestAcquiredOn}
              </span>
            )}
            <span>착용 {stats.wearCount}회</span>
            <span>
              {stats.lastWornOn ? `최근 ${stats.lastWornOn}` : '기록 없음'}
            </span>
          </div>
          {recommendation && (
            <div className="recommendation-summary">
              <span
                className={`level level--${
                  isTrial ? 'trial' : recommendation.level
                }`}
              >
                {isTrial
                  ? '시험 착장'
                  : recommendationLabels[recommendation.level]}
              </span>
              {isTrial && similarEvidence && (
                <span
                  className={`level level--partial-${similarEvidence.confidence}`}
                >
                  부분 근거{' '}
                  {similarEvidence.confidence === 'medium' ? '보통' : '낮음'}
                </span>
              )}
              <span>{recommendation.reasons[0]}</span>
            </div>
          )}
          {isTrial && similarEvidence && (
            <p className="similar-evidence-summary">
              {similarEvidence.totalCoreItemCount > 0
                ? `핵심 Item ${similarEvidence.supportedCoreItemCount}/${similarEvidence.totalCoreItemCount}개에 OK 온도 근거`
                : `기존 아이템 ${similarEvidence.knownItemCount}/${similarEvidence.totalItemCount}개에 착용 근거 있음`}
            </p>
          )}
          {purchaseHighlight &&
            recommendation &&
            recommendation.latestAcquiredItemNames.length > 0 && (
              <p className="purchase-highlight">
                최근 아이템 · {recommendation.latestAcquiredItemNames.join(', ')}
              </p>
            )}
        </div>
      )}
    </Link>
  )
}
