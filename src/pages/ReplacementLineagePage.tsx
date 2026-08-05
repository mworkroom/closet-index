import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import {
  LineageGeneration,
} from '../features/replacement-lines/components/LineageGeneration'
import {
  LineManagementPanel,
  LineReviewAlert,
} from '../features/replacement-lines/components/LineManagementPanel'
import {
  UnconnectedLineageItem,
} from '../features/replacement-lines/components/UnconnectedLineageItem'
import { buildReplacementLineage } from '../features/replacement-lines/replacement-lineage'
import { useReplacementLineage } from '../features/replacement-lines/useReplacementLineage'
import type { ReplacementLineRecord } from '../lib/types'

const EMPTY_LINE_ID_SET: ReadonlySet<string> = new Set()

export function ReplacementLineagePage() {
  const { lineId = '' } = useParams()
  const {
    data,
    snapshot,
    edges,
    starts,
    loading,
    error,
    reload,
    updateEdge,
    disconnectEdge,
    reverseEdge,
    setStart,
    createManualEdge,
    moveItem,
    addItem,
    removeItem,
    mergeLines,
    setLineArchived,
    setLineColorCategory,
    acknowledgeLineReview,
    updateLineDetails,
    deleteLine,
  } = useReplacementLineage(lineId)

  const lineage = useMemo(
    () =>
      data && snapshot && edges && starts
        ? buildReplacementLineage(lineId, snapshot, edges, data.items, starts)
        : null,
    [data, edges, lineId, snapshot, starts],
  )
  const availableItems = useMemo(() => {
    if (!data || !snapshot) return []
    const assignedItemIds = new Set(
      snapshot.memberships.map((membership) => membership.itemId),
    )
    return data.items.filter((item) => !assignedItemIds.has(item.id))
  }, [data, snapshot])
  const connectedItemIds = useMemo(() => {
    const result = new Set<string>()
    for (const edge of edges ?? []) {
      if (edge.replacementLineId !== lineId) continue
      result.add(edge.predecessorItemId)
      result.add(edge.successorItemId)
    }
    return result
  }, [edges, lineId])
  const otherMembershipsByItemId = useMemo(() => {
    const linesById = new Map((snapshot?.lines ?? []).map((line) => [line.id, line]))
    const result = new Map<string, ReplacementLineRecord[]>()
    for (const membership of snapshot?.memberships ?? []) {
      if (membership.replacementLineId === lineId) continue
      const memberLine = linesById.get(membership.replacementLineId)
      if (!memberLine) continue
      const current = result.get(membership.itemId)
      if (current) current.push(memberLine)
      else result.set(membership.itemId, [memberLine])
    }
    return result
  }, [lineId, snapshot])
  const otherLineNamesByItemId = useMemo(
    () =>
      new Map(
        [...otherMembershipsByItemId].map(([itemId, lines]) => [
          itemId,
          lines.map((line) => line.name),
        ]),
      ),
    [otherMembershipsByItemId],
  )
  const otherLineIdsByItemId = useMemo(
    () =>
      new Map(
        [...otherMembershipsByItemId].map(([itemId, lines]) => [
          itemId,
          new Set(lines.map((line) => line.id)),
        ]),
      ),
    [otherMembershipsByItemId],
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
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {!loading && !error && data && snapshot && edges && starts && !lineage ? (
        <ErrorState message="Replacement Line을 찾을 수 없습니다." />
      ) : null}

      {lineage ? (
        <>
          {lineage.needsReviewEdgeCount > 0 ? (
            <p className="lineage-page-alert" role="status">
              재검토가 필요한 연결 {lineage.needsReviewEdgeCount}개는 세대 계산에서 제외했습니다.
            </p>
          ) : null}
          {lineage.line.reviewStatus === 'needs_review' ? (
            <LineReviewAlert
              pendingEdgeCount={lineage.needsReviewEdgeCount}
              onAcknowledge={() =>
                acknowledgeLineReview({
                  lineId: lineage.line.id,
                  expectedUpdatedAt: lineage.line.updatedAt,
                })
              }
            />
          ) : null}
          {lineage.line.lifecycleStatus === 'archived' ? (
            <p className="lineage-page-alert lineage-page-alert--archived" role="status">
              보관된 Line입니다. 계보는 읽기 전용으로 표시됩니다.
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
              role="region"
              aria-label={`${lineage.line.name} 확인된 계보`}
            >
              {lineage.generations.map((generation) => (
                <LineageGeneration
                  generation={generation}
                  sourceLineName={lineage.line.name}
                  members={lineage.members}
                  onUpdateEdge={updateEdge}
                  onDisconnectEdge={disconnectEdge}
                  onReverseEdge={reverseEdge}
                  onSetStart={setStart}
                  onRemoveItem={removeItem}
                  connectedItemIds={connectedItemIds}
                  otherLineNamesByItemId={otherLineNamesByItemId}
                  readOnly={lineage.line.lifecycleStatus === 'archived'}
                  key={generation.depth}
                />
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
                  <UnconnectedLineageItem
                    item={item}
                    members={lineage.members}
                    sourceLine={lineage.line}
                    lines={snapshot?.lines ?? []}
                    replacementLineId={lineage.line.id}
                    onSetStart={setStart}
                    onCreateManualEdge={createManualEdge}
                    onMoveItem={moveItem}
                    onRemoveItem={removeItem}
                    otherMembershipLineIds={
                      otherLineIdsByItemId.get(item.id) ?? EMPTY_LINE_ID_SET
                    }
                    otherLineNames={otherLineNamesByItemId.get(item.id) ?? []}
                    hasLineageConnection={connectedItemIds.has(item.id)}
                    readOnly={lineage.line.lifecycleStatus === 'archived'}
                    key={item.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <LineManagementPanel
            key={lineage.line.id}
            line={lineage.line}
            lines={snapshot?.lines ?? []}
            membershipCount={lineage.members.length}
            availableItems={availableItems}
            onAddItem={addItem}
            onMerge={mergeLines}
            onSetArchived={setLineArchived}
            onSetColorCategory={setLineColorCategory}
            onUpdateDetails={updateLineDetails}
            onDelete={deleteLine}
          />
        </>
      ) : null}
    </AppShell>
  )
}
