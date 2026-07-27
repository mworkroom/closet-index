import { describe, expect, it } from 'vitest'
import { formatMonthDayYear, todayInKorea } from './date'

describe('todayInKorea', () => {
  it('UTC 날짜가 달라도 한국 날짜를 사용한다', () => {
    expect(todayInKorea(new Date('2026-07-25T16:00:00Z'))).toBe('2026-07-26')
  })
})

describe('formatMonthDayYear', () => {
  it('착용 날짜를 M/D/YY로 표시한다', () => {
    expect(formatMonthDayYear('2026-07-18')).toBe('7/18/26')
  })

  it('날짜가 없으면 기록 없음으로 표시한다', () => {
    expect(formatMonthDayYear(null)).toBe('기록 없음')
  })
})
