import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ItemVisual } from '../../../components/ItemVisual'
import type {
  Item,
  ReplacementLineArchiveInput,
  ReplacementLineColorCategory,
  ReplacementLineColorUpdateInput,
  ReplacementLineDeleteInput,
  ReplacementLineDetailsUpdateInput,
  ReplacementLineItemAddInput,
  ReplacementLineMergeInput,
  ReplacementLineRecord,
} from '../../../lib/types'
import { COLOR_CATEGORIES } from '../../../lib/types'

interface LineReviewAlertProps {
  pendingEdgeCount: number
  onAcknowledge: () => Promise<void>
}

export function LineReviewAlert({
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

export function LineManagementPanel({
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
      aria-label="Line 관리"
    >
      {line.lifecycleStatus === 'active' ? (
        <>
          <details className="lineage-line-management__tools">
            <summary>관리 도구</summary>
            {action === null ? (
              <div className="lineage-line-management__actions">
                <div className="lineage-line-management__actions-row lineage-line-management__actions-row--two">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      setAction('details')
                      setName(line.name)
                      setStyleIdentity(line.styleIdentity ?? '')
                      setSaveError(null)
                    }}
                  >
                    이름 수정
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      setAction('color')
                      setColorCategory(line.colorCategory ?? '')
                      setSaveError(null)
                    }}
                  >
                    색상 수정
                  </button>
                </div>
                <div className="lineage-line-management__actions-row lineage-line-management__actions-row--three">
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
                    Line 병합
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
              </div>
            ) : null}
          </details>

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
                  {COLOR_CATEGORIES.map((category) => (
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
        </>
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
