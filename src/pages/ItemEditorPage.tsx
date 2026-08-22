import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ItemImageEditor } from '../components/ItemImageEditor'
import { ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { ItemReplenishmentSection } from '../features/replenishment/components/ItemReplenishmentSection'
import { getPurchaseReplacementRule } from '../features/replenishment/purchase-replenishment'
import { useItemPurchaseEvents } from '../features/replenishment/useItemPurchaseEvents'
import { todayInKorea } from '../lib/date'
import { COLOR_CATEGORIES } from '../lib/types'
import type { ItemWriteInput } from '../lib/types'

const seasonOptions = [
  { value: 'Spring', label: '봄' },
  { value: 'Summer', label: '여름' },
  { value: 'Fall', label: '가을' },
  { value: 'Winter', label: '겨울' },
]

const initialForm: ItemWriteInput = {
  name: '',
  category: '',
  semanticColor: null,
  paletteId: null,
  displayHex: '#B8B8B4',
  seasons: [],
  rainOk: true,
  longWalkOk: true,
  memo: null,
  acquiredOn: null,
}

function normalizeComparable(value: string) {
  return value.trim().toLocaleLowerCase('ko')
}

export function ItemEditorPage() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const {
    data,
    loading,
    error,
    refresh,
    createItem,
    updateItem,
    setItemRetired,
    deleteItem,
    purchases,
  } = useClosetData()
  const editingItem = itemId
    ? data?.items.find((item) => item.id === itemId)
    : undefined
  const isGeneralItem = Boolean(
    editingItem && !getPurchaseReplacementRule(editingItem.category),
  )
  const purchaseEventsState = useItemPurchaseEvents(
    purchases,
    itemId ?? '',
    Boolean(itemId && isGeneralItem),
  )
  const [createId] = useState(() => crypto.randomUUID())
  const [form, setForm] = useState<ItemWriteInput>(initialForm)
  const [initializedItemId, setInitializedItemId] = useState<string | null>(
    itemId ? null : 'new',
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [retireConfirming, setRetireConfirming] = useState(false)
  const [retireSaving, setRetireSaving] = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!itemId || !editingItem || initializedItemId === itemId) return
    setForm({
      name: editingItem.name,
      category: editingItem.category,
      semanticColor: editingItem.semanticColor,
      paletteId: null,
      displayHex: editingItem.displayHex,
      seasons: [...editingItem.seasons],
      rainOk: editingItem.rainOk,
      longWalkOk: editingItem.longWalkOk,
      memo: editingItem.memo,
      acquiredOn: editingItem.acquiredOn,
    })
    setInitializedItemId(itemId)
  }, [editingItem, initializedItemId, itemId])

  const categories = useMemo(
    () => [...new Set(data?.items.map((item) => item.category) ?? [])].sort(),
    [data],
  )
  const duplicates = useMemo(() => {
    if (!data) return []
    const name = normalizeComparable(form.name)
    const category = normalizeComparable(form.category)
    if (!name || !category) return []
    return data.items.filter(
      (item) =>
        item.id !== itemId &&
        normalizeComparable(item.name) === name &&
        normalizeComparable(item.category) === category,
    )
  }, [data, form.category, form.name, itemId])
  const isShoes = form.category.toLocaleLowerCase().includes('shoe')
  const linkedOutfitCount = itemId
    ? (data?.outfits.filter((outfit) => outfit.itemIds.includes(itemId)).length ?? 0)
    : 0

  const updateField = <Key extends keyof ItemWriteInput>(
    key: Key,
    value: ItemWriteInput[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFormError(null)
    if (key === 'name' || key === 'category') {
      setShowDuplicateWarning(false)
    }
  }

  const save = async (allowDuplicate: boolean) => {
    const name = form.name.trim()
    const category = form.category.trim()
    if (!name || !category) {
      setFormError('이름과 카테고리는 반드시 입력해 주세요.')
      return
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(form.displayHex)) {
      setFormError('fallback 색상은 6자리 HEX 형식이어야 합니다.')
      return
    }
    if (!allowDuplicate && duplicates.length > 0) {
      setShowDuplicateWarning(true)
      return
    }

    const input: ItemWriteInput = {
      ...form,
      name,
      category,
      semanticColor: form.semanticColor?.trim() || null,
      displayHex: form.displayHex.toUpperCase(),
      longWalkOk: isShoes ? form.longWalkOk : true,
      memo: form.memo?.trim() || null,
    }

    setSaving(true)
    setFormError(null)
    try {
      const saved = itemId
        ? await updateItem(itemId, input)
        : await createItem({ ...input, id: createId })
      navigate(`/closet/${saved.id}`, { replace: true })
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : 'Item을 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!saving) void save(false)
  }

  const changeRetired = async (retired: boolean) => {
    if (!editingItem) return
    setRetireSaving(true)
    try {
      await setItemRetired(editingItem.id, retired)
      setRetireConfirming(false)
    } catch {
      // DataContext owns the user-facing error state.
    } finally {
      setRetireSaving(false)
    }
  }

  const removeItem = async () => {
    if (!editingItem || deleteSaving || linkedOutfitCount > 0) return
    setDeleteSaving(true)
    setDeleteError(null)
    try {
      await deleteItem(editingItem.id)
      navigate('/closet', { replace: true })
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : 'Item을 삭제하지 못했습니다.',
      )
    } finally {
      setDeleteSaving(false)
    }
  }

  if (
    (loading && !data) ||
    (itemId && editingItem && initializedItemId !== itemId)
  ) {
    return (
      <AppShell title={itemId ? 'Edit Item' : 'Add Item'} eyebrow="ITEM EDITOR" back>
        <LoadingState />
      </AppShell>
    )
  }

  if (data && itemId && !editingItem) {
    return (
      <AppShell title="Edit Item" eyebrow="ITEM EDITOR" back>
        <ErrorState message="수정할 Item을 찾을 수 없습니다." />
      </AppShell>
    )
  }

  return (
    <AppShell
      title={itemId ? 'Edit Item' : 'Add Item'}
      eyebrow={itemId ? 'EDIT ITEM' : 'ADD ITEM'}
      back
    >
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      <form className="item-editor-form" onSubmit={submit}>
        <section className="panel item-editor-preview" aria-label="색상 미리보기">
          <span
            className="item-editor-swatch"
            style={{ backgroundColor: form.displayHex }}
            aria-hidden="true"
          />
          <div>
            <strong>{form.name.trim() || '이름 미입력 Item'}</strong>
            <p>
              {form.category.trim() || '카테고리 미입력'} ·{' '}
              {form.semanticColor || '색상 미지정'}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BASIC INFO</p>
              <h2>기본 정보</h2>
            </div>
          </div>

          <div className="field-grid field-grid--two">
            <label className="field">
              <span>이름 *</span>
              <input
                value={form.name}
                required
                autoComplete="off"
                onChange={(event) => updateField('name', event.target.value)}
              />
            </label>
            <label className="field">
              <span>카테고리 *</span>
              <select
                value={form.category}
                required
                onChange={(event) => updateField('category', event.target.value)}
              >
                <option value="" disabled>
                  카테고리 선택
                </option>
                {categories.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>색상 카테고리</span>
              <select
                value={form.semanticColor ?? ''}
                onChange={(event) =>
                  updateField('semanticColor', event.target.value || null)
                }
              >
                <option value="">미지정</option>
                {COLOR_CATEGORIES.map((color) => (
                  <option value={color} key={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>구매일</span>
              <input
                type="date"
                value={form.acquiredOn ?? ''}
                onChange={(event) =>
                  updateField('acquiredOn', event.target.value || null)
                }
              />
            </label>
          </div>

          <fieldset className="item-editor-seasons">
            <legend>계절</legend>
            <div className="item-editor-check-grid">
              {seasonOptions.map((season) => (
                <label className="check-row" key={season.value}>
                  <input
                    type="checkbox"
                    checked={form.seasons.includes(season.value)}
                    onChange={(event) =>
                      updateField(
                        'seasons',
                        event.target.checked
                          ? [...form.seasons, season.value]
                          : form.seasons.filter(
                              (value) => value !== season.value,
                            ),
                      )
                    }
                  />
                  {season.label}
                </label>
              ))}
            </div>
            <p className="field-help">선택하지 않으면 계절 미지정으로 저장됩니다.</p>
          </fieldset>

          <label className="field">
            <span>메모</span>
            <textarea
              rows={4}
              value={form.memo ?? ''}
              onChange={(event) =>
                updateField('memo', event.target.value || null)
              }
            />
          </label>
        </section>

        {editingItem && <ItemImageEditor item={editingItem} />}

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONDITIONS</p>
              <h2>착용 조건</h2>
            </div>
          </div>
          <label className="field field--checkbox">
            <span>비 오는 날 착용 가능</span>
            <input
              type="checkbox"
              checked={form.rainOk}
              onChange={(event) => updateField('rainOk', event.target.checked)}
            />
          </label>
          {isShoes && (
            <label className="field field--checkbox">
              <span>장거리 걷기 가능</span>
              <input
                type="checkbox"
                checked={form.longWalkOk}
                onChange={(event) =>
                  updateField('longWalkOk', event.target.checked)
                }
              />
            </label>
          )}
        </section>

        {!itemId && (
          <section className="panel item-editor-image-note">
            <div>
              <p className="eyebrow">IMAGE</p>
              <h2>이미지는 다음 단계에서 추가</h2>
            </div>
            <p>
              먼저 Item 정보를 저장한 뒤, 알아볼 수 있는 가벼운 누끼 이미지로
              연결합니다.
            </p>
          </section>
        )}

        {showDuplicateWarning && (
          <section className="duplicate-warning" role="alert">
            <strong>같은 이름과 카테고리의 Item이 이미 있습니다.</strong>
            <ul>
              {duplicates.map((item) => (
                <li key={item.id}>
                  <Link to={`/closet/${item.id}`}>{item.name}</Link>
                </li>
              ))}
            </ul>
            <button
              className="button button--secondary button--wide"
              type="button"
              disabled={saving}
              onClick={() => void save(true)}
            >
              중복을 확인했고 그래도 저장
            </button>
          </section>
        )}

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="item-editor-actions">
          <Link
            className="button button--secondary"
            to={itemId ? `/closet/${itemId}` : '/closet'}
          >
            취소
          </Link>
          <button
            className="button button--primary"
            type="submit"
            disabled={saving}
          >
            {saving ? '저장 중…' : itemId ? '변경 저장' : 'Item 저장'}
          </button>
        </div>
      </form>

      {editingItem && isGeneralItem ? (
        <ItemReplenishmentSection
          item={editingItem}
          events={purchaseEventsState.events}
          loading={purchaseEventsState.loading}
          loadError={purchaseEventsState.error}
          reload={purchaseEventsState.reload}
          cycle={null}
          isReplacementTarget={false}
          today={todayInKorea()}
          variant="general-editor"
        />
      ) : null}

      {editingItem && (
        <section className="record-management" aria-label="Item 삭제 및 Retired 관리">
          <div className="record-management__actions">
            <button
              className="button button--danger"
              type="button"
              disabled={deleteSaving || linkedOutfitCount > 0}
              onClick={() => setDeleteConfirming(true)}
            >
              <Trash2 size={17} aria-hidden="true" />
              삭제
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={retireSaving}
              onClick={() =>
                editingItem.retired
                  ? void changeRetired(false)
                  : setRetireConfirming(true)
              }
            >
              {editingItem.retired ? (
                <RotateCcw size={17} aria-hidden="true" />
              ) : (
                <Archive size={17} aria-hidden="true" />
              )}
              {retireSaving
                ? '변경 중…'
                : editingItem.retired
                  ? 'Retired 해제'
                  : 'Retired'}
            </button>
          </div>

          {linkedOutfitCount > 0 && (
            <p className="record-management__help">
              포함된 Outfit {linkedOutfitCount}개가 있어 삭제할 수 없습니다.
            </p>
          )}

          {deleteConfirming && linkedOutfitCount === 0 && (
            <div className="record-management__confirmation" role="alert">
              <strong>이 Item을 영구 삭제할까요?</strong>
              <p>삭제한 Item과 연결된 이미지는 복구할 수 없습니다.</p>
              <div>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={deleteSaving}
                  onClick={() => setDeleteConfirming(false)}
                >
                  취소
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  disabled={deleteSaving}
                  onClick={() => void removeItem()}
                >
                  {deleteSaving ? '삭제 중…' : '삭제 확인'}
                </button>
              </div>
            </div>
          )}

          {retireConfirming && !editingItem.retired && (
            <div className="record-management__confirmation" role="alert">
              <strong>이 Item을 Retired로 전환할까요?</strong>
              <p>
                기존 Outfit과 착용 기록은 유지되며 언제든 Retired를 해제할 수
                있습니다.
              </p>
              <div>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={retireSaving}
                  onClick={() => setRetireConfirming(false)}
                >
                  취소
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={retireSaving}
                  onClick={() => void changeRetired(true)}
                >
                  {retireSaving ? '변경 중…' : 'Retired 확인'}
                </button>
              </div>
            </div>
          )}

          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          )}
        </section>
      )}
    </AppShell>
  )
}
