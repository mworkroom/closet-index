import { type FormEvent, useEffect, useState } from 'react'
import { useClosetData } from '../../../context/DataContext'
import { formatKoreanDate } from '../../../lib/date'
import type { Item, PurchaseEvent } from '../../../lib/types'
import type { PurchaseCycleStatus } from '../purchase-replenishment'

type ReplenishmentSectionVariant =
  | 'managed-detail'
  | 'general-editor'
  | 'general-history'

function parseWholeNumber(value: string, minimum: number, label: string) {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${label}은 ${minimum} 이상의 정수로 입력해 주세요.`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label}은 ${minimum} 이상의 정수로 입력해 주세요.`)
  }
  return parsed
}

function cycleSummary(cycle: PurchaseCycleStatus) {
  if (cycle.metric === 'wear_count') {
    return cycle.currentValue === null
      ? '착용 기록을 계산하지 못했습니다.'
      : `현재 주기 ${cycle.currentValue} / ${cycle.threshold}회`
  }
  return cycle.currentValue === null
    ? '교체 주기 계산에는 구매 기준일이 필요합니다.'
    : `현재 주기 ${cycle.currentValue} / ${cycle.threshold}일`
}

export function ItemReplenishmentSection({
  item,
  events,
  loading,
  loadError,
  reload,
  cycle,
  isReplacementTarget,
  today,
  variant = 'managed-detail',
}: {
  item: Item
  events: PurchaseEvent[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  cycle: PurchaseCycleStatus | null
  isReplacementTarget: boolean
  today: string
  variant?: ReplenishmentSectionVariant
}) {
  const { purchases, refresh } = useClosetData()
  const [createOpen, setCreateOpen] = useState(false)
  const [purchaseId, setPurchaseId] = useState(() => crypto.randomUUID())
  const [purchaseDate, setPurchaseDate] = useState(today)
  const [purchaseQuantity, setPurchaseQuantity] = useState('1')
  const [purchaseCurrentQuantity, setPurchaseCurrentQuantity] = useState(
    String(item.currentQuantity ?? 1),
  )
  const [quantityDraft, setQuantityDraft] = useState(
    item.currentQuantity === null || item.currentQuantity === undefined
      ? ''
      : String(item.currentQuantity),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editQuantity, setEditQuantity] = useState('1')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  useEffect(() => {
    setQuantityDraft(
      item.currentQuantity === null || item.currentQuantity === undefined
        ? ''
        : String(item.currentQuantity),
    )
  }, [item.currentQuantity])

  const isManagedDetail = variant === 'managed-detail'
  const isReadOnlyHistory = variant === 'general-history'
  const shouldShow = isManagedDetail
    ? isReplacementTarget ||
      (item.currentQuantity ?? null) !== null ||
      events.length > 0 ||
      Boolean(loadError)
    : variant === 'general-editor' || events.length > 0 || Boolean(loadError)
  if (!shouldShow) return null

  const headingId = `replenishment-heading-${variant}`

  const refreshSection = async () => {
    await Promise.all([refresh(), reload()])
  }

  const resetCreateForm = () => {
    setPurchaseId(crypto.randomUUID())
    setPurchaseDate(today)
    setPurchaseQuantity('1')
    setPurchaseCurrentQuantity(String(item.currentQuantity ?? 1))
    setCreateOpen(false)
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMutationError(null)
    try {
      const quantity = parseWholeNumber(purchaseQuantity, 1, '구매 수량')
      const currentQuantity = isManagedDetail
        ? parseWholeNumber(
            purchaseCurrentQuantity,
            0,
            '저장 후 현재 수량',
          )
        : null
      await purchases.create({
        id: purchaseId,
        itemId: item.id,
        purchasedOn: purchaseDate,
        quantity,
        currentQuantity,
      })
      resetCreateForm()
      await refreshSection()
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : '재구매를 기록하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleQuantitySave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMutationError(null)
    try {
      const currentQuantity = quantityDraft.trim()
        ? parseWholeNumber(quantityDraft, 0, '현재 수량')
        : null
      await purchases.setCurrentQuantity({
        itemId: item.id,
        currentQuantity,
      })
      await refresh()
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : '현재 수량을 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const beginEdit = (event: PurchaseEvent) => {
    setEditingId(event.id)
    setEditDate(event.purchasedOn)
    setEditQuantity(String(event.quantity))
    setDeletingId(null)
    setMutationError(null)
  }

  const handleUpdate = async (
    formEvent: FormEvent<HTMLFormElement>,
    purchaseEvent: PurchaseEvent,
  ) => {
    formEvent.preventDefault()
    setSaving(true)
    setMutationError(null)
    try {
      await purchases.update({
        eventId: purchaseEvent.id,
        purchasedOn: editDate,
        quantity: parseWholeNumber(editQuantity, 1, '구매 수량'),
        expectedUpdatedAt: purchaseEvent.updatedAt,
      })
      setEditingId(null)
      await reload()
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : '재구매 기록을 수정하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (purchaseEvent: PurchaseEvent) => {
    setSaving(true)
    setMutationError(null)
    try {
      await purchases.delete({
        eventId: purchaseEvent.id,
        expectedUpdatedAt: purchaseEvent.updatedAt,
      })
      setDeletingId(null)
      await reload()
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : '재구매 기록을 삭제하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className={`section replenishment-section replenishment-section--${variant}`}
      aria-labelledby={headingId}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">REPLENISHMENT</p>
          <h2 id={headingId}>
            {isManagedDetail
              ? '재구매와 현재 수량'
              : isReadOnlyHistory
                ? '재구매 이력'
                : '재구매 기록'}
          </h2>
        </div>
        {isManagedDetail && cycle?.due ? (
          <span className="badge badge--error">교체</span>
        ) : isReadOnlyHistory ? (
          <span className="count">{events.length}건</span>
        ) : null}
      </div>

      {variant === 'general-editor' ? (
        <p className="replenishment-intro">
          같은 Item을 다시 구입했을 때 날짜와 수량을 기록합니다.
        </p>
      ) : null}

      {loadError ? (
        <div className="replenishment-feedback replenishment-feedback--error" role="alert">
          <p>{loadError}</p>
          <button className="button button--secondary" type="button" onClick={() => void reload()}>
            다시 시도
          </button>
        </div>
      ) : null}

      {isManagedDetail ? (
        <div className="replenishment-summary">
          <div>
            <span>현재 보유 수량</span>
            <strong>
              {item.currentQuantity === null || item.currentQuantity === undefined
                ? '미입력'
                : `${item.currentQuantity}개`}
            </strong>
          </div>
          <div>
            <span>현재 주기 기준일</span>
            <strong>
              {cycle?.basisDate ? (
                <time dateTime={cycle.basisDate}>{formatKoreanDate(cycle.basisDate)}</time>
              ) : (
                '기록 없음'
              )}
            </strong>
          </div>
        </div>
      ) : null}

      {isManagedDetail && !item.retired && cycle ? (
        <div className="replenishment-progress">
          <div>
            <strong>{cycleSummary(cycle)}</strong>
            <span>
              {cycle.currentValue === null
                ? '최초 구매일 또는 재구매일을 입력해 주세요.'
                : cycle.due
                  ? '교체 기준에 도달했습니다.'
                  : `${cycle.remaining}${cycle.metric === 'wear_count' ? '회' : '일'} 남음`}
            </span>
          </div>
          {cycle.currentValue !== null ? (
            <progress
              aria-label={cycleSummary(cycle)}
              max={cycle.threshold}
              value={Math.min(cycle.currentValue, cycle.threshold)}
            />
          ) : null}
        </div>
      ) : null}

      {!item.retired && !isReadOnlyHistory ? (
        <div className="replenishment-actions">
          <button
            className="button button--primary"
            type="button"
            aria-expanded={createOpen}
            aria-controls="replenishment-create-form"
            onClick={() => {
              setCreateOpen((open) => !open)
              setMutationError(null)
            }}
          >
            재구매 기록
          </button>
        </div>
      ) : null}

      {!item.retired && createOpen ? (
        <form
          className={`replenishment-form${
            isManagedDetail ? '' : ' replenishment-form--history-only'
          }`}
          id="replenishment-create-form"
          onSubmit={(event) => void handleCreate(event)}
        >
          <label>
            <span>재구매 날짜</span>
            <input
              required
              type="date"
              min={item.acquiredOn ?? undefined}
              max={today}
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </label>
          <label>
            <span>구매 수량</span>
            <input
              required
              min="1"
              step="1"
              type="number"
              inputMode="numeric"
              value={purchaseQuantity}
              onChange={(event) => setPurchaseQuantity(event.target.value)}
            />
          </label>
          {isManagedDetail ? (
            <label>
              <span>저장 후 현재 수량</span>
              <input
                required
                min="0"
                step="1"
                type="number"
                inputMode="numeric"
                value={purchaseCurrentQuantity}
                onChange={(event) => setPurchaseCurrentQuantity(event.target.value)}
              />
            </label>
          ) : null}
          <div className="replenishment-form__actions">
            <button className="button button--secondary" type="button" onClick={resetCreateForm}>
              취소
            </button>
            <button className="button button--primary" disabled={saving} type="submit">
              {saving ? '저장 중…' : '재구매 저장'}
            </button>
          </div>
        </form>
      ) : null}

      {isManagedDetail && !item.retired ? (
        <form className="replenishment-quantity-form" onSubmit={(event) => void handleQuantitySave(event)}>
          <label>
            <span>현재 수량만 수정</span>
            <input
              min="0"
              step="1"
              type="number"
              inputMode="numeric"
              placeholder="미입력"
              value={quantityDraft}
              onChange={(event) => setQuantityDraft(event.target.value)}
            />
          </label>
          <button className="button button--secondary" disabled={saving} type="submit">
            수량 저장
          </button>
        </form>
      ) : null}

      {mutationError ? (
        <p className="replenishment-feedback replenishment-feedback--error" role="alert">
          {mutationError}
        </p>
      ) : null}

      <div className={`replenishment-history${isReadOnlyHistory ? ' replenishment-history--compact' : ''}`}>
        {!isReadOnlyHistory ? (
          <div className="section-heading">
            <h3>{isManagedDetail ? '재구매 이력' : '기록된 이력'}</h3>
            <span className="count">{events.length}건</span>
          </div>
        ) : null}
        {loading ? <p className="muted">재구매 이력을 불러오는 중…</p> : null}
        {!loading && events.length === 0 ? (
          <p className="muted">아직 재구매 기록이 없습니다.</p>
        ) : null}
        {events.length > 0 ? (
          <ul>
            {events.map((purchaseEvent) => (
              <li key={purchaseEvent.id}>
                {!isReadOnlyHistory && editingId === purchaseEvent.id ? (
                  <form onSubmit={(event) => void handleUpdate(event, purchaseEvent)}>
                    <label>
                      <span>재구매 날짜</span>
                      <input
                        required
                        type="date"
                        min={item.acquiredOn ?? undefined}
                        max={today}
                        value={editDate}
                        onChange={(event) => setEditDate(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>구매 수량</span>
                      <input
                        required
                        min="1"
                        step="1"
                        type="number"
                        value={editQuantity}
                        onChange={(event) => setEditQuantity(event.target.value)}
                      />
                    </label>
                    <div className="replenishment-history__actions">
                      <button className="button button--secondary" type="button" onClick={() => setEditingId(null)}>
                        취소
                      </button>
                      <button className="button button--primary" disabled={saving} type="submit">
                        변경 저장
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>{formatKoreanDate(purchaseEvent.purchasedOn)}</strong>
                      <span>{purchaseEvent.quantity}개 구매</span>
                    </div>
                    {!isReadOnlyHistory ? (
                      <div className="replenishment-history__actions">
                        <button className="button button--secondary" type="button" onClick={() => beginEdit(purchaseEvent)}>
                          수정
                        </button>
                        <button className="button button--secondary" type="button" onClick={() => {
                          setDeletingId(purchaseEvent.id)
                          setEditingId(null)
                        }}>
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
                {!isReadOnlyHistory && deletingId === purchaseEvent.id ? (
                  <div className="replenishment-history__confirmation">
                    <p>이 기록을 삭제할까요? 현재 보유 수량은 바뀌지 않습니다.</p>
                    <div>
                      <button className="button button--secondary" type="button" onClick={() => setDeletingId(null)}>
                        취소
                      </button>
                      <button className="button button--danger" disabled={saving} type="button" onClick={() => void handleDelete(purchaseEvent)}>
                        기록 삭제
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
