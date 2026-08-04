import {
  Archive,
  AlertTriangle,
  BusFront,
  CarFront,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CloudRain,
  Copy,
  Pencil,
  Footprints,
  MapPin,
  RotateCcw,
  Thermometer,
  TrainFront,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
  const navigate = useNavigate()
  const navigationState = (location.state ?? {}) as RecommendationNavigationState
  const {
    data,
    loading,
    error,
    refresh,
    setOutfitArchived,
    deleteOutfit,
    deleteWearLog,
    updateOutfitItemPlacement,
  } = useClosetData()
  const [archiveConfirming, setArchiveConfirming] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLogConfirmingId, setDeleteLogConfirmingId] = useState<string | null>(
    null,
  )
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null)
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

  const changeArchived = async (archived: boolean) => {
    if (!outfit || archiveSaving) return
    setArchiveSaving(true)
    try {
      await setOutfitArchived(outfit.id, archived)
      setArchiveConfirming(false)
    } catch {
      // DataContext에서 공통 오류 메시지를 표시한다.
    } finally {
      setArchiveSaving(false)
    }
  }

  const removeOutfit = async () => {
    if (!outfit || deleteSaving || logs.length > 0) return
    setDeleteSaving(true)
    setDeleteError(null)
    try {
      await deleteOutfit(outfit.id)
      navigate('/lookbook', { replace: true })
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : 'Outfit을 삭제하지 못했습니다.',
      )
    } finally {
      setDeleteSaving(false)
    }
  }

  const removeWearLog = async (id: string) => {
    if (deletingLogId) return
    setDeletingLogId(id)
    try {
      await deleteWearLog(id)
      setDeleteLogConfirmingId(null)
    } catch {
      // DataContext에서 공통 오류 메시지를 표시한다.
    } finally {
      setDeletingLogId(null)
    }
  }

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
          {outfit.archivedAt && (
            <section className="outfit-archive-notice" role="status">
              <span>
                <strong>보관된 Outfit</strong>
                <small>
                  기본 Lookbook과 추천에서는 숨겨져 있습니다. 기존 착용 기록은
                  그대로 유지됩니다.
                </small>
              </span>
            </section>
          )}
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
                      <h2>과거 Item·Outfit 근거</h2>
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
                    직접 입어본 조합은 아닙니다. 상의를 포함한 핵심 Item이
                    과거에 OK였던 온도를 모아 공통 구간을 만들고, 비슷한 과거
                    Outfit도 함께 비교했습니다. Outfit 유사도에서는
                    아우터·하의·원피스 3, 상의 2의 가중치를 사용합니다.
                  </p>
                  {navigationState.recommendation.similarEvidence.itemEvidence
                    .length > 0 && (
                    <div className="similar-outfits__subsection">
                      <h3>핵심 Item별 OK 온도</h3>
                      <div className="similar-outfits__list">
                        {navigationState.recommendation.similarEvidence.itemEvidence.map(
                          (evidence) => (
                            <div
                              className="similar-outfit-row similar-outfit-row--item"
                              key={evidence.itemId}
                            >
                              <span>
                                <strong>{evidence.itemName}</strong>
                                <small>
                                  {evidence.category} · 과거 착용{' '}
                                  {evidence.wearCount}회 · OK 관측{' '}
                                  {evidence.okObservationCount}개
                                </small>
                              </span>
                              <span className="similar-outfit-row__range">
                                {evidence.okRange.min}~{evidence.okRange.max}°C
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                  {navigationState.recommendation.similarEvidence.matches.length >
                    0 && (
                    <div className="similar-outfits__subsection">
                      <h3>비슷한 과거 Outfit</h3>
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
                                    {match.sharedItemCount}/
                                    {match.targetItemCount}개 일치 · 착용{' '}
                                    {match.wearCount}회
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
            <div className="record-management__actions">
              <Link
                className="button button--primary"
                to={`/outfits/${encodeURIComponent(outfit.id)}/edit`}
              >
                <Pencil size={17} aria-hidden="true" />
                착장 수정
              </Link>
              <Link
                className="button button--secondary"
                to={`/outfits/new?source=${encodeURIComponent(outfit.id)}`}
              >
                <Copy size={17} aria-hidden="true" />
                새로 만들기
              </Link>
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
                      <div className="history-card__actions">
                        <Link to={`/records/${log.id}/edit`}>수정</Link>
                        <button
                          type="button"
                          disabled={deletingLogId === log.id}
                          onClick={() => setDeleteLogConfirmingId(log.id)}
                        >
                          삭제
                        </button>
                      </div>
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
                    {deleteLogConfirmingId === log.id && (
                      <div className="history-card__confirmation" role="alert">
                        <strong>이 착용 기록을 삭제할까요?</strong>
                        <p>삭제 후 착용 횟수와 관련 통계가 다시 계산됩니다.</p>
                        <div>
                          <button
                            className="button button--secondary"
                            type="button"
                            disabled={deletingLogId === log.id}
                            onClick={() => setDeleteLogConfirmingId(null)}
                          >
                            취소
                          </button>
                          <button
                            className="button button--danger"
                            type="button"
                            disabled={deletingLogId === log.id}
                            onClick={() => void removeWearLog(log.id)}
                          >
                            {deletingLogId === log.id ? '삭제 중' : '삭제 확인'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          {!outfit.archivedAt && (
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
          )}

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

          <section className="record-management" aria-label="착장 삭제 및 보관">
            <div className="record-management__actions">
              <button
                type="button"
                className="button button--danger"
                disabled={deleteSaving || logs.length > 0}
                onClick={() => setDeleteConfirming(true)}
              >
                <Trash2 size={17} aria-hidden="true" />
                삭제
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={archiveSaving}
                onClick={() =>
                  outfit.archivedAt
                    ? void changeArchived(false)
                    : setArchiveConfirming(true)
                }
              >
                {outfit.archivedAt ? (
                  <RotateCcw size={17} aria-hidden="true" />
                ) : (
                  <Archive size={17} aria-hidden="true" />
                )}
                {archiveSaving
                  ? '변경 중…'
                  : outfit.archivedAt
                    ? '복원'
                    : '보관'}
              </button>
            </div>

            {logs.length > 0 && (
              <p className="record-management__help">
                착용 기록 {logs.length}개가 있어 삭제할 수 없습니다.
              </p>
            )}

            {deleteConfirming && logs.length === 0 && (
              <div className="record-management__confirmation" role="alert">
                <strong>이 Outfit을 영구 삭제할까요?</strong>
                <p>구성 정보는 복구할 수 없습니다.</p>
                <div>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={deleteSaving}
                    onClick={() => setDeleteConfirming(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={deleteSaving}
                    onClick={() => void removeOutfit()}
                  >
                    {deleteSaving ? '삭제 중…' : '삭제 확인'}
                  </button>
                </div>
              </div>
            )}

            {archiveConfirming && !outfit.archivedAt && (
              <div className="record-management__confirmation" role="alert">
                <strong>이 Outfit을 보관할까요?</strong>
                <p>
                  기본 Lookbook과 추천에서만 숨깁니다. 평가와 기존 착용 기록은
                  유지되며 언제든 복원할 수 있습니다.
                </p>
                <div>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={archiveSaving}
                    onClick={() => setArchiveConfirming(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={archiveSaving}
                    onClick={() => void changeArchived(true)}
                  >
                    {archiveSaving ? '보관 중…' : '보관 확인'}
                  </button>
                </div>
              </div>
            )}

            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
          </section>
        </>
      )}
    </AppShell>
  )
}
