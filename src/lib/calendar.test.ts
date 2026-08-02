import { describe, expect, it } from 'vitest'
import {
  buildCalendarMonth,
  formatCalendarMonth,
  isValidCalendarDate,
  isValidCalendarMonth,
  shiftCalendarMonth,
} from './calendar'

describe('calendar month helpers', () => {
  it('builds Monday-first five-week months with adjacent dates', () => {
    const weeks = buildCalendarMonth('2026-04')

    expect(weeks).toHaveLength(5)
    expect(weeks[0].map((day) => day.date)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
    ])
    expect(weeks.at(-1)?.at(-1)?.date).toBe('2026-05-03')
  })

  it('keeps four-week February layouts at a readable five rows', () => {
    const weeks = buildCalendarMonth('2021-02')

    expect(weeks).toHaveLength(5)
    expect(weeks[0][0].date).toBe('2021-02-01')
    expect(weeks[4][0].date).toBe('2021-03-01')
  })

  it('supports six-week and leap-year month boundaries', () => {
    expect(buildCalendarMonth('2026-03')).toHaveLength(6)
    expect(buildCalendarMonth('2024-02').flat().some((day) => day.date === '2024-02-29')).toBe(true)
  })

  it('shifts and formats months without local-time drift', () => {
    expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01')
    expect(formatCalendarMonth('2026-04')).toBe('April 2026')
  })

  it('rejects invalid URL month and date values', () => {
    expect(isValidCalendarMonth('2026-04')).toBe(true)
    expect(isValidCalendarMonth('2026-13')).toBe(false)
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    expect(isValidCalendarDate('2026-02-29')).toBe(false)
  })
})
