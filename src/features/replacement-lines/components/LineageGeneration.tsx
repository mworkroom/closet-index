import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ItemVisual } from '../../../components/ItemVisual'
import type {
  Item,
  ReplacementLineEdge,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDirectionUpdateInput,
} from '../../../lib/types'
import {
  replacementLineDecisionReasonLabel,
  REPLACEMENT_LINE_DECISION_REASON_OPTIONS,
  REPLACEMENT_LINE_DECISION_REASONS,
  type ReplacementLineDecisionReason,
} from '../../../lib/types'
import type {
  ReplacementLineageGeneration,
  ReplacementLineageNode,
} from '../replacement-lineage'

export function acquisitionLabel(acquiredOn: string | null) {
  return acquiredOn ? acquiredOn.slice(0, 4) : '취득연도 미상'
}

export function RemoveLineMembershipControl({
  item,
  sourceLineName,
  otherLineNames,
  hasLineageConnection,
  onRemove,
}: {
  item: Item
  sourceLineName: string
  otherLineNames: readonly string[]
  hasLineageConnection: boolean
  onRemove: (itemId: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleRemove = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onRemove(item.id)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Item을 Line에서 빼지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (hasLineageConnection) {
    return (
      <div className="lineage-membership-remove lineage-membership-remove--blocked">
        <button
          className="lineage-edge-edit-button lineage-edge-edit-button--direction"
          type="button"
          disabled
        >
          Line에서 빼기
        </button>
        <small>계보 연결을 먼저 모두 해제해 주세요.</small>
      </div>
    )
  }

  if (!confirming) {
    return (
      <div className="lineage-membership-remove">
        <button
          className="lineage-edge-edit-button lineage-edge-edit-button--direction"
          type="button"
          onClick={() => {
            setConfirming(true)
            setSaveError(null)
          }}
        >
          Line에서 빼기
        </button>
      </div>
    )
  }

  return (
    <div className="lineage-membership-remove__confirmation" role="alert">
      {otherLineNames.length > 0 ? (
        <>
          <p>
            <strong>{item.name}</strong>을 <strong>{sourceLineName}</strong>에서만
            뺄까요?
          </p>
          <small>
            {otherLineNames.join(', ')} 소속과 계보는 그대로 유지됩니다.
          </small>
        </>
      ) : (
        <>
          <p>
            <strong>{item.name}</strong>을 어떤 Replacement Line에도 속하지 않게
            뺄까요?
          </p>
          <small>Closet Item과 이미지는 삭제되지 않습니다.</small>
        </>
      )}
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
            setConfirming(false)
            setSaveError(null)
          }}
          disabled={saving}
        >
          취소
        </button>
        <button
          className="button button--danger"
          type="button"
          onClick={() => void handleRemove()}
          disabled={saving}
        >
          {saving ? '빼는 중…' : '현재 Line에서 빼기'}
        </button>
      </div>
    </div>
  )
}

interface LineageItemRowProps {
  node: ReplacementLineageNode
  members: Item[]
  onUpdateEdge: (
    edgeId: string,
    input: ReplacementLineEdgeConnectionUpdateInput,
  ) => Promise<void>
  onDisconnectEdge: (edge: ReplacementLineEdge) => Promise<void>
  onReverseEdge: (
    edgeId: string,
    input: ReplacementLineEdgeDirectionUpdateInput,
  ) => Promise<void>
  onSetStart: (itemId: string, isStart: boolean) => Promise<void>
  onRemoveItem: (itemId: string) => Promise<void>
  sourceLineName: string
  otherLineNames: readonly string[]
  hasLineageConnection: boolean
  readOnly: boolean
}

function LineageItemRow({
  node,
  members,
  onUpdateEdge,
  onDisconnectEdge,
  onReverseEdge,
  onSetStart,
  onRemoveItem,
  sourceLineName,
  otherLineNames,
  hasLineageConnection,
  readOnly,
}: LineageItemRowProps) {
  const statusLabel = node.item.retired ? 'Retired' : '사용 중'
  const [editingEdge, setEditingEdge] = useState<ReplacementLineEdge | null>(null)
  const [reversingEdge, setReversingEdge] = useState<ReplacementLineEdge | null>(
    null,
  )
  const [decisionReason, setDecisionReason] = useState('')
  const [predecessorItemId, setPredecessorItemId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const startEditing = (edge: ReplacementLineEdge) => {
    setEditingEdge(edge)
    setPredecessorItemId(edge.predecessorItemId)
    setDecisionReason(
      (REPLACEMENT_LINE_DECISION_REASONS as readonly string[]).includes(
        edge.decisionReason,
      )
        ? edge.decisionReason
        : '',
    )
    setBranchName(edge.branchName ?? '')
    setConfirmingDisconnect(false)
    setSaveError(null)
  }

  const startReversing = (edge: ReplacementLineEdge) => {
    setReversingEdge(edge)
    setSaveError(null)
  }

  const cancelEditing = () => {
    setEditingEdge(null)
    setConfirmingDisconnect(false)
    setSaveError(null)
  }

  const normalizedReason = decisionReason.trim()
  const normalizedBranchName = branchName.trim() || null
  const hasChanges = Boolean(
    editingEdge &&
      (editingEdge.decisionReason !== normalizedReason ||
        editingEdge.predecessorItemId !== predecessorItemId ||
        editingEdge.branchName !== normalizedBranchName),
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingEdge || !predecessorItemId || !normalizedReason || !hasChanges) return

    setSaving(true)
    setSaveError(null)
    try {
      await onUpdateEdge(editingEdge.id, {
        expectedUpdatedAt: editingEdge.updatedAt,
        predecessorItemId,
        decisionReason: normalizedReason as ReplacementLineDecisionReason,
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

  const handleDisconnect = async () => {
    if (!editingEdge) return

    setSaving(true)
    setSaveError(null)
    try {
      await onDisconnectEdge(editingEdge)
      setEditingEdge(null)
      setConfirmingDisconnect(false)
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : '계보 연결을 해제하지 못했습니다.',
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
          {node.reason &&
          (REPLACEMENT_LINE_DECISION_REASONS as readonly string[]).includes(
            node.reason,
          ) ? (
            <span className="lineage-item-row__reason">
              선택 이유 · {replacementLineDecisionReasonLabel(node.reason)}
            </span>
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

      {!readOnly &&
      node.incomingEdges.length > 0 &&
      !editingEdge &&
      !reversingEdge ? (
        <div className="lineage-edge-actions" aria-label="계승 정보 편집">
          {node.incomingEdges.map((edge) => {
            const predecessor = node.predecessors.find(
              (item) => item.id === edge.predecessorItemId,
            )
            const buttonLabel =
              node.incomingEdges.length === 1
                ? '연결 수정'
                : `${predecessor?.name ?? '이전 Item'} 연결 수정`
            return (
              <span className="lineage-edge-action-group" key={edge.id}>
                <button
                  className="lineage-edge-edit-button"
                  type="button"
                  onClick={() => startEditing(edge)}
                  aria-label={`${predecessor?.name ?? '이전 Item'}에서 ${node.item.name}으로 이어진 연결 수정`}
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

      {!readOnly && node.depth === 0 && !editingEdge && !reversingEdge ? (
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

      {!readOnly && !editingEdge && !reversingEdge ? (
        <RemoveLineMembershipControl
          item={node.item}
          sourceLineName={sourceLineName}
          otherLineNames={otherLineNames}
          hasLineageConnection={hasLineageConnection}
          onRemove={onRemoveItem}
        />
      ) : null}

      {editingEdge ? (
        <form className="lineage-edge-form" onSubmit={handleSubmit}>
          <p className="lineage-edge-form__context">{node.item.name}의 연결 수정</p>
          <label className="field">
            <span>이전 Item</span>
            <select
              value={predecessorItemId}
              onChange={(event) => setPredecessorItemId(event.target.value)}
              required
              autoFocus
            >
              {members
                .filter((item) => item.id !== node.item.id)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>선택 이유</span>
            <select
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              required
            >
              <option value="">선택해 주세요</option>
              {REPLACEMENT_LINE_DECISION_REASON_OPTIONS.map((reason) => (
                <option value={reason.value} key={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
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
              disabled={
                saving || !predecessorItemId || !normalizedReason || !hasChanges
              }
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
          {!confirmingDisconnect ? (
            <button
              className="lineage-edge-disconnect-button"
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={saving}
            >
              계보에서 빼기
            </button>
          ) : (
            <div className="lineage-edge-disconnect-confirmation" role="alert">
              <p>
                이 부모 연결을 해제하고 {node.item.name}을 같은 Line의 시작점으로
                둘까요?
              </p>
              <small>연결 해제 뒤 `계보 연결 전` 카드에서 다른 Line으로 옮길 수 있습니다.</small>
              <div className="lineage-edge-form__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={saving}
                >
                  계속 편집
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => void handleDisconnect()}
                  disabled={saving}
                >
                  {saving ? '빼는 중…' : '연결 해제'}
                </button>
              </div>
            </div>
          )}
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

export function LineageGeneration({
  generation,
  sourceLineName,
  members,
  onUpdateEdge,
  onDisconnectEdge,
  onReverseEdge,
  onSetStart,
  onRemoveItem,
  connectedItemIds,
  otherLineNamesByItemId,
  readOnly,
}: {
  generation: ReplacementLineageGeneration
  sourceLineName: string
  members: Item[]
  onUpdateEdge: LineageItemRowProps['onUpdateEdge']
  onDisconnectEdge: LineageItemRowProps['onDisconnectEdge']
  onReverseEdge: LineageItemRowProps['onReverseEdge']
  onSetStart: LineageItemRowProps['onSetStart']
  onRemoveItem: LineageItemRowProps['onRemoveItem']
  connectedItemIds: ReadonlySet<string>
  otherLineNamesByItemId: ReadonlyMap<string, readonly string[]>
  readOnly: boolean
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
            <div
              className="lineage-generation-branch"
              key={group.id}
            >
              <section
                className={`lineage-generation-card lineage-generation-card--${group.kind}`}
                aria-labelledby={headingId}
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
                      members={members}
                      onUpdateEdge={onUpdateEdge}
                      onDisconnectEdge={onDisconnectEdge}
                      onReverseEdge={onReverseEdge}
                      onSetStart={onSetStart}
                      onRemoveItem={onRemoveItem}
                      sourceLineName={sourceLineName}
                      otherLineNames={otherLineNamesByItemId.get(node.item.id) ?? []}
                      hasLineageConnection={connectedItemIds.has(node.item.id)}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </section>
            </div>
          )
        })}
      </div>
    </div>
  )
}
