import { MapPin, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { OutfitVisual } from '../components/OutfitVisual'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import { formatKoreanDate, todayInKorea } from '../lib/date'
import { outfitLabel } from '../lib/outfits'

export function CalendarPage() {
  const { data, loading, error, refresh, deleteWearLog } = useClosetData()
  const [searchParams] = useSearchParams()
  const targetDate = searchParams.get('date')
  const [month, setMonth] = useState((targetDate ?? todayInKorea()).slice(0, 7))
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    if (!data) return []
    const groups = new Map<string, typeof data.wearLogs>()
    data.wearLogs
      .filter((log) => log.wornOn.startsWith(month))
      .sort((a, b) => {
        const dateOrder = b.wornOn.localeCompare(a.wornOn)
        return dateOrder || a.createdAt.localeCompare(b.createdAt)
      })
      .forEach((log) => {
        groups.set(log.wornOn, [...(groups.get(log.wornOn) ?? []), log])
      })
    return [...groups.entries()]
  }, [data, month])

  const remove = async (id: string) => {
    if (!window.confirm('이 착용 기록을 삭제할까요? 삭제 후 통계도 다시 계산됩니다.')) {
      return
    }
    setDeletingId(id)
    try {
      await deleteWearLog(id)
    } catch {
      // DataContext owns the user-facing error state.
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppShell title="Calendar" eyebrow="WEAR LOG" back>
      <label className="month-picker">
        <span>확인할 월</span>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </label>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {data && grouped.length === 0 && (
        <EmptyState
          title="이 달의 착용 기록이 없어요"
          description="Outfit 상세에서 ‘오늘 입기’로 새 기록을 남길 수 있습니다."
        />
      )}
      {data && grouped.length > 0 && (
        <div className="calendar-list">
          {grouped.map(([date, logs]) => (
            <section className="calendar-day" key={date}>
              <div className="calendar-day__heading">
                <h2>{formatKoreanDate(date)}</h2>
                <span>{logs.length}개 기록</span>
              </div>
              <div className="card-list">
                {logs.map((log, index) => {
                  const outfit = data.outfits.find(
                    (entry) => entry.id === log.outfitId,
                  )
                  const place = data.places.find((entry) => entry.id === log.placeId)
                  return (
                    <article className="record-card" key={log.id}>
                      {outfit && (
                        <OutfitVisual
                          outfit={outfit}
                          items={data.items}
                          className="record-card__preview"
                          maxSwatches={3}
                          swatchSize="small"
                        />
                      )}
                      <div className="record-card__body">
                        <p className="eyebrow">RECORD {index + 1}</p>
                        <h3>
                          {outfit
                            ? outfitLabel(outfit, data.items)
                            : '연결된 Outfit 없음'}
                        </h3>
                        <p className="muted">
                          출발 {log.tempOut ?? '—'}°C · 귀가 {log.tempBack ?? '—'}°C
                        </p>
                        {place && (
                          <p className="record-card__place">
                            <MapPin size={15} />
                            {place.name}
                          </p>
                        )}
                      </div>
                      <div className="record-card__actions">
                        <Link
                          className="icon-button"
                          aria-label="착용 기록 수정"
                          to={`/records/${log.id}/edit`}
                        >
                          <Pencil size={18} />
                        </Link>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          aria-label="착용 기록 삭제"
                          disabled={deletingId === log.id}
                          onClick={() => void remove(log.id)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  )
}
