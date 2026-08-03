import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildReplacementLineage,
  type ReplacementLineageGeneration,
  type ReplacementLineageNode,
} from '../features/replacement-lines/replacement-lineage'
import type {
  ReplacementLineEdge,
  ReplacementLineSnapshot,
} from '../lib/types'

function acquisitionLabel(acquiredOn: string | null) {
  return acquiredOn ? acquiredOn.slice(0, 4) : '취득연도 미상'
}

function LineageItemRow({ node }: { node: ReplacementLineageNode }) {
  const statusLabel = node.item.retired ? 'Retired' : '사용 중'
  return (
    <Link
      className="lineage-item-row"
      to={`/closet/${node.item.id}`}
      aria-label={`${node.item.name} Item 상세 보기`}
    >
      <ItemVisual item={node.item} className="item-visual--lineage" />
      <span className="lineage-item-row__body">
        <strong>{node.item.name}</strong>
        <span>{acquisitionLabel(node.item.acquiredOn)}</span>
        {node.reason ? (
          <span className="lineage-item-row__reason">선택 이유 · {node.reason}</span>
        ) : null}
        {node.branchName ? (
          <span className="lineage-item-row__branch">가지 · {node.branchName}</span>
        ) : null}
      </span>
      <span
        className={`lineage-status-badge${
          node.item.retired ? ' lineage-status-badge--retired' : ''
        }`}
      >
        {statusLabel}
      </span>
    </Link>
  )
}

function LineageGeneration({ generation }: { generation: ReplacementLineageGeneration }) {
  const isBranched = generation.groups.length > 1
  return (
    <div className="lineage-generation">
      {generation.depth > 0 ? (
        <div
          className={`lineage-generation__connector${
            isBranched ? ' lineage-generation__connector--branched' : ''
          }`}
          aria-hidden="true"
        />
      ) : null}
      <div
        className={`lineage-generation__groups${
          isBranched ? ' lineage-generation__groups--branched' : ''
        }`}
      >
        {generation.groups.map((group, groupIndex) => {
          const headingId = `lineage-generation-${generation.depth}-${groupIndex}`
          return (
            <section
              className={`lineage-generation-card lineage-generation-card--${group.kind}`}
              aria-labelledby={headingId}
              key={group.id}
            >
              <header>
                <h2 id={headingId}>
                  G{generation.depth} · {group.label}
                </h2>
              </header>
              <div className="lineage-generation-card__items">
                {group.nodes.map((node) => (
                  <LineageItemRow key={node.item.id} node={node} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function ReplacementLineagePage() {
  const { lineId = '' } = useParams()
  const { data, loadReplacementLines, loadReplacementLineEdges } = useClosetData()
  const [snapshot, setSnapshot] = useState<ReplacementLineSnapshot | null>(null)
  const [edges, setEdges] = useState<ReplacementLineEdge[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSnapshot, nextEdges] = await Promise.all([
        loadReplacementLines(),
        loadReplacementLineEdges(),
      ])
      setSnapshot(nextSnapshot)
      setEdges(nextEdges)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Lineage를 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadReplacementLineEdges, loadReplacementLines])

  useEffect(() => {
    void load()
  }, [load])

  const lineage = useMemo(
    () =>
      data && snapshot && edges
        ? buildReplacementLineage(lineId, snapshot, edges, data.items)
        : null,
    [data, edges, lineId, snapshot],
  )
  const lineName =
    lineage?.line.name ??
    snapshot?.lines.find((line) => line.id === lineId)?.name ??
    'Item Lineage'

  return (
    <AppShell
      title={lineName}
      eyebrow="ITEM LINEAGE"
      subtitle={
        lineage ? (
          <span>
            사용 중 {lineage.activeCount} · Retired {lineage.retiredCount}
          </span>
        ) : null
      }
      back
      hideNavigation
    >
      {loading || (!data && !error) ? (
        <LoadingState label="Replacement Lineage를 불러오는 중" />
      ) : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && data && snapshot && edges && !lineage ? (
        <ErrorState message="Replacement Line을 찾을 수 없습니다." />
      ) : null}

      {lineage ? (
        <>
          {lineage.needsReviewEdgeCount > 0 ? (
            <p className="lineage-page-alert" role="status">
              재검토가 필요한 연결 {lineage.needsReviewEdgeCount}개는 세대 계산에서 제외했습니다.
            </p>
          ) : null}
          {lineage.invalidEdgeCount > 0 || lineage.cyclic ? (
            <ErrorState
              message={
                lineage.cyclic
                  ? '순환 연결이 감지되어 세대를 표시하지 않았습니다.'
                  : `Line membership과 맞지 않는 연결 ${lineage.invalidEdgeCount}개를 표시하지 않았습니다.`
              }
            />
          ) : null}

          {lineage.generations.length > 0 && !lineage.cyclic ? (
            <div
              className="lineage-generations"
              aria-label={`${lineage.line.name} 확인된 계보`}
            >
              {lineage.generations.map((generation) => (
                <LineageGeneration generation={generation} key={generation.depth} />
              ))}
            </div>
          ) : !lineage.cyclic ? (
            <EmptyState
              title="확정된 계보가 아직 없어요"
              description="이 Line의 membership은 유지하지만, 확인된 방향 edge가 생기기 전에는 시작점과 세대를 추정하지 않습니다."
            />
          ) : null}

          {lineage.unconnectedMembers.length > 0 ? (
            <section
              className="section lineage-unconnected"
              aria-labelledby="lineage-unconnected-heading"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MEMBERSHIP ONLY</p>
                  <h2 id="lineage-unconnected-heading">계보 연결 전</h2>
                </div>
                <span className="count">{lineage.unconnectedMembers.length} Item</span>
              </div>
              <p className="muted">
                이 Item은 Line에는 속하지만 확인된 edge가 없어 G0로 추정하지 않았습니다.
              </p>
              <div className="lineage-unconnected__items">
                {lineage.unconnectedMembers.map((item) => (
                  <Link
                    className="lineage-unconnected__item"
                    to={`/closet/${item.id}`}
                    key={item.id}
                  >
                    <ItemVisual item={item} className="item-visual--lineage-small" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {acquisitionLabel(item.acquiredOn)} ·{' '}
                        {item.retired ? 'Retired' : '사용 중'}
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  )
}
