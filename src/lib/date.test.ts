import { describe, expect, it } from 'vitest'
import { todayInKorea } from './date'

describe('todayInKorea', () => {
  it('UTC 날짜가 달라도 한국 날짜를 사용한다', () => {
    expect(todayInKorea(new Date('2026-07-25T16:00:00Z'))).toBe('2026-07-26')
  })
})
