import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildLineageEdgeCandidatePreview,
  type LineageEdgeCandidate,
  type LineageGraphPoint,
} from '../features/replacement-lines/lineage-edge-candidates'
import type {
  ReplacementLegacyLink,
  ReplacementLineEdge,
  ReplacementLineEdgeConfirmationInput,
  ReplacementLineSnapshot,
} from '../lib/types'

function EdgeRow({ candidate }: { candidate: LineageEdgeCandidate }) {
  const line = candidate.sharedLines[0]
  return (
    <li className="lineage-edge-row">
      <span>{line?.name ?? 'Line 선택 필요'}</span>
      <strong>
        {candidate.predecessor?.name ?? '확인 불가'}
        <span aria-hidden="true"> → </span>
        {candidate.successor?.name ?? '확인 불가'}
      </strong>
      <small>{candidate.link.reviewReason}</small>
    </li>
  )
}

function GraphPointCard({
  point,
  kind,
}: {
  point: LineageGraphPoint
  kind: 'branch' | 'merge'
}) {
  const isBranch = kind === 'branch'
  return (
    <article className="lineage-graph-point">
      <span>{point.line.name}</span>
      <strong>{point.item.name}</strong>
      <p>
        {isBranch ? '후속 Item' : '이전 Item'} ·{' '}
        {point.connectedItems.map((item) => item.name).join(' · ')}
      </p>
    </article>
  )
}

export function ReplacementLineageEdgePreviewPage() {
  const {
    data,
    loadReplacementLines,
    loadReplacementLegacyLinks,
    loadReplacementLineEdges,
    confirmReplacementLineEdges,
  } = useClosetData()
  const [snapshot, setSnapshot] = useState<ReplacementLineSnapshot | null>(null)
  const [links, setLinks] = useState<ReplacementLegacyLink[] | null>(null)
  const [edges, setEdges] = useState<ReplacementLineEdge[] | null>(null)
  const [selectedLines, setSelectedLines] = useState<Record<string, string>>({})
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSnapshot, nextLinks, nextEdges] = await Promise.all([
        loadReplacementLines(),
        loadReplacementLegacyLinks(),
        loadReplacementLineEdges(),
      ])
      setSnapshot(nextSnapshot)
      setLinks(nextLinks)
      setEdges(nextEdges)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Lineage edge 후보를 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadReplacementLegacyLinks, loadReplacementLineEdges, loadReplacementLines])

  useEffect(() => {
    void load()
  }, [load])

  const preview = useMemo(
    () =>
      data && snapshot && links
        ? buildLineageEdgeCandidatePreview(links, snapshot, data.items)
        : null,
    [data, links, snapshot],
  )

  const integrityReady = Boolean(
    preview &&
      preview.summary.selfEdges === 0 &&
      preview.summary.duplicateEdges === 0 &&
      preview.summary.cycleLines === 0 &&
      preview.pendingCandidates.length === 0 &&
      preview.invalidCandidates.length === 0,
  )
  const activeEdges = edges?.filter((edge) => edge.status !== 'archived') ?? []
  const existingEdgeBlocked = activeEdges.length > 0
  const allChoicesMade = Boolean(
    preview?.needsLineChoiceCandidates.every(
      (candidate) => selectedLines[candidate.link.id],
    ),
  )

  const confirmationInputs = useMemo<ReplacementLineEdgeConfirmationInput[]>(() => {
    if (!preview || !allChoicesMade) return []
    return [...preview.readyCandidates, ...preview.needsLineChoiceCandidates].map(
      (candidate) => ({
        replacementLineId:
          candidate.status === 'ready'
            ? candidate.sharedLines[0].id
            : selectedLines[candidate.link.id],
        sourceLegacyLinkId: candidate.link.id,
        sourceKind: 'legacy_link',
        expectedLegacyUpdatedAt: candidate.link.updatedAt,
        branchName: null,
        decisionReason: candidate.link.reviewReason ?? '',
      }),
    )
  }, [allChoicesMade, preview, selectedLines])

  const canOpenConfirmation = Boolean(
    integrityReady &&
      allChoicesMade &&
      !existingEdgeBlocked &&
      confirmationInputs.length === preview?.summary.directional,
  )

  const save = async () => {
    if (!canOpenConfirmation || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await confirmReplacementLineEdges(confirmationInputs)
      setEdges(saved)
      setConfirmationOpen(false)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Lineage edge를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title="Lineage Edge Preview" eyebrow="P4-2C" back>
      <section className="replacement-line-intro lineage-preview-intro" aria-labelledby="edge-preview-heading">
        <p className="eyebrow">PREVIEW &amp; CONFIRM</p>
        <h2 id="edge-preview-heading">검토 결과를 edge로 확정해요</h2>
        <p className="muted">
          공통 Line이 둘인 관계는 직접 선택하고, 전체 저장 대상을 한 번 더 확인합니다.
          저장은 한 transaction으로 처리되어 하나라도 실패하면 전부 되돌아갑니다.
        </p>
      </section>

      {loading || (!data && !error) ? (
        <LoadingState label="Lineage edge 후보를 계산하는 중" />
      ) : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {preview && edges ? (
        <>
          <section className="section lineage-preview-summary" aria-labelledby="edge-summary-heading">
            <div className="section-heading">
              <h2 id="edge-summary-heading">후보 분류</h2>
              <span className="count">{preview.summary.total} pairs</span>
            </div>
            <div className="metric-grid metric-grid--two" aria-label="Lineage edge 후보 요약">
              <div><span>방향 후보</span><strong>{preview.summary.directional}개</strong></div>
              <div><span>바로 준비</span><strong>{preview.summary.ready}개</strong></div>
              <div><span>Line 선택</span><strong>{preview.summary.needsLineChoice}개</strong></div>
              <div><span>edge 제외</span><strong>{preview.summary.excluded}개</strong></div>
            </div>
          </section>

          <section
            className={`section lineage-integrity ${integrityReady ? 'lineage-integrity--ready' : ''}`}
            aria-labelledby="edge-integrity-heading"
          >
            <div className="section-heading">
              <div><p className="eyebrow">GRAPH CHECK</p><h2 id="edge-integrity-heading">저장 전 구조 점검</h2></div>
              <span className="count">{integrityReady ? '통과' : '확인 필요'}</span>
            </div>
            <dl className="lineage-integrity__facts">
              <div><dt>Self-edge</dt><dd>{preview.summary.selfEdges}</dd></div>
              <div><dt>중복 edge</dt><dd>{preview.summary.duplicateEdges}</dd></div>
              <div><dt>Cycle Line</dt><dd>{preview.summary.cycleLines}</dd></div>
              <div><dt>가지 / 합류</dt><dd>{preview.summary.branchPoints} / {preview.summary.mergePoints}</dd></div>
            </dl>
            <p className="muted">
              실제 저장에서도 DB가 현재 검토 시각, 방향, workspace·Line membership,
              self-edge와 cycle을 다시 검사합니다.
            </p>
          </section>

          {preview.needsLineChoiceCandidates.length > 0 ? (
            <section className="section lineage-choice" aria-labelledby="edge-choice-heading">
              <div className="section-heading">
                <div><p className="eyebrow">ONE DECISION LEFT</p><h2 id="edge-choice-heading">edge를 둘 Line을 골라 주세요</h2></div>
                <span className="count">{preview.needsLineChoiceCandidates.length}</span>
              </div>
              {preview.needsLineChoiceCandidates.map((candidate) => (
                <fieldset className="lineage-choice__card" key={candidate.link.id}>
                  <legend>{candidate.predecessor?.name} → {candidate.successor?.name}</legend>
                  <p>{candidate.note}</p>
                  <div className="lineage-choice__options">
                    {candidate.sharedLines.map((line) => (
                      <label key={line.id}>
                        <input
                          type="radio"
                          name={`line:${candidate.link.id}`}
                          value={line.id}
                          checked={selectedLines[candidate.link.id] === line.id}
                          onChange={() => {
                            setSelectedLines((current) => ({ ...current, [candidate.link.id]: line.id }))
                            setConfirmationOpen(false)
                          }}
                        />
                        <span>{line.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <p className="muted">기본 선택은 없습니다. 고른 Line 안에서만 이 방향 edge가 이어집니다.</p>
            </section>
          ) : null}

          {preview.branchPoints.length + preview.mergePoints.length > 0 ? (
            <section className="section lineage-graph-points" aria-labelledby="graph-points-heading">
              <div className="section-heading"><div><p className="eyebrow">REAL FIXTURES</p><h2 id="graph-points-heading">실제 가지와 합류 후보</h2></div></div>
              {preview.branchPoints.map((point) => (
                <GraphPointCard key={`branch:${point.line.id}:${point.item.id}`} point={point} kind="branch" />
              ))}
              {preview.mergePoints.map((point) => (
                <GraphPointCard key={`merge:${point.line.id}:${point.item.id}`} point={point} kind="merge" />
              ))}
            </section>
          ) : null}

          <details className="section lineage-candidate-list">
            <summary><span><strong>저장 준비 후보</strong><small>공통 Line이 한 개인 방향 관계</small></span><b>{preview.readyCandidates.length}개</b></summary>
            <ol>{preview.readyCandidates.map((candidate) => <EdgeRow candidate={candidate} key={candidate.link.id} />)}</ol>
          </details>

          <details className="section lineage-candidate-list">
            <summary><span><strong>edge에서 제외</strong><small>검토 결과는 보존하지만 방향 edge는 만들지 않음</small></span><b>{preview.excludedCandidates.length}개</b></summary>
            <ul>{preview.excludedCandidates.map((candidate) => (
              <li className="lineage-edge-row" key={candidate.link.id}>
                <strong>{candidate.itemA?.name} — {candidate.itemB?.name}</strong><small>{candidate.note}</small>
              </li>
            ))}</ul>
          </details>

          {existingEdgeBlocked ? (
            <EmptyState
              title={`${activeEdges.length}개 edge가 이미 저장돼 있어요`}
              description="중복 또는 부분 저장을 피하기 위해 초기 일괄 확정을 잠갔습니다. 기존 edge 상태를 먼저 확인해야 합니다."
              action={<Link className="button button--secondary" to="/replacement-lines">Overview로 돌아가기</Link>}
            />
          ) : confirmationOpen ? (
            <section className="section lineage-confirm" aria-labelledby="edge-confirm-heading">
              <div><p className="eyebrow">FINAL CHECK</p><h2 id="edge-confirm-heading">{confirmationInputs.length}개 edge를 한 번에 저장</h2></div>
              <dl>
                <div><dt>자동 Line</dt><dd>{preview.readyCandidates.length}개</dd></div>
                <div><dt>직접 선택</dt><dd>{preview.needsLineChoiceCandidates.length}개</dd></div>
                <div><dt>저장 제외</dt><dd>{preview.excludedCandidates.length}개</dd></div>
              </dl>
              {preview.needsLineChoiceCandidates.map((candidate) => (
                <p className="lineage-confirm__choice" key={candidate.link.id}>
                  <strong>{candidate.predecessor?.name} → {candidate.successor?.name}</strong>
                  <span>{candidate.sharedLines.find((line) => line.id === selectedLines[candidate.link.id])?.name}</span>
                </p>
              ))}
              <p className="warning-text" role="note">한 후보라도 최신 검토 결과와 다르거나 DB 계약을 통과하지 못하면 전체 저장이 rollback됩니다.</p>
              {saveError ? <p className="warning-text" role="alert">{saveError}</p> : null}
              <div className="lineage-confirm__actions">
                <button className="button button--secondary" type="button" onClick={() => setConfirmationOpen(false)} disabled={saving}>돌아가기</button>
                <button className="button" type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? '전체 저장 중…' : `${confirmationInputs.length}개 edge 확정 저장`}
                </button>
              </div>
            </section>
          ) : (
            <EmptyState
              title={allChoicesMade ? '최종 저장 대상을 확인해 주세요' : 'Line 선택을 기다리고 있어요'}
              description={allChoicesMade ? `${confirmationInputs.length}개 방향 edge를 한 transaction으로 저장합니다.` : '공통 Line이 둘인 관계의 Line을 고르면 최종 확인을 열 수 있습니다.'}
              action={
                <button className="button" type="button" disabled={!canOpenConfirmation} onClick={() => setConfirmationOpen(true)}>
                  최종 저장 미리보기
                </button>
              }
            />
          )}
        </>
      ) : null}
    </AppShell>
  )
}
