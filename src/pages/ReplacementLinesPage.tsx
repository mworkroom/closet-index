import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildReplacementLineOverview,
  LEGACY_LINK_BASELINE_COUNT,
  type ReplacementLineItemOverview,
  type ReplacementLineOverviewRow,
} from '../features/replacement-lines/replacement-line-overview'
import { formatMonthDayYear } from '../lib/date'
import type {
  ReplacementLegacyLink,
  ReplacementLineSnapshot,
} from '../lib/types'

function ReplacementLineItemRow({ entry }: { entry: ReplacementLineItemOverview }) {
  const { item, lineNames } = entry
  return (
    <Link
      className="replacement-line-item"
      to={`/closet/${item.id}`}
      aria-label={`${item.name} Item 상세 보기`}
    >
      <ItemVisual item={item} className="item-visual--row" />
      <span className="replacement-line-item__body">
        <strong>{item.name}</strong>
        <span>
          {item.retired ? 'Retired' : 'Active'} ·{' '}
          {item.acquiredOn
            ? `취득 ${formatMonthDayYear(item.acquiredOn)}`
            : '취득일 미상'}
        </span>
        {lineNames.length > 1 ? (
          <span className="warning-text">
            복수 Line · {lineNames.join(' · ')}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

function ReplacementLineCard({ line }: { line: ReplacementLineOverviewRow }) {
  const isEmpty = line.membershipCount === 0
  const isSingle = line.membershipCount === 1
  return (
    <details className="replacement-line-card">
      <summary>
        <span className="replacement-line-card__heading">
          <strong>{line.name}</strong>
          <span>
            Active {line.activeItems.length} · Retired {line.retiredItems.length}
          </span>
        </span>
        <span className="replacement-line-card__count">
          {line.membershipCount} Item
        </span>
      </summary>

      <div className="replacement-line-card__details">
        <dl className="replacement-line-facts">
          <div>
            <dt>최근 Active 취득</dt>
            <dd>{formatMonthDayYear(line.newestActiveAcquiredOn)}</dd>
          </div>
          <div>
            <dt>Style Identity</dt>
            <dd>{line.styleIdentity ?? '미지정'}</dd>
          </div>
        </dl>

        <div className="replacement-line-warnings" aria-label="Line 점검 상태">
          {isEmpty ? <span>빈 Line</span> : null}
          {isSingle ? <span>단일 Item Line</span> : null}
          {line.hasMultipleLineItem ? <span>복수 Line 소속 Item</span> : null}
          {line.hiddenMembershipCount > 0 ? (
            <span>확인 불가 membership {line.hiddenMembershipCount}개</span>
          ) : null}
          {!isEmpty && !isSingle && !line.hasMultipleLineItem ? (
            <span className="replacement-line-warnings__ok">기본 구조 확인</span>
          ) : null}
        </div>

        {!isEmpty ? (
          <Link
            className="button button--secondary replacement-line-card__lineage-link"
            to={`/replacement-lines/${line.id}`}
          >
            계보 보기
          </Link>
        ) : null}

        {line.membershipCount === 0 ? (
          <EmptyState
            title="연결된 Item이 없어요"
            description="원본 Line은 유지하고, 이 읽기 전용 단계에서는 수정하지 않습니다."
          />
        ) : (
          <div className="replacement-line-items">
            {line.activeItems.map((entry) => (
              <ReplacementLineItemRow entry={entry} key={entry.item.id} />
            ))}
            {line.retiredItems.map((entry) => (
              <ReplacementLineItemRow entry={entry} key={entry.item.id} />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

export function ReplacementLinesPage() {
  const { data, loadReplacementLines, loadReplacementLegacyLinks } =
    useClosetData()
  const [snapshot, setSnapshot] = useState<ReplacementLineSnapshot | null>(null)
  const [legacyLinks, setLegacyLinks] =
    useState<ReplacementLegacyLink[] | null>(null)
  const [legacyLinksAvailable, setLegacyLinksAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [linesResult, linksResult] = await Promise.allSettled([
        loadReplacementLines(),
        loadReplacementLegacyLinks(),
      ])
      if (linesResult.status === 'rejected') throw linesResult.reason
      setSnapshot(linesResult.value)
      if (linksResult.status === 'fulfilled') {
        setLegacyLinks(linksResult.value)
        setLegacyLinksAvailable(true)
      } else {
        setLegacyLinks(null)
        setLegacyLinksAvailable(false)
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Line을 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadReplacementLegacyLinks, loadReplacementLines])

  useEffect(() => {
    void load()
  }, [load])

  const overview = useMemo(
    () =>
      snapshot && data
        ? buildReplacementLineOverview(snapshot, data.items)
        : null,
    [data, snapshot],
  )
  const legacyLinkCount = legacyLinksAvailable
    ? (legacyLinks?.length ?? 0)
    : LEGACY_LINK_BASELINE_COUNT
  const reviewedLegacyLinkCount =
    legacyLinks?.filter((link) => link.reviewStatus === 'reviewed').length ?? 0

  return (
    <AppShell title="Replacement Lines" eyebrow="LINE OVERVIEW" back>
      <section className="replacement-line-intro" aria-labelledby="line-overview-heading">
        <p className="eyebrow">READ ONLY</p>
        <h2 id="line-overview-heading">같은 역할을 이어 온 Item</h2>
        <p className="muted">
          현재 Line과 membership을 그대로 읽습니다. 취득일과 Retired 상태는
          참고 정보이며, 대체 방향이나 세대를 자동으로 정하지 않습니다.
        </p>
      </section>

      {loading ? <LoadingState label="Replacement Line을 불러오는 중" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {overview ? (
        <>
          <section className="section" aria-labelledby="line-summary-heading">
            <div className="section-heading">
              <h2 id="line-summary-heading">Overview</h2>
              <span className="count">{overview.summary.lineCount} Lines</span>
            </div>
            <div className="metric-grid metric-grid--two" aria-label="Replacement Line 요약">
              <div>
                <span>Membership</span>
                <strong>{overview.summary.membershipCount}개</strong>
              </div>
              <div>
                <span>고유 Item</span>
                <strong>{overview.summary.uniqueItemCount}개</strong>
              </div>
              <div>
                <span>Active / Retired</span>
                <strong>
                  {overview.summary.activeItemCount} / {overview.summary.retiredItemCount}
                </strong>
              </div>
              <div>
                <span>점검 필요</span>
                <strong>
                  빈 {overview.summary.emptyLineCount} · 단일{' '}
                  {overview.summary.singleItemLineCount}
                </strong>
              </div>
            </div>
            {overview.summary.hiddenMembershipCount > 0 ? (
              <p className="warning-text replacement-line-scope-warning" role="alert">
                현재 workspace Item으로 확인되지 않는 membership{' '}
                {overview.summary.hiddenMembershipCount}개는 이름과 상세를 노출하지 않았습니다.
              </p>
            ) : null}
          </section>

          <section className="section legacy-link-status" aria-labelledby="legacy-link-heading">
            <div className="section-heading">
              <h2 id="legacy-link-heading">Legacy Link</h2>
              <span className="count">
                검토 {reviewedLegacyLinkCount}/{legacyLinkCount}
              </span>
            </div>
            <div className="legacy-link-status__line" aria-label="방향 없는 Legacy Link 상태">
              <span>Item A</span>
              <strong aria-hidden="true">—</strong>
              <span>Item B</span>
              <b>{legacyLinkCount} pairs</b>
            </div>
            <p className="muted">
              {legacyLinksAvailable
                ? '개별 pair는 화살표 없이 보존됩니다. 검토 화면에서만 사람이 방향이나 관계 제외를 확인합니다.'
                : `P4-0에서 ${LEGACY_LINK_BASELINE_COUNT}개 무방향 pair를 확인했습니다. 개별 pair는 아직 앱 DB에 추출되지 않아 관계를 추측해 표시하지 않습니다.`}
            </p>
            {legacyLinksAvailable && legacyLinkCount > 0 ? (
              <div className="legacy-link-status__actions">
                {reviewedLegacyLinkCount === legacyLinkCount ? (
                  <Link
                    className="button button--primary"
                    to="/replacement-lines/edges/preview"
                  >
                    Edge 후보 미리보기
                  </Link>
                ) : null}
                <Link
                  className="button button--secondary"
                  to="/replacement-lines/review"
                >
                  {reviewedLegacyLinkCount === legacyLinkCount
                    ? '검토 결과 보기'
                    : 'Legacy Link 검토 이어가기'}
                </Link>
              </div>
            ) : (
              <span className="legacy-link-status__pending">
                검토 데이터 준비 전
              </span>
            )}
          </section>

          <div className="replacement-line-groups">
            {overview.groups.map((group, groupIndex) => (
              <section
                className="section replacement-line-group"
                aria-labelledby={`replacement-line-group-${groupIndex}`}
                key={group.id}
              >
                <div className="section-heading">
                  <h2 id={`replacement-line-group-${groupIndex}`}>
                    {group.label}
                  </h2>
                  <span className="count">{group.lines.length} Lines</span>
                </div>
                <div className="replacement-line-list">
                  {group.lines.map((line) => (
                    <ReplacementLineCard line={line} key={line.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </AppShell>
  )
}
