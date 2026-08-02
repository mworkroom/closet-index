import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { OutfitVisual } from '../components/OutfitVisual'
import { ErrorState, LoadingState } from '../components/States'
import { useClosetData } from '../context/DataContext'
import {
  buildCalendarMonth,
  formatCalendarDate,
  formatCalendarMonth,
  isValidCalendarDate,
  isValidCalendarMonth,
  shiftCalendarMonth,
} from '../lib/calendar'
import { todayInKorea } from '../lib/date'
import { outfitLabel } from '../lib/outfits'

const weekdays = [
  ['MON', 'Monday'],
  ['TUE', 'Tuesday'],
  ['WED', 'Wednesday'],
  ['THU', 'Thursday'],
  ['FRI', 'Friday'],
  ['SAT', 'Saturday'],
  ['SUN', 'Sunday'],
] as const

export function CalendarPage() {
  const { data, loading, error, refresh } = useClosetData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [chooserDate, setChooserDate] = useState<string | null>(null)
  const chooserTriggerRef = useRef<HTMLButtonElement | null>(null)
  const chooserCloseRef = useRef<HTMLButtonElement | null>(null)
  const chooserSheetRef = useRef<HTMLElement | null>(null)
  const today = todayInKorea()
  const requestedDate = searchParams.get('date')
  const requestedMonth = searchParams.get('month')
  const targetDate = isValidCalendarDate(requestedDate) ? requestedDate : null
  const month = targetDate
    ? targetDate.slice(0, 7)
    : isValidCalendarMonth(requestedMonth)
      ? requestedMonth
      : today.slice(0, 7)
  const weeks = useMemo(() => buildCalendarMonth(month), [month])
  const outfitsById = useMemo(
    () => new Map(data?.outfits.map((outfit) => [outfit.id, outfit]) ?? []),
    [data?.outfits],
  )
  const placesById = useMemo(
    () => new Map(data?.places.map((place) => [place.id, place.name]) ?? []),
    [data?.places],
  )
  const logsByDate = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof data>['wearLogs']>()
    for (const log of data?.wearLogs ?? []) {
      const current = grouped.get(log.wornOn)
      if (current) current.push(log)
      else grouped.set(log.wornOn, [log])
    }
    for (const logs of grouped.values()) {
      logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }
    return grouped
  }, [data])
  const chooserLogs = chooserDate ? (logsByDate.get(chooserDate) ?? []) : []

  const setMonth = (nextMonth: string) => {
    if (!isValidCalendarMonth(nextMonth)) return
    const next = new URLSearchParams(searchParams)
    next.delete('date')
    next.set('month', nextMonth)
    setSearchParams(next, { replace: true })
    setChooserDate(null)
  }

  const openChooser = (date: string, trigger: HTMLButtonElement) => {
    chooserTriggerRef.current = trigger
    setChooserDate(date)
  }

  const closeChooser = () => setChooserDate(null)

  useEffect(() => {
    if (!chooserDate) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeChooser()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        chooserSheetRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ) ?? [],
      )
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    chooserCloseRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      chooserTriggerRef.current?.focus()
    }
  }, [chooserDate])

  return (
    <AppShell title="Calendar" eyebrow="WEAR LOG" fillViewport>
      <section className="calendar-view" aria-label="Monthly outfit calendar">
        <div className="calendar-toolbar">
          <button
            className="calendar-toolbar__arrow"
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(shiftCalendarMonth(month, -1))}
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <label className="calendar-month-picker">
            <span>{formatCalendarMonth(month)}</span>
            <input
              aria-label="Choose month"
              lang="en"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <button
            className="calendar-toolbar__arrow"
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(shiftCalendarMonth(month, 1))}
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="calendar-weekdays" role="row">
          {weekdays.map(([short, label]) => (
            <span key={short} role="columnheader" aria-label={label}>
              {short}
            </span>
          ))}
        </div>

        {loading && <LoadingState label="Loading calendar" />}
        {error && (
          <ErrorState
            title="Calendar unavailable"
            message={error}
            retryLabel="Try again"
            onRetry={() => void refresh()}
          />
        )}
        {data && (
          <div
            className={`calendar-grid calendar-grid--${weeks.length}`}
            role="grid"
            aria-label={formatCalendarMonth(month)}
          >
            {weeks.map((week) => (
              <div className="calendar-week" role="row" key={week[0].date}>
                {week.map((day) => {
                  const logs = day.inCurrentMonth
                    ? (logsByDate.get(day.date) ?? [])
                    : []
                  const firstOutfit = logs
                    .map((log) => outfitsById.get(log.outfitId))
                    .find(Boolean)
                  const dateLabel = formatCalendarDate(day.date)
                  const className = [
                    'calendar-cell',
                    day.inCurrentMonth ? '' : 'calendar-cell--outside',
                    day.date === today ? 'calendar-cell--today' : '',
                    day.date === targetDate ? 'calendar-cell--target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <div
                      className={className}
                      role="gridcell"
                      aria-label={dateLabel}
                      key={day.date}
                    >
                      <time dateTime={day.date}>{day.day}</time>
                      {logs.length === 1 && firstOutfit && (
                        <Link
                          className="calendar-outfit-target"
                          to={`/outfits/${firstOutfit.id}`}
                          aria-label={`Open ${outfitLabel(firstOutfit, data.items)} for ${dateLabel}`}
                        >
                          <OutfitVisual
                            outfit={firstOutfit}
                            items={data.items}
                            className="calendar-outfit-visual"
                            maxSwatches={3}
                            swatchSize="small"
                          />
                        </Link>
                      )}
                      {logs.length > 1 && firstOutfit && (
                        <button
                          className="calendar-outfit-target"
                          type="button"
                          aria-label={`Choose from ${logs.length} outfits for ${dateLabel}`}
                          onClick={(event) => openChooser(day.date, event.currentTarget)}
                        >
                          <OutfitVisual
                            outfit={firstOutfit}
                            items={data.items}
                            className="calendar-outfit-visual"
                            maxSwatches={3}
                            swatchSize="small"
                          />
                          <span className="calendar-outfit-count">+{logs.length - 1}</span>
                        </button>
                      )}
                      {logs.length > 0 && !firstOutfit && (
                        <span className="calendar-missing-outfit">LOG</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {data && chooserDate && chooserLogs.length > 1 && (
        <div
          className="calendar-sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeChooser()
          }}
        >
          <section
            ref={chooserSheetRef}
            className="calendar-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-sheet-title"
          >
            <div className="calendar-sheet__heading">
              <div>
                <p className="eyebrow">{chooserLogs.length} OUTFITS</p>
                <h2 id="calendar-sheet-title">{formatCalendarDate(chooserDate)}</h2>
              </div>
              <button
                ref={chooserCloseRef}
                className="icon-button"
                type="button"
                aria-label="Close outfit chooser"
                onClick={closeChooser}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="calendar-sheet__list">
              {chooserLogs.map((log) => {
                const outfit = outfitsById.get(log.outfitId)
                const place = log.placeId ? placesById.get(log.placeId) : null
                if (!outfit) {
                  return (
                    <div className="calendar-sheet__missing" key={log.id}>
                      Outfit unavailable
                    </div>
                  )
                }
                return (
                  <Link
                    className="calendar-sheet__outfit"
                    to={`/outfits/${outfit.id}`}
                    key={log.id}
                  >
                    <OutfitVisual
                      outfit={outfit}
                      items={data.items}
                      className="calendar-sheet__preview"
                      maxSwatches={3}
                      swatchSize="small"
                    />
                    <span className="calendar-sheet__body">
                      <strong>{outfitLabel(outfit, data.items)}</strong>
                      <small>
                        Out {log.tempOut ?? '—'}°C · Back {log.tempBack ?? '—'}°C
                      </small>
                      {place && (
                        <small>
                          <MapPin size={14} aria-hidden="true" />
                          {place}
                        </small>
                      )}
                    </span>
                    <ChevronRight size={20} aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}
