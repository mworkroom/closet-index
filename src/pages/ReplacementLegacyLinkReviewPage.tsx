import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildLegacyLinkReviewQueue,
  describeLegacyLinkDecision,
  type LegacyLinkReviewPair,
} from '../features/replacement-lines/legacy-link-review'
import { formatMonthDayYear } from '../lib/date'
import type {
  ReplacementLegacyLink,
  ReplacementLegacyLinkDecision,
  ReplacementLineSnapshot,
} from '../lib/types'

const DECISIONS: Array<{
  value: ReplacementLegacyLinkDecision
  label: string
  description: string
}> = [
  {
    value: 'a_to_b',
    label: 'A → B',
    description: 'A가 이전 Item, B가 후속 Item',
  },
  {
    value: 'b_to_a',
    label: 'B → A',
    description: 'B가 이전 Item, A가 후속 Item',
  },
  {
    value: 'parallel',
    label: '동등·병렬 후보',
    description: '직접 predecessor·successor로 저장하지 않음',
  },
  {
    value: 'not_replacement',
    label: '대체 관계 아님',
    description: 'Legacy Link를 계보 edge로 바꾸지 않음',
  },
]

function ReviewItemCard({
  pair,
  side,
}: {
  pair: LegacyLinkReviewPair
  side: 'A' | 'B'
}) {
  const item = side === 'A' ? pair.itemA : pair.itemB
  return (
    <article
      className="legacy-review-item-card"
      aria-label={item ? `Item ${side}: ${item.name}` : `Item ${side}: 확인 불가`}
    >
      <span className="legacy-review-item-card__side">ITEM {side}</span>
      {item ? (
        <>
          <ItemVisual item={item} className="legacy-review-item-card__visual" />
          <div className="legacy-review-item-card__body">
            <strong>{item.name}</strong>
            <span>{item.retired ? 'Retired' : 'Active'}</span>
            <span>
              {item.acquiredOn
                ? `취득 ${formatMonthDayYear(item.acquiredOn)}`
                : '취득일 미상'}
            </span>
          </div>
          <Link to={`/closet/${item.id}`}>Item 상세</Link>
        </>
      ) : (
        <p className="warning-text">현재 workspace에서 확인할 수 없습니다.</p>
      )}
    </article>
  )
}

export function ReplacementLegacyLinkReviewPage() {
  const {
    data,
    loadReplacementLines,
    loadReplacementLegacyLinks,
    reviewReplacementLegacyLink,
  } = useClosetData()
  const [lineSnapshot, setLineSnapshot] =
    useState<ReplacementLineSnapshot | null>(null)
  const [links, setLinks] = useState<ReplacementLegacyLink[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [decision, setDecision] =
    useState<ReplacementLegacyLinkDecision | null>(null)
  const [reason, setReason] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextLines, nextLinks] = await Promise.all([
        loadReplacementLines(),
        loadReplacementLegacyLinks(),
      ])
      setLineSnapshot(nextLines)
      setLinks(nextLinks)
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : 'Legacy Link 검토 데이터를 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadReplacementLegacyLinks, loadReplacementLines])

  useEffect(() => {
    void load()
  }, [load])

  const queue = useMemo(
    () =>
      links && lineSnapshot && data
        ? buildLegacyLinkReviewQueue(links, lineSnapshot, data.items)
        : null,
    [data, lineSnapshot, links],
  )
  const currentPair = queue?.pendingPairs.find((pair) => pair.reviewable) ?? null

  useEffect(() => {
    setDecision(null)
    setReason('')
    setPreviewing(false)
    setSaveError(null)
  }, [currentPair?.link.id])

  const confirmReview = async () => {
    if (!currentPair || !decision || !reason.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const reviewed = await reviewReplacementLegacyLink(currentPair.link.id, {
        decision,
        reason,
      })
      setLinks((current) =>
        current?.map((link) => (link.id === reviewed.id ? reviewed : link)) ??
        current,
      )
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '검토 결과를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const totalCount = queue?.pairs.length ?? 0
  const reviewedCount = queue?.reviewedCount ?? 0

  return (
    <AppShell title="Legacy Link Review" eyebrow="P4-2B" back>
      <section className="legacy-review-progress" aria-labelledby="legacy-review-progress-heading">
        <div className="section-heading">
          <h2 id="legacy-review-progress-heading">검토 진행</h2>
          <span className="count">
            {reviewedCount}/{totalCount}
          </span>
        </div>
        <progress value={reviewedCount} max={Math.max(totalCount, 1)}>
          {reviewedCount}/{totalCount}
        </progress>
        <p className="muted">
          저장된 검토 상태에서 이어집니다. 취득일과 Retired는 참고만 하고 방향을
          자동 선택하지 않습니다.
        </p>
      </section>

      {loading ? <LoadingState label="Legacy Link 검토 큐를 불러오는 중" /> : null}
      {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : null}

      {queue?.hiddenItemPairCount ? (
        <p className="warning-text legacy-review-scope-warning" role="alert">
          현재 workspace에서 두 Item을 모두 확인할 수 없는 pair{' '}
          {queue.hiddenItemPairCount}개는 검토 대상에서 제외했습니다.
        </p>
      ) : null}

      {queue && totalCount === reviewedCount ? (
        <EmptyState
          title="모든 Legacy Link를 검토했어요"
          description="검토 결과는 유지되며, 다음 Lineage 단계에서 확인된 방향만 edge 후보로 사용합니다."
          action={
            <Link className="button button--secondary" to="/statistics/replacement-lines">
              Line Overview로 돌아가기
            </Link>
          }
        />
      ) : null}

      {currentPair ? (
        <>
          <section className="section legacy-review-pair" aria-labelledby="legacy-review-pair-heading">
            <div className="section-heading">
              <h2 id="legacy-review-pair-heading">다음 pair</h2>
              <span className="count">
                {reviewedCount + 1}/{totalCount}
              </span>
            </div>
            <div className="legacy-review-item-grid">
              <ReviewItemCard pair={currentPair} side="A" />
              <span className="legacy-review-pair__connector" aria-hidden="true">
                —
              </span>
              <ReviewItemCard pair={currentPair} side="B" />
            </div>
            <div className="legacy-review-line-context">
              <strong>공통 Replacement Line</strong>
              <span>
                {currentPair.sharedLineNames.length > 0
                  ? currentPair.sharedLineNames.join(' · ')
                  : '확인된 공통 Line 없음'}
              </span>
            </div>
          </section>

          <section className="section legacy-review-form" aria-labelledby="legacy-review-choice-heading">
            <fieldset disabled={previewing || saving}>
              <legend id="legacy-review-choice-heading">관계 선택</legend>
              <div className="legacy-review-choices">
                {DECISIONS.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="legacy-link-decision"
                      value={option.value}
                      checked={decision === option.value}
                      onChange={() => setDecision(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="field">
              <span>선택 이유</span>
              <textarea
                value={reason}
                maxLength={2000}
                disabled={previewing || saving}
                placeholder="왜 이 관계로 판단했는지 기록해 주세요."
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            {!previewing ? (
              <button
                className="button button--primary"
                type="button"
                disabled={!decision || !reason.trim()}
                onClick={() => setPreviewing(true)}
              >
                선택 확인
              </button>
            ) : null}
          </section>

          {previewing && decision && currentPair.itemA && currentPair.itemB ? (
            <section className="section legacy-review-confirm" aria-labelledby="legacy-review-confirm-heading">
              <p className="eyebrow">PREVIEW</p>
              <h2 id="legacy-review-confirm-heading">저장 전 확인</h2>
              <strong>
                {describeLegacyLinkDecision(
                  decision,
                  currentPair.itemA.name,
                  currentPair.itemB.name,
                )}
              </strong>
              <p>{reason.trim()}</p>
              {saveError ? <p className="warning-text" role="alert">{saveError}</p> : null}
              <div className="legacy-review-confirm__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => setPreviewing(false)}
                >
                  다시 고르기
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={saving}
                  onClick={() => void confirmReview()}
                >
                  {saving ? '저장 중' : '이대로 저장'}
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  )
}
