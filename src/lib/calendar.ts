export interface CalendarDay {
  date: string
  day: number
  inCurrentMonth: boolean
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseMonth(value: string): { year: number; monthIndex: number } | null {
  const match = MONTH_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { year, monthIndex: month - 1 }
}

export function isValidCalendarMonth(value: string | null): value is string {
  return Boolean(value && parseMonth(value))
}

export function isValidCalendarDate(value: string | null): value is string {
  if (!value) return false
  const match = DATE_PATTERN.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, monthIndex, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day
  )
}

export function shiftCalendarMonth(value: string, amount: number): string {
  const parsed = parseMonth(value)
  if (!parsed) throw new Error(`Invalid calendar month: ${value}`)

  const date = new Date(Date.UTC(parsed.year, parsed.monthIndex + amount, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

export function formatCalendarMonth(value: string): string {
  const parsed = parseMonth(value)
  if (!parsed) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)))
}

export function formatCalendarDate(value: string): string {
  if (!isValidCalendarDate(value)) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function buildCalendarMonth(value: string): CalendarDay[][] {
  const parsed = parseMonth(value)
  if (!parsed) throw new Error(`Invalid calendar month: ${value}`)

  const first = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(
    Date.UTC(parsed.year, parsed.monthIndex + 1, 0),
  ).getUTCDate()
  const naturalWeeks = Math.ceil((mondayOffset + daysInMonth) / 7)
  const weekCount = Math.max(5, naturalWeeks)
  const start = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1 - mondayOffset))

  return Array.from({ length: weekCount }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + weekIndex * 7 + dayIndex)
      return {
        date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
        day: date.getUTCDate(),
        inCurrentMonth:
          date.getUTCFullYear() === parsed.year &&
          date.getUTCMonth() === parsed.monthIndex,
      }
    }),
  )
}
