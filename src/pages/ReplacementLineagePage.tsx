import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
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
  Item,
  ReplacementLineEdge,
  ReplacementLineEdgeDetailsUpdateInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineSnapshot,
  ReplacementLineStart,
} from '../lib/types'

function acquisitionLabel(acquiredOn: string | null) {
  return acquiredOn ? acquiredOn.slice(0, 4) : '취득연도 미상'
}

interface LineageItemRowProps {
  node: ReplacementLineageNode
  onUpdateEdge: (
    edgeId: string,
    input: ReplacementLineEdgeDetailsUpdateInput,
  ) => Promise<void>
  onReverseEdge: (
    edgeId: string,
    input: ReplacementLineEdgeDirectionUpdateInput,
  ) => Promise<void>
  onSetStart: (itemId: string, isStart: boolean) => Promise<void>
}

function LineageItemRow({
  node,
  onUpdateEdge,
  onReverseEdge,
  onSetStart,
}: LineageItemRowProps) {
  const statusLabel = node.item.retired ? 'Retired' : '사용 중'
  const [editingEdge, setEditingEdge] = useState<ReplacementLineEdge | null>(null)
  const [reversingEdge, setReversingEdge] = useState<ReplacementLineEdge | null>(
    null,
  )
  const [decisionReason, setDecisionReason] = useState('')
  const [branchName, setBranchName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const startEditing = (edge: ReplacementLineEdge) => {
    setEditingEdge(edge)
    setDecisionReason(edge.decisionReason)
    setBranchName(edge.branchName ?? '')
    setSaveError(null)
  }

  const startReversing = (edge: ReplacementLineEdge) => {
    setReversingEdge(edge)
    setSaveError(null)
  }

  const cancelEditing = () => {
    setEditingEdge(null)
    setSaveError(null)
  }

  const normalizedReason = decisionReason.trim()
  const normalizedBranchName = branchName.trim() || null
  const hasChanges = Boolean(
    editingEdge &&
      (editingEdge.decisionReason !== normalizedReason ||
        editingEdge.branchName !== normalizedBranchName),
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingEdge || !normalizedReason || !hasChanges) return

    setSaving(true)
    setSaveError(null)
    try {
      await onUpdateEdge(editingEdge.id, {
        expectedUpdatedAt: editingEdge.updatedAt,
        decisionReason: normalizedReason,
        branchName: normalizedBranchName,
      })
      setEditingEdge(null)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '계승 정보를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleReverse = async () => {
    if (!reversingEdge) return

    setSaving(true)
    setSaveError(null)
    try {
      await onReverseEdge(reversingEdge.id, {
        expectedUpdatedAt: reversingEdge.updatedAt,
      })
      setReversingEdge(null)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '계보 방향을 바꾸지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleStartChange = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSetStart(node.item.id, !node.isExplicitStart)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '시작점을 변경하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lineage-item">
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
          {node.isExplicitStart ? (
            <span className="lineage-item-row__start">지정한 시작점</span>
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

      {node.incomingEdges.length > 0 && !editingEdge && !reversingEdge ? (
        <div className="lineage-edge-actions" aria-label="계승 정보 편집">
          {node.incomingEdges.map((edge) => {
            const predecessor = node.predecessors.find(
              (item) => item.id === edge.predecessorItemId,
            )
            const buttonLabel =
              node.incomingEdges.length === 1
                ? '계승 정보 수정'
                : `${predecessor?.name ?? '이전 Item'} 연결 수정`
            return (
              <span className="lineage-edge-action-group" key={edge.id}>
                <button
                  className="lineage-edge-edit-button"
                  type="button"
                  onClick={() => startEditing(edge)}
                  aria-label={`${predecessor?.name ?? '이전 Item'}에서 ${node.item.name}으로 이어진 계승 정보 수정`}
                >
                  {buttonLabel}
                </button>
                <button
                  className="lineage-edge-edit-button lineage-edge-edit-button--direction"
                  type="button"
                  onClick={() => startReversing(edge)}
                  aria-label={`${predecessor?.name ?? '이전 Item'}에서 ${node.item.name}으로 이어진 방향 바꾸기`}
                >
                  방향 바꾸기
                </button>
              </span>
            )
          })}
        </div>
      ) : null}

      {node.depth === 0 && !editingEdge && !reversingEdge ? (
        <div className="lineage-start-actions">
          <button
            className="lineage-edge-edit-button"
            type="button"
            onClick={() => void handleStartChange()}
            disabled={saving}
          >
            {saving
              ? '변경 중…'
              : node.isExplicitStart
                ? '시작점 해제'
                : '시작점으로 지정'}
          </button>
          {saveError ? (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}

      {editingEdge ? (
        <form className="lineage-edge-form" onSubmit={handleSubmit}>
          <p className="lineage-edge-form__context">
            {node.predecessors.find(
              (item) => item.id === editingEdge.predecessorItemId,
            )?.name ?? '이전 Item'}{' '}
            → {node.item.name}
          </p>
          <label className="field">
            <span>선택 이유</span>
            <textarea
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              maxLength={2000}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>가지 이름 (선택)</span>
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              maxLength={200}
              placeholder="예: 박시 핏 계열"
            />
          </label>
          {saveError ? (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="lineage-edge-form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={cancelEditing}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={saving || !normalizedReason || !hasChanges}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      ) : null}

      {reversingEdge ? (
        <div className="lineage-edge-form lineage-edge-confirmation">
          <p className="lineage-edge-form__context">
            {node.predecessors.find(
              (item) => item.id === reversingEdge.predecessorItemId,
            )?.name ?? '이전 Item'}{' '}
            → {node.item.name}
          </p>
          <p className="lineage-edge-confirmation__question">
            앞뒤 방향을 바꿀까요?
          </p>
          <p className="lineage-edge-confirmation__warning">
            시작점과 세대가 다시 계산됩니다. 순환이 생기는 방향은 저장되지 않습니다.
          </p>
          {saveError ? (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="lineage-edge-form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setReversingEdge(null)
                setSaveError(null)
              }}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleReverse()}
              disabled={saving}
            >
              {saving ? '변경 중…' : '방향 바꾸기'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LineageGeneration({
  generation,
  onUpdateEdge,
  onReverseEdge,
  onSetStart,
}: {
  generation: ReplacementLineageGeneration
  onUpdateEdge: LineageItemRowProps['onUpdateEdge']
  onReverseEdge: LineageItemRowProps['onReverseEdge']
  onSetStart: LineageItemRowProps['onSetStart']
}) {
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
                  <LineageItemRow
                    key={node.item.id}
                    node={node}
                    onUpdateEdge={onUpdateEdge}
                    onReverseEdge={onReverseEdge}
                    onSetStart={onSetStart}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function UnconnectedLineageItem({
  item,
  members,
  replacementLineId,
  onSetStart,
  onCreateManualEdge,
}: {
  item: Item
  members: Item[]
  replacementLineId: string
  onSetStart: (itemId: string, isStart: boolean) => Promise<void>
  onCreateManualEdge: (input: ReplacementLineManualEdgeInput) => Promise<void>
}) {
  const [connecting, setConnecting] = useState(false)
  const [predecessorItemId, setPredecessorItemId] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [branchName, setBranchName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const predecessorOptions = members.filter((member) => member.id !== item.id)
  const normalizedReason = decisionReason.trim()

  const handleSetStart = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSetStart(item.id, true)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '시작점을 지정하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!predecessorItemId || !normalizedReason) return
    setSaving(true)
    setSaveError(null)
    try {
      await onCreateManualEdge({
        replacementLineId,
        predecessorItemId,
        successorItemId: item.id,
        decisionReason: normalizedReason,
        branchName: branchName.trim() || null,
      })
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '계보 연결을 추가하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lineage-unconnected__item">
      <Link
        className="lineage-unconnected__item-link"
        to={`/closet/${item.id}`}
        aria-label={`${item.name} Item 상세 보기`}
      >
        <ItemVisual item={item} className="item-visual--lineage-small" />
        <span>
          <strong>{item.name}</strong>
          <small>
            {acquisitionLabel(item.acquiredOn)} · {item.retired ? 'Retired' : '사용 중'}
          </small>
        </span>
      </Link>
      {!connecting ? (
        <div className="lineage-unconnected__actions">
          <button
            className="lineage-edge-edit-button"
            type="button"
            onClick={() => void handleSetStart()}
            disabled={saving}
          >
            {saving ? '지정 중…' : '시작점으로 지정'}
          </button>
          {predecessorOptions.length > 0 ? (
            <button
              className="lineage-edge-edit-button lineage-edge-edit-button--direction"
              type="button"
              onClick={() => {
                setConnecting(true)
                setSaveError(null)
              }}
              disabled={saving}
            >
              계보에 연결
            </button>
          ) : null}
        </div>
      ) : (
        <form className="lineage-manual-edge-form" onSubmit={handleConnect}>
          <p className="lineage-edge-form__context">{item.name}의 이전 Item 선택</p>
          <label className="field">
            <span>이전 Item</span>
            <select
              value={predecessorItemId}
              onChange={(event) => setPredecessorItemId(event.target.value)}
              required
              autoFocus
            >
              <option value="">선택해 주세요</option>
              {predecessorOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>선택 이유</span>
            <textarea
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              maxLength={2000}
              required
            />
          </label>
          <label className="field">
            <span>가지 이름 (선택)</span>
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              maxLength={200}
            />
          </label>
          <div className="lineage-edge-form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setConnecting(false)
                setSaveError(null)
              }}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={saving || !predecessorItemId || !normalizedReason}
            >
              {saving ? '연결 중…' : '연결 저장'}
            </button>
          </div>
        </form>
      )}
      {saveError ? (
        <p className="form-error lineage-unconnected__error" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  )
}

export function ReplacementLineagePage() {
  const { lineId = '' } = useParams()
  const {
    data,
    loadReplacementLines,
    loadReplacementLineEdges,
    updateReplacementLineEdgeDetails,
    reverseReplacementLineEdge,
    loadReplacementLineStarts,
    setReplacementLineStart,
    createReplacementLineManualEdge,
  } = useClosetData()
  const [snapshot, setSnapshot] = useState<ReplacementLineSnapshot | null>(null)
  const [edges, setEdges] = useState<ReplacementLineEdge[] | null>(null)
  const [starts, setStarts] = useState<ReplacementLineStart[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSnapshot, nextEdges, nextStarts] = await Promise.all([
        loadReplacementLines(),
        loadReplacementLineEdges(),
        loadReplacementLineStarts(),
      ])
      setSnapshot(nextSnapshot)
      setEdges(nextEdges)
      setStarts(nextStarts)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Lineage를 불러오지 못했습니다.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadReplacementLineEdges, loadReplacementLineStarts, loadReplacementLines])

  useEffect(() => {
    void load()
  }, [load])

  const updateEdge = useCallback(
    async (edgeId: string, input: ReplacementLineEdgeDetailsUpdateInput) => {
      const updatedEdge = await updateReplacementLineEdgeDetails(edgeId, input)
      setEdges((current) =>
        current?.map((edge) => (edge.id === updatedEdge.id ? updatedEdge : edge)) ??
        current,
      )
    },
    [updateReplacementLineEdgeDetails],
  )

  const reverseEdge = useCallback(
    async (edgeId: string, input: ReplacementLineEdgeDirectionUpdateInput) => {
      const updatedEdge = await reverseReplacementLineEdge(edgeId, input)
      setEdges((current) =>
        current?.map((edge) => (edge.id === updatedEdge.id ? updatedEdge : edge)) ??
        current,
      )
    },
    [reverseReplacementLineEdge],
  )

  const setStart = useCallback(
    async (itemId: string, isStart: boolean) => {
      const savedState = await setReplacementLineStart(lineId, itemId, isStart)
      setStarts((current) => {
        const withoutItem =
          current?.filter(
            (start) =>
              start.replacementLineId !== lineId || start.itemId !== itemId,
          ) ?? []
        return savedState
          ? [
              ...withoutItem,
              {
                replacementLineId: lineId,
                itemId,
                designatedAt: new Date().toISOString(),
              },
            ]
          : withoutItem
      })
    },
    [lineId, setReplacementLineStart],
  )

  const createManualEdge = useCallback(
    async (input: ReplacementLineManualEdgeInput) => {
      const createdEdge = await createReplacementLineManualEdge(input)
      setEdges((current) => (current ? [...current, createdEdge] : [createdEdge]))
    },
    [createReplacementLineManualEdge],
  )

  const lineage = useMemo(
    () =>
      data && snapshot && edges && starts
        ? buildReplacementLineage(lineId, snapshot, edges, data.items, starts)
        : null,
    [data, edges, lineId, snapshot, starts],
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
                <LineageGeneration
                  generation={generation}
                  onUpdateEdge={updateEdge}
                  onReverseEdge={reverseEdge}
                  onSetStart={setStart}
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
                    replacementLineId={lineage.line.id}
                    onSetStart={setStart}
                    onCreateManualEdge={createManualEdge}
                    key={item.id}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  )
}
