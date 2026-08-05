import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ItemVisual } from '../../../components/ItemVisual'
import type {
  Item,
  ReplacementLineItemMoveInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineRecord,
} from '../../../lib/types'
import {
  REPLACEMENT_LINE_DECISION_REASONS,
  type ReplacementLineDecisionReason,
} from '../../../lib/types'
import {
  acquisitionLabel,
  RemoveLineMembershipControl,
} from './LineageGeneration'

export function UnconnectedLineageItem({
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

