import { AlertTriangle, ChevronRight, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AppData, Outfit, RecommendationResult } from '../lib/types'
import { getOutfitStats, outfitLabel } from '../lib/outfits'
import { ratingLabels, recommendationLabels } from '../lib/types'
import { Swatch } from './Swatch'

export function OutfitCard({
  outfit,
  data,
  recommendation,
  purchaseHighlight = false,
  state,
}: {
  outfit: Outfit
  data: AppData
  recommendation?: RecommendationResult
  purchaseHighlight?: boolean
  state?: unknown
}) {
  const items = outfit.itemIds
    .map((id) => data.items.find((item) => item.id === id))
    .filter((item): item is AppData['items'][number] => Boolean(item))
  const stats = getOutfitStats(outfit.id, data.wearLogs)
  const isTrial = recommendation?.evidence === 'untried'
  const similarEvidence = recommendation?.similarEvidence

  return (
    <Link className="outfit-card" to={`/outfits/${outfit.id}`} state={state}>
      <div className="outfit-card__swatches" aria-label="구성 아이템 색상">
        {items.slice(0, 5).map((item) => (
          <Swatch
            key={item.id}
            color={item.displayHex}
            label={item.semanticColor ?? item.name}
            size="large"
          />
        ))}
      </div>
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
              {outfit.rating === 'favorite' && <Heart size={13} fill="currentColor" />}
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
          <span>{stats.lastWornOn ? `최근 ${stats.lastWornOn}` : '기록 없음'}</span>
        </div>
        {recommendation && (
          <div className="recommendation-summary">
            <span
              className={`level level--${
                isTrial ? 'trial' : recommendation.level
              }`}
            >
              {isTrial ? '시험 착장' : recommendationLabels[recommendation.level]}
            </span>
            {isTrial && similarEvidence && (
              <span
                className={`level level--partial-${similarEvidence.confidence}`}
              >
                부분 근거 {similarEvidence.confidence === 'medium' ? '보통' : '낮음'}
              </span>
            )}
            <span>{recommendation.reasons[0]}</span>
          </div>
        )}
        {isTrial && similarEvidence && (
          <p className="similar-evidence-summary">
            기존 아이템 {similarEvidence.knownItemCount}/
            {similarEvidence.totalItemCount}개에 착용 근거 있음
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
    </Link>
  )
}
