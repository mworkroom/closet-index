import { type FormEvent, useState } from 'react'
import { useClosetData } from '../../../context/DataContext'
import { formatKoreanDate } from '../../../lib/date'
import type { CareEvent, CareMethod, Item } from '../../../lib/types'
import {
  careMethodLabel,
  type CareCycleStatus,
  type CareRule,
} from '../care-cycle'

export function ItemCareSection({
  item,
  events,
  loading,
  loadError,
  reload,
  cycle,
  rule,
  today,
}: {
  item: Item
  events: CareEvent[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  cycle: CareCycleStatus | null
  rule: CareRule | null
  today: string
}) {
  const { care } = useClosetData()
  const [createOpen, setCreateOpen] = useState(false)
  const [careId, setCareId] = useState(() => crypto.randomUUID())
  const [careDate, setCareDate] = useState(today)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editMethod, setEditMethod] = useState<CareMethod>('hand_wash')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  if (!rule && events.length === 0 && !loadError) return null

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!rule) return
    setSaving(true)
    setMutationError(null)
    try {
      await care.create({
        id: careId,
        itemId: item.id,
        caredOn: careDate,
        method: rule.method,
      })
      setCareId(crypto.randomUUID())
      setCareDate(today)
      setCreateOpen(false)
      await reload()
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : '관리를 기록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const beginEdit = (careEvent: CareEvent) => {
    setEditingId(careEvent.id)
    setEditDate(careEvent.caredOn)
    setEditMethod(careEvent.method)
    setDeletingId(null)
    setMutationError(null)
  }

  const handleUpdate = async (
    formEvent: FormEvent<HTMLFormElement>,
    careEvent: CareEvent,
  ) => {
    formEvent.preventDefault()
    setSaving(true)
    setMutationError(null)
    try {
      await care.update({
        eventId: careEvent.id,
        caredOn: editDate,
        method: editMethod,
        expectedUpdatedAt: careEvent.updatedAt,
      })
      setEditingId(null)
      await reload()
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : '관리 기록을 수정하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (careEvent: CareEvent) => {
    setSaving(true)
    setMutationError(null)
    try {
      await care.delete({
        eventId: careEvent.id,
        expectedUpdatedAt: careEvent.updatedAt,
      })
      setDeletingId(null)
      await reload()
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : '관리 기록을 삭제하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="section care-section" aria-labelledby="care-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SPECIAL CARE</p>
          <h2 id="care-heading">손세탁·드라이클리닝</h2>
        </div>
        {cycle?.due ? <span className={`badge badge--${cycle.method}`}>{cycle.label}</span> : null}
      </div>

      {loadError ? (
        <div className="replenishment-feedback replenishment-feedback--error" role="alert">
          <p>{loadError}</p>
          <button className="button button--secondary" type="button" onClick={() => void reload()}>
            다시 시도
          </button>
        </div>
      ) : null}

      {rule ? (
        <div className="replenishment-summary">
          <div>
            <span>현재 관리 방식</span>
            <strong>{rule.label}</strong>
          </div>
          <div>
            <span>최근 관리일</span>
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

      {!item.retired && cycle ? (
        <div className="replenishment-progress">
          <div>
            <strong>현재 주기 {cycle.currentValue} / {cycle.threshold}회</strong>
            <span>
              {cycle.due ? `${cycle.label} 기준에 도달했습니다.` : `${cycle.remaining}회 남음`}
            </span>
          </div>
          <progress
            aria-label={`${cycle.label} 현재 주기 ${cycle.currentValue} / ${cycle.threshold}회`}
            max={cycle.threshold}
            value={Math.min(cycle.currentValue, cycle.threshold)}
          />
        </div>
      ) : null}

      {!item.retired && rule ? (
        <div className="replenishment-actions">
          <button
            className="button button--primary"
            type="button"
            aria-expanded={createOpen}
            aria-controls="care-create-form"
            onClick={() => {
              setCreateOpen((open) => !open)
              setMutationError(null)
            }}
          >
            {rule.label} 완료
          </button>
        </div>
      ) : null}

      {!item.retired && rule && createOpen ? (
        <form className="replenishment-form care-form" id="care-create-form" onSubmit={(event) => void handleCreate(event)}>
          <label>
            <span>관리 날짜</span>
            <input required type="date" max={today} value={careDate} onChange={(event) => setCareDate(event.target.value)} />
          </label>
          <p>{rule.label} 완료 기록으로 저장합니다.</p>
          <div className="replenishment-form__actions">
            <button className="button button--secondary" type="button" onClick={() => setCreateOpen(false)}>취소</button>
            <button className="button button--primary" disabled={saving} type="submit">{saving ? '저장 중…' : '관리 기록 저장'}</button>
          </div>
        </form>
      ) : null}

      {mutationError ? <p className="replenishment-feedback replenishment-feedback--error" role="alert">{mutationError}</p> : null}

      <div className="replenishment-history">
        <div className="section-heading">
          <h3>전체 관리 이력</h3>
          <span className="count">{events.length}건</span>
        </div>
        {loading ? <p className="muted">관리 이력을 불러오는 중…</p> : null}
        {!loading && events.length === 0 ? <p className="muted">아직 관리 기록이 없습니다.</p> : null}
        {events.length > 0 ? (
          <ul>
            {events.map((careEvent) => (
              <li key={careEvent.id}>
                {editingId === careEvent.id ? (
                  <form onSubmit={(event) => void handleUpdate(event, careEvent)}>
                    <label>
                      <span>관리 날짜</span>
                      <input required type="date" max={today} value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                    </label>
                    <label>
                      <span>당시 관리 방식</span>
                      <select value={editMethod} onChange={(event) => setEditMethod(event.target.value as CareMethod)}>
                        <option value="hand_wash">손세탁</option>
                        <option value="dry_cleaning">드라이클리닝</option>
                      </select>
                    </label>
                    <div className="replenishment-history__actions">
                      <button className="button button--secondary" type="button" onClick={() => setEditingId(null)}>취소</button>
                      <button className="button button--primary" disabled={saving} type="submit">변경 저장</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>{formatKoreanDate(careEvent.caredOn)}</strong>
                      <span>{careMethodLabel(careEvent.method)}</span>
                    </div>
                    <div className="replenishment-history__actions">
                      <button className="button button--secondary" type="button" onClick={() => beginEdit(careEvent)}>수정</button>
                      <button className="button button--secondary" type="button" onClick={() => { setDeletingId(careEvent.id); setEditingId(null) }}>삭제</button>
                    </div>
                  </>
                )}
                {deletingId === careEvent.id ? (
                  <div className="replenishment-history__confirmation">
                    <p>이 관리 기록을 삭제할까요? 현재 주기는 남은 최신 기록으로 다시 계산됩니다.</p>
                    <div>
                      <button className="button button--secondary" type="button" onClick={() => setDeletingId(null)}>취소</button>
                      <button className="button button--danger" disabled={saving} type="button" onClick={() => void handleDelete(careEvent)}>기록 삭제</button>
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
