import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemVisual } from '../components/ItemVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import {
  buildReplacementLineage,
  type ReplacementLineageGeneration,
  type ReplacementLineageNode,
} from '../features/replacement-lines/replacement-lineage'
import { useReplacementLineage } from '../features/replacement-lines/useReplacementLineage'
import type {
  Item,
  ReplacementLineEdge,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineItemAddInput,
  ReplacementLineItemMoveInput,
  ReplacementLineArchiveInput,
  ReplacementLineColorUpdateInput,
  ReplacementLineColorCategory,
  ReplacementLineDeleteInput,
  ReplacementLineDetailsUpdateInput,
  ReplacementLineMergeInput,
  ReplacementLineRecord,
  ReplacementLineReviewInput,
} from '../lib/types'
import {
  REPLACEMENT_LINE_COLOR_CATEGORIES,
  REPLACEMENT_LINE_DECISION_REASONS,
  type ReplacementLineDecisionReason,
} from '../lib/types'

function acquisitionLabel(acquiredOn: string | null) {
  return acquiredOn ? acquiredOn.slice(0, 4) : '취득연도 미상'
}

const EMPTY_LINE_ID_SET: ReadonlySet<string> = new Set()

function RemoveLineMembershipControl({
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
              {REPLACEMENT_LINE_DECISION_REASONS.map((reason) => (
                <option value={reason} key={reason}>
                  {reason}
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

function LineageGeneration({
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

function UnconnectedLineageItem({
  item,
  members,
  sourceLine,
  lines,
  replacementLineId,
  onSetStart,
  onCreateManualEdge,
  onMoveItem,
  onRemoveItem,
  otherMembershipLineIds,
  otherLineNames,
  hasLineageConnection,
  readOnly,
}: {
  item: Item
  members: Item[]
  sourceLine: ReplacementLineRecord
  lines: ReplacementLineRecord[]
  replacementLineId: string
  onSetStart: (itemId: string, isStart: boolean) => Promise<void>
  onCreateManualEdge: (input: ReplacementLineManualEdgeInput) => Promise<void>
  onMoveItem: (input: ReplacementLineItemMoveInput) => Promise<void>
  onRemoveItem: (itemId: string) => Promise<void>
  otherMembershipLineIds: ReadonlySet<string>
  otherLineNames: readonly string[]
  hasLineageConnection: boolean
  readOnly: boolean
}) {
  const [connecting, setConnecting] = useState(false)
  const [moving, setMoving] = useState(false)
  const [predecessorItemId, setPredecessorItemId] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [branchName, setBranchName] = useState('')
  const [targetLineChoice, setTargetLineChoice] = useState('')
  const [newLineName, setNewLineName] = useState('')
  const [newLineStyleIdentity, setNewLineStyleIdentity] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const predecessorOptions = members.filter((member) => member.id !== item.id)
  const targetLineOptions = lines
    .filter(
      (line) =>
        line.id !== sourceLine.id &&
        !otherMembershipLineIds.has(line.id) &&
        line.lifecycleStatus === 'active',
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
  const normalizedReason = decisionReason.trim()
  const isCreatingLine = targetLineChoice === '__new__'
  const selectedTargetLine = targetLineOptions.find(
    (line) => line.id === targetLineChoice,
  )

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
        decisionReason: normalizedReason as ReplacementLineDecisionReason,
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

  const handleMove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!targetLineChoice || (isCreatingLine && !newLineName.trim())) return
    setSaving(true)
    setSaveError(null)
    try {
      await onMoveItem({
        sourceLineId: sourceLine.id,
        itemId: item.id,
        targetLineId: selectedTargetLine?.id ?? null,
        newLineName: isCreatingLine ? newLineName.trim() : null,
        newLineStyleIdentity: isCreatingLine
          ? newLineStyleIdentity.trim() || null
          : null,
        expectedSourceUpdatedAt: sourceLine.updatedAt,
        expectedTargetUpdatedAt: selectedTargetLine?.updatedAt ?? null,
      })
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Item을 다른 Line으로 옮기지 못했습니다.',
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
      {readOnly ? null : !connecting && !moving ? (
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
          <button
            className="lineage-edge-edit-button lineage-edge-edit-button--direction"
            type="button"
            onClick={() => {
              setMoving(true)
              setSaveError(null)
            }}
            disabled={saving}
          >
            다른 Line으로 옮기기
          </button>
          <RemoveLineMembershipControl
            item={item}
            sourceLineName={sourceLine.name}
            otherLineNames={otherLineNames}
            hasLineageConnection={hasLineageConnection}
            onRemove={onRemoveItem}
          />
        </div>
      ) : connecting ? (
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
            <select
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              required
            >
              <option value="">선택해 주세요</option>
              {REPLACEMENT_LINE_DECISION_REASONS.map((reason) => (
                <option value={reason} key={reason}>
                  {reason}
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
      ) : (
        <form className="lineage-manual-edge-form" onSubmit={handleMove}>
          <p className="lineage-edge-form__context">
            {item.name} · {sourceLine.name}에서 옮기기
          </p>
          {otherLineNames.length > 0 ? (
            <p className="lineage-move-note">
              {otherLineNames.join(', ')}에는 이미 소속되어 있습니다. 중복 소속만
              정리하려면 현재 Line에서 빼기를 사용해 주세요.
            </p>
          ) : null}
          <label className="field">
            <span>옮길 Line</span>
            <select
              value={targetLineChoice}
              onChange={(event) => setTargetLineChoice(event.target.value)}
              required
              autoFocus
            >
              <option value="">선택해 주세요</option>
              {targetLineOptions.map((line) => (
                <option value={line.id} key={line.id}>
                  {line.name}
                </option>
              ))}
              <option value="__new__">+ 새 Line 만들기</option>
            </select>
          </label>
          {isCreatingLine ? (
            <>
              <label className="field">
                <span>새 Line 이름</span>
                <input
                  value={newLineName}
                  onChange={(event) => setNewLineName(event.target.value)}
                  aria-label="새 Line 이름"
                  maxLength={200}
                  placeholder="예: Ivory Summer Cardigan"
                  required
                />
                <small>색상명을 포함하면 Color 목록에 자동으로 분류됩니다.</small>
              </label>
              <label className="field">
                <span>Style Identity (선택)</span>
                <input
                  value={newLineStyleIdentity}
                  onChange={(event) => setNewLineStyleIdentity(event.target.value)}
                  maxLength={200}
                />
              </label>
            </>
          ) : null}
          <p className="lineage-move-note">
            이동한 Item은 새 Line의 시작점이 되며, 기존 Line과 옮길 Line은 모두
            재검토 필요 상태로 표시됩니다.
          </p>
          <div className="lineage-edge-form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setMoving(false)
                setSaveError(null)
              }}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={
                saving ||
                !targetLineChoice ||
                (isCreatingLine && !newLineName.trim())
              }
            >
              {saving ? '옮기는 중…' : 'Line 이동'}
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

interface LineReviewAlertProps {
  pendingEdgeCount: number
  onAcknowledge: () => Promise<void>
}

function LineReviewAlert({
  pendingEdgeCount,
  onAcknowledge,
}: LineReviewAlertProps) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleAcknowledge = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onAcknowledge()
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Line 재검토를 완료하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lineage-page-alert lineage-page-alert--membership">
      <div className="lineage-page-alert__content">
        <p role="status">Line membership이 변경되어 계보 재검토가 필요합니다.</p>
        <button
          className="button button--secondary lineage-page-alert__action"
          type="button"
          onClick={() => void handleAcknowledge()}
          disabled={saving || pendingEdgeCount > 0}
        >
          {saving ? '저장 중…' : '재검토 완료'}
        </button>
      </div>
      {pendingEdgeCount > 0 ? (
        <p className="lineage-page-alert__hint">
          재검토가 필요한 연결 {pendingEdgeCount}개를 먼저 확인해 주세요.
        </p>
      ) : null}
      {saveError ? (
        <p className="form-error lineage-page-alert__error" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  )
}

interface LineManagementPanelProps {
  line: ReplacementLineRecord
  lines: ReplacementLineRecord[]
  membershipCount: number
  availableItems: Item[]
  onAddItem: (input: ReplacementLineItemAddInput) => Promise<void>
  onMerge: (input: ReplacementLineMergeInput) => Promise<void>
  onSetArchived: (input: ReplacementLineArchiveInput) => Promise<void>
  onSetColorCategory: (input: ReplacementLineColorUpdateInput) => Promise<void>
  onUpdateDetails: (input: ReplacementLineDetailsUpdateInput) => Promise<void>
  onDelete: (input: ReplacementLineDeleteInput) => Promise<void>
}

function LineManagementPanel({
  line,
  lines,
  membershipCount,
  availableItems,
  onAddItem,
  onMerge,
  onSetArchived,
  onSetColorCategory,
  onUpdateDetails,
  onDelete,
}: LineManagementPanelProps) {
  const [action, setAction] = useState<
    | 'details'
    | 'color'
    | 'add-item'
    | 'merge'
    | 'archive'
    | 'restore'
    | 'delete'
    | null
  >(null)
  const [targetLineId, setTargetLineId] = useState('')
  const [colorCategory, setColorCategory] = useState('')
  const [name, setName] = useState('')
  const [styleIdentity, setStyleIdentity] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const representativeLine = line.representativeLineId
    ? lines.find((candidate) => candidate.id === line.representativeLineId) ?? null
    : null
  const targetLines = lines
    .filter(
      (candidate) =>
        candidate.id !== line.id && candidate.lifecycleStatus === 'active',
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
  const selectedTarget = targetLines.find(
    (candidate) => candidate.id === targetLineId,
  )
  const normalizedItemSearch = itemSearch.trim().toLocaleLowerCase('ko-KR')
  const matchingItems = useMemo(
    () =>
      [...availableItems]
        .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
        .filter((item) => {
          if (!normalizedItemSearch) return true
          return [
            item.name,
            item.category,
            item.semanticColor,
            item.paletteName,
          ].some((value) =>
            value?.toLocaleLowerCase('ko-KR').includes(normalizedItemSearch),
          )
        }),
    [availableItems, normalizedItemSearch],
  )
  const visibleItems = matchingItems.slice(0, 24)
  const selectedItem = availableItems.find((item) => item.id === selectedItemId)

  const resetAction = () => {
    setAction(null)
    setTargetLineId('')
    setColorCategory('')
    setName('')
    setStyleIdentity('')
    setItemSearch('')
    setSelectedItemId('')
    setAcknowledged(false)
    setSaveError(null)
  }

  const handleMerge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTarget || !acknowledged) return
    setSaving(true)
    setSaveError(null)
    try {
      await onMerge({
        sourceLineId: line.id,
        targetLineId: selectedTarget.id,
        expectedSourceUpdatedAt: line.updatedAt,
        expectedTargetUpdatedAt: selectedTarget.updatedAt,
      })
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Replacement Line을 병합하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (archived: boolean) => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSetArchived({
        lineId: line.id,
        archived,
        expectedUpdatedAt: line.updatedAt,
      })
      resetAction()
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : archived
            ? 'Replacement Line을 보관하지 못했습니다.'
            : 'Replacement Line을 다시 사용하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleColorCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextCategory = colorCategory || null
    if (nextCategory === line.colorCategory) return

    setSaving(true)
    setSaveError(null)
    try {
      await onSetColorCategory({
        lineId: line.id,
        colorCategory: nextCategory as ReplacementLineColorCategory | null,
        expectedUpdatedAt: line.updatedAt,
      })
      resetAction()
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Line 색상을 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedStyleIdentity = styleIdentity.trim() || null
    if (!normalizedName) return

    setSaving(true)
    setSaveError(null)
    try {
      await onUpdateDetails({
        lineId: line.id,
        name: normalizedName,
        styleIdentity: normalizedStyleIdentity,
        expectedUpdatedAt: line.updatedAt,
      })
      resetAction()
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : 'Replacement Line 정보를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onDelete({
        lineId: line.id,
        expectedUpdatedAt: line.updatedAt,
      })
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : '빈 Replacement Line을 삭제하지 못했습니다.',
      )
      setSaving(false)
    }
  }

  const handleAddItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedItem) return
    setSaving(true)
    setSaveError(null)
    try {
      await onAddItem({
        lineId: line.id,
        itemId: selectedItem.id,
        expectedUpdatedAt: line.updatedAt,
      })
      resetAction()
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Item을 Replacement Line에 추가하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="section lineage-line-management"
      aria-labelledby="line-management-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">LINE MANAGEMENT</p>
          <h2 id="line-management-heading">Line 관리</h2>
        </div>
        <span className="count">
          {line.lifecycleStatus === 'archived' ? '보관됨' : `${membershipCount} Item`}
        </span>
      </div>

      <div className="lineage-line-management__details">
        <div>
          <span>Line 이름</span>
          <strong>{line.name}</strong>
        </div>
        <div>
          <span>Style Identity</span>
          <strong>{line.styleIdentity ?? '미지정'}</strong>
        </div>
        {line.lifecycleStatus === 'active' && action !== 'details' ? (
          <button
            className="lineage-edge-edit-button"
            type="button"
            onClick={() => {
              setAction('details')
              setName(line.name)
              setStyleIdentity(line.styleIdentity ?? '')
              setSaveError(null)
            }}
          >
            정보 수정
          </button>
        ) : null}
      </div>

      {action === 'details' ? (
        <form className="lineage-line-management__form" onSubmit={handleDetails}>
          <label className="field">
            <span>Line 이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Style Identity (선택)</span>
            <input
              value={styleIdentity}
              onChange={(event) => setStyleIdentity(event.target.value)}
              maxLength={200}
              placeholder="예: Soft Structure"
            />
          </label>
          <div className="lineage-edge-form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={resetAction}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={
                saving ||
                !name.trim() ||
                (name.trim() === line.name &&
                  (styleIdentity.trim() || null) === line.styleIdentity)
              }
            >
              {saving ? '저장 중…' : 'Line 정보 저장'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="lineage-line-management__color">
        <span>대표 색상 category</span>
        <strong>{line.colorCategory ?? '자동 제안 사용 중'}</strong>
        {line.lifecycleStatus === 'active' && action !== 'color' ? (
          <button
            className="lineage-edge-edit-button"
            type="button"
            onClick={() => {
              setAction('color')
              setColorCategory(line.colorCategory ?? '')
              setSaveError(null)
            }}
          >
            색상 수정
          </button>
        ) : null}
      </div>

      {action === 'color' ? (
        <form
          className="lineage-line-management__form"
          onSubmit={handleColorCategory}
        >
          <label className="field">
            <span>Line 색상 category</span>
            <select
              value={colorCategory}
              onChange={(event) => setColorCategory(event.target.value)}
              autoFocus
            >
              <option value="">자동 제안 사용</option>
              {REPLACEMENT_LINE_COLOR_CATEGORIES.map((category) => (
                <option value={category} key={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            직접 지정한 값은 Line 이름과 Item 색상으로 만든 자동 제안보다 우선합니다.
          </p>
          <div className="lineage-edge-form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={resetAction}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={
                saving || (colorCategory || null) === line.colorCategory
              }
            >
              {saving ? '저장 중…' : '색상 저장'}
            </button>
          </div>
        </form>
      ) : null}

      {line.lifecycleStatus === 'archived' ? (
        representativeLine ? (
          <div className="lineage-line-management__archived" role="status">
            <p>
              이 Line은 <strong>{representativeLine.name}</strong>으로 병합됐습니다.
            </p>
            <Link
              className="button button--primary"
              to={`/replacement-lines/${representativeLine.id}`}
            >
              대표 Line 보기
            </Link>
          </div>
        ) : (
          <div className="lineage-line-management__archived" role="status">
            <p>계보 데이터는 그대로 둔 채 Color 목록에서만 보관한 Line입니다.</p>
            {action !== 'restore' ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setAction('restore')
                  setSaveError(null)
                }}
              >
                다시 사용
              </button>
            ) : (
              <div className="lineage-line-management__confirmation" role="alert">
                <p>이 Line을 Color 목록에 다시 표시할까요?</p>
                <div className="lineage-edge-form__actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={resetAction}
                    disabled={saving}
                  >
                    취소
                  </button>
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => void handleArchive(false)}
                    disabled={saving}
                  >
                    {saving ? '복원 중…' : '다시 사용'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <>
          <p className="muted">
            같은 계열의 Line을 하나로 합치거나, 삭제하지 않고 Color 목록에서 보관할 수
            있습니다.
          </p>
          {action === null ? (
            <div className="lineage-line-management__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setAction('add-item')
                  setSaveError(null)
                }}
                disabled={availableItems.length === 0}
              >
                Item 추가
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setAction('merge')}
                disabled={targetLines.length === 0}
              >
                대표 Line으로 병합
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setAction('archive')}
              >
                Line 보관
              </button>
              {membershipCount === 0 ? (
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => {
                    setAction('delete')
                    setSaveError(null)
                  }}
                >
                  빈 Line 삭제
                </button>
              ) : null}
            </div>
          ) : null}

          {action === 'add-item' ? (
            <form
              className="lineage-line-management__form"
              onSubmit={handleAddItem}
            >
              <div className="lineage-item-picker__summary">
                <strong>Line 없는 Item {availableItems.length}개</strong>
                <span>추가한 Item은 이 Line의 시작점으로 지정됩니다.</span>
              </div>
              <label className="field">
                <span>Item 검색</span>
                <input
                  type="search"
                  value={itemSearch}
                  onChange={(event) => {
                    setItemSearch(event.target.value)
                    setSelectedItemId('')
                  }}
                  placeholder="이름, category, 색상"
                  autoFocus
                />
              </label>
              {visibleItems.length > 0 ? (
                <div className="lineage-item-picker__results" aria-label="추가할 Item">
                  {visibleItems.map((item) => (
                    <button
                      className={`lineage-item-picker__option${
                        selectedItemId === item.id
                          ? ' lineage-item-picker__option--selected'
                          : ''
                      }`}
                      type="button"
                      aria-pressed={selectedItemId === item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      key={item.id}
                    >
                      <ItemVisual item={item} className="item-visual--lineage-small" />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.category} · {item.retired ? 'Retired' : '사용 중'}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">검색 조건에 맞는 Line 없는 Item이 없습니다.</p>
              )}
              {matchingItems.length > visibleItems.length ? (
                <p className="muted">
                  검색 결과가 많아 24개만 표시했습니다. 이름이나 색상을 더 입력해 주세요.
                </p>
              ) : null}
              {selectedItem ? (
                <p className="lineage-item-picker__selection">
                  선택 · <strong>{selectedItem.name}</strong>
                </p>
              ) : null}
              <div className="lineage-edge-form__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={resetAction}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={saving || !selectedItem}
                >
                  {saving ? '추가 중…' : '선택한 Item 추가'}
                </button>
              </div>
            </form>
          ) : null}

          {action === 'merge' ? (
            <form className="lineage-line-management__form" onSubmit={handleMerge}>
              <label className="field">
                <span>대표 Line</span>
                <select
                  value={targetLineId}
                  onChange={(event) => {
                    setTargetLineId(event.target.value)
                    setAcknowledged(false)
                  }}
                  required
                  autoFocus
                >
                  <option value="">선택해 주세요</option>
                  {targetLines.map((targetLine) => (
                    <option value={targetLine.id} key={targetLine.id}>
                      {targetLine.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="lineage-line-management__warning">
                현재 Line의 membership·계보·시작점이 대표 Line으로 이동하고 현재 Line은
                보관됩니다. 자동으로 되돌리는 기능은 제공하지 않습니다.
              </p>
              <label className="lineage-line-management__check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>병합 대상과 변경 내용을 확인했습니다.</span>
              </label>
              <div className="lineage-edge-form__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={resetAction}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  className="button button--danger"
                  type="submit"
                  disabled={saving || !selectedTarget || !acknowledged}
                >
                  {saving ? '병합 중…' : '이 Line을 병합'}
                </button>
              </div>
            </form>
          ) : null}

          {action === 'archive' ? (
            <div className="lineage-line-management__confirmation" role="alert">
              <p>
                {membershipCount}개 Item과 계보는 그대로 유지됩니다. 이 Line을 Color
                목록에서 보관할까요?
              </p>
              <div className="lineage-edge-form__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={resetAction}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => void handleArchive(true)}
                  disabled={saving}
                >
                  {saving ? '보관 중…' : 'Line 보관'}
                </button>
              </div>
            </div>
          ) : null}

          {action === 'delete' ? (
            <div className="lineage-line-management__confirmation" role="alert">
              <p className="lineage-line-management__warning">
                Item·계보 연결·시작점이 모두 비어 있는 이 Line을 완전히 삭제합니다. 이
                작업은 되돌릴 수 없습니다.
              </p>
              <div className="lineage-edge-form__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={resetAction}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={saving}
                >
                  {saving ? '삭제 중…' : '빈 Line 완전 삭제'}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {saveError ? (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      ) : null}
    </section>
  )
}

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
