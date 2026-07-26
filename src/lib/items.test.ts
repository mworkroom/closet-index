import { describe, expect, it } from 'vitest'
import type { Item } from './types'
import { sortItems } from './items'

function item(id: string, name: string, acquiredOn: string | null): Item {
  return {
    id,
    name,
    category: 'Top',
    semanticColor: null,
    displayHex: '#000000',
    seasons: [],
    retired: false,
    rainOk: 'unknown',
    longWalkOk: 'unknown',
    memo: null,
    acquiredOn,
  }
}

describe('sortItems', () => {
  const items = [
    item('unknown', '날짜 없음', null),
    item('older', '오래된 옷', '2024-01-10'),
    item('recent-b', '최근 옷 B', '2026-07-03'),
    item('recent-a', '최근 옷 A', '2026-07-03'),
  ]

  it('기본 구매일 최신순에서 미입력 아이템을 마지막에 둔다', () => {
    expect(sortItems(items, 'acquired-desc').map((entry) => entry.id)).toEqual([
      'recent-a',
      'recent-b',
      'older',
      'unknown',
    ])
  })

  it('구매일 오래된순에서도 미입력 아이템을 마지막에 둔다', () => {
    expect(sortItems(items, 'acquired-asc').map((entry) => entry.id)).toEqual([
      'older',
      'recent-a',
      'recent-b',
      'unknown',
    ])
  })
})
