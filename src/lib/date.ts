const KOREA_TIME_ZONE = 'Asia/Seoul'

export function todayInKorea(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function formatKoreanDate(date: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00+09:00`))
}

export function formatShortDate(date: string | null): string {
  if (!date) return '기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00+09:00`))
}

export function formatMonthDayYear(date: string | null): string {
  if (!date) return '기록 없음'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: KOREA_TIME_ZONE,
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00+09:00`))
}
