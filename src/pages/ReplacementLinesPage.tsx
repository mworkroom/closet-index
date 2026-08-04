import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildReplacementLineOverview,
  LEGACY_LINK_BASELINE_COUNT,
  type ReplacementLineColorGroup,
  type ReplacementLineOverviewRow,
} from '../features/replacement-lines/replacement-line-overview'
import type {
  ReplacementLegacyLink,
  ReplacementLineSnapshot,
} from '../lib/types'

function usesLightText(hex: string) {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) return false
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 < 142
}

function ReplacementLineCard({ line }: { line: ReplacementLineOverviewRow }) {
  const isEmpty = line.membershipCount === 0
  const isSingle = line.membershipCount === 1
  return (
    <Link
      className="replacement-line-card replacement-line-card--link"
      to={`/replacement-lines/${line.id}`}
      aria-label={`${line.name} 계보 보기`}
    >
      <span className="replacement-line-card__heading">
        <strong>{line.name}</strong>
        <span>
          Active {line.activeItems.length} · Retired {line.retiredItems.length}
        </span>
        {line.styleIdentity ? (
          <span className="replacement-line-card__identity">
            {line.styleIdentity}
          </span>
        ) : null}
      </span>
      <span className="replacement-line-card__count">
        {line.membershipCount} Item
      </span>
      <ChevronRight aria-hidden="true" size={18} />

      {isEmpty ||
      isSingle ||
      line.hasMultipleLineItem ||
      line.hasMultipleSemanticColors ||
      line.reviewStatus === 'needs_review' ? (
        <span className="replacement-line-warnings" aria-label="Line 점검 상태">
          {line.reviewStatus === 'needs_review' ? <span>재검토 필요</span> : null}
          {isEmpty ? <span>빈 Line</span> : null}
          {isSingle ? <span>단일 Item</span> : null}
          {line.hasMultipleLineItem ? <span>복수 Line 소속</span> : null}
          {line.hasMultipleSemanticColors ? <span>색상 확인 필요</span> : null}
        </span>
      ) : null}
    </Link>
  )
}

function ColorIndexCard({ group }: { group: ReplacementLineColorGroup }) {
  const lightText = usesLightText(group.displayHex)
  return (
    <Link
      className={`replacement-line-color-card${lightText ? ' replacement-line-color-card--dark' : ''}`}
      to={`/replacement-lines?color=${encodeURIComponent(group.id)}`}
      style={{ backgroundColor: group.displayHex }}
      aria-label={`${group.label}, ${group.lines.length}개 Line 보기`}
    >
      <strong>{group.label}</strong>
      <span>{group.lines.length} Lines</span>
    </Link>
  )
}

function ArchivedLineCard({
  line,
  representativeName,
}: {
  line: ReplacementLineOverviewRow
  representativeName: string | null
}) {
  return (
    <Link
      className="replacement-line-archived-card"
      to={`/replacement-lines/${line.id}`}
      aria-label={`${line.name} 보관된 Line 보기`}
    >
      <span>
        <strong>{line.name}</strong>
        <small>
          {representativeName
            ? `대표 Line · ${representativeName}`
            : `${line.membershipCount} Item · 독립 보관`}
        </small>
      </span>
      <ChevronRight aria-hidden="true" size={18} />
    </Link>
  )
}

export function ReplacementLinesPage() {
  const { data, loadReplacementLines, loadReplacementLegacyLinks } =
    useClosetData()
  const [searchParams] = useSearchParams()
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
  const selectedColorId = searchParams.get('color')
  const selectedColor = selectedColorId
    ? overview?.colorGroups.find((group) => group.id === selectedColorId) ?? null
    : null
  const legacyLinkCount = legacyLinksAvailable
    ? (legacyLinks?.length ?? 0)
    : LEGACY_LINK_BASELINE_COUNT
  const reviewedLegacyLinkCount =
    legacyLinks?.filter((link) => link.reviewStatus === 'reviewed').length ?? 0

  return (
    <AppShell title="Replacement Lines" eyebrow="COLOR INDEX" back>
      <section className="replacement-line-intro" aria-labelledby="line-overview-heading">
        <p className="eyebrow">REPLACEMENT LINEAGE</p>
        <h2 id="line-overview-heading">색상별로 이어 온 Item</h2>
        <p className="muted">
          색상을 고른 뒤 Line을 누르면 중간 목록 없이 바로 계보를 확인할 수 있습니다.
        </p>
      </section>

      {loading ? <LoadingState label="Replacement Line을 불러오는 중" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {overview && selectedColor ? (
        <section className="section replacement-line-color-results" aria-labelledby="selected-color-heading">
          <Link className="replacement-line-color-back" to="/replacement-lines">
            <ArrowLeft aria-hidden="true" size={16} />
            모든 색상
          </Link>
          <div className="replacement-line-color-heading">
            <span
              className="replacement-line-color-heading__swatch"
              style={{ backgroundColor: selectedColor.displayHex }}
              aria-hidden="true"
            />
            <div>
              <h2 id="selected-color-heading">{selectedColor.label}</h2>
              <span>{selectedColor.lines.length} Lines</span>
            </div>
          </div>
          <div className="replacement-line-list">
            {selectedColor.lines.map((line) => (
              <ReplacementLineCard line={line} key={line.id} />
            ))}
          </div>
        </section>
      ) : null}

      {overview && !selectedColor ? (
        <>
          <section className="section" aria-labelledby="color-index-heading">
            <div className="section-heading">
              <h2 id="color-index-heading">Color</h2>
              <span className="count">{overview.colorGroups.length} Colors</span>
            </div>
            <div className="replacement-line-color-grid">
              {overview.colorGroups.map((group) => (
                <ColorIndexCard group={group} key={group.id} />
              ))}
            </div>
            {overview.summary.hiddenMembershipCount > 0 ? (
              <p className="warning-text replacement-line-scope-warning" role="alert">
                현재 workspace Item으로 확인되지 않는 membership{' '}
                {overview.summary.hiddenMembershipCount}개는 색상 계산에서 제외했습니다.
              </p>
            ) : null}
          </section>

          <details className="replacement-line-management">
            <summary>
              <span>
                <strong>Line 관리 현황</strong>
                <small>
                  {overview.summary.lineCount} 사용 중 · {overview.summary.archivedLineCount} 보관
                </small>
              </span>
              <span>보기</span>
            </summary>
            <div className="replacement-line-management__body">
              <div className="metric-grid metric-grid--two" aria-label="Replacement Line 요약">
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
                  <span>빈 Line</span>
                  <strong>{overview.summary.emptyLineCount}개</strong>
                </div>
                <div>
                  <span>단일 Item</span>
                  <strong>{overview.summary.singleItemLineCount}개</strong>
                </div>
              </div>

              <section className="legacy-link-status" aria-labelledby="legacy-link-heading">
                <div className="section-heading">
                  <h2 id="legacy-link-heading">Legacy Link</h2>
                  <span className="count">
                    검토 {reviewedLegacyLinkCount}/{legacyLinkCount}
                  </span>
                </div>
                <p className="muted">
                  {legacyLinksAvailable
                    ? '확인한 방향과 선택 이유는 계보 데이터로 보존됩니다.'
                    : `P4-0에서 ${LEGACY_LINK_BASELINE_COUNT}개 무방향 pair를 확인했습니다.`}
                </p>
                {legacyLinksAvailable && legacyLinkCount > 0 ? (
                  <div className="legacy-link-status__actions">
                    {reviewedLegacyLinkCount === legacyLinkCount ? (
                      <Link className="button button--primary" to="/replacement-lines/edges/preview">
                        Edge 후보 미리보기
                      </Link>
                    ) : null}
                    <Link className="button button--secondary" to="/replacement-lines/review">
                      {reviewedLegacyLinkCount === legacyLinkCount
                        ? '검토 결과 보기'
                        : 'Legacy Link 검토 이어가기'}
                    </Link>
                  </div>
                ) : (
                  <span className="legacy-link-status__pending">검토 데이터 준비 전</span>
                )}
              </section>

              {overview.archivedLines.length > 0 ? (
                <section
                  className="replacement-line-archived"
                  aria-labelledby="archived-line-heading"
                >
                  <div className="section-heading">
                    <h2 id="archived-line-heading">보관된 Line</h2>
                    <span className="count">{overview.archivedLines.length} Lines</span>
                  </div>
                  <p className="muted">
                    병합한 Line은 대표 Line을 따라가며, 독립 보관 Line은 상세에서 다시
                    사용할 수 있습니다.
                  </p>
                  <div className="replacement-line-archived__list">
                    {overview.archivedLines.map((line) => (
                      <ArchivedLineCard
                        line={line}
                        representativeName={
                          overview.lines.find(
                            (candidate) =>
                              candidate.id === line.representativeLineId,
                          )?.name ?? null
                        }
                        key={line.id}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </details>
        </>
      ) : null}
    </AppShell>
  )
}
