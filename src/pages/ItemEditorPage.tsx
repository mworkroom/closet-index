import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
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
  const { data, loading, error, refresh, createItem, updateItem } =
    useClosetData()
  const editingItem = itemId
    ? data?.items.find((item) => item.id === itemId)
    : undefined
  const [createId] = useState(() => crypto.randomUUID())
  const [form, setForm] = useState<ItemWriteInput>(initialForm)
  const [initializedItemId, setInitializedItemId] = useState<string | null>(
    itemId ? null : 'new',
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)

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
  const semanticColors = useMemo(
    () =>
      [
        ...new Set(
          data?.items
            .map((item) => item.semanticColor)
            .filter((value): value is string => Boolean(value)) ?? [],
        ),
      ].sort(),
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

  if (
    (loading && !data) ||
    (itemId && editingItem && initializedItemId !== itemId)
  ) {
    return (
      <AppShell title={itemId ? 'Item 수정' : '새 Item'} eyebrow="ITEM EDITOR" back>
        <LoadingState />
      </AppShell>
    )
  }

  if (data && itemId && !editingItem) {
    return (
      <AppShell title="Item 수정" eyebrow="ITEM EDITOR" back>
        <ErrorState message="수정할 Item을 찾을 수 없습니다." />
      </AppShell>
    )
  }

  return (
    <AppShell
      title={itemId ? 'Item 수정' : '새 Item'}
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
              <input
                value={form.category}
                required
                list="item-category-options"
                autoComplete="off"
                onChange={(event) => updateField('category', event.target.value)}
              />
              <datalist id="item-category-options">
                {categories.map((category) => (
                  <option value={category} key={category} />
                ))}
              </datalist>
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
                {semanticColors.map((color) => (
                  <option value={color} key={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>fallback 색상 *</span>
              <span className="item-editor-color-field">
                <input
                  type="color"
                  value={form.displayHex}
                  aria-label="fallback 색상 선택"
                  onChange={(event) =>
                    updateField('displayHex', event.target.value)
                  }
                />
                <input
                  value={form.displayHex}
                  required
                  pattern="#[0-9A-Fa-f]{6}"
                  aria-label="fallback HEX"
                  onChange={(event) =>
                    updateField('displayHex', event.target.value)
                  }
                />
              </span>
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
    </AppShell>
  )
}
