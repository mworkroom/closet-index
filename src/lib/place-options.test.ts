import { describe, expect, it } from 'vitest'
import { sortPlacesForSelection } from './place-options'

describe('sortPlacesForSelection', () => {
  it('자주 가는 장소를 지정 순서로 올리고 나머지는 가나다순으로 정렬한다', () => {
    const places = [
      { id: 'library', name: '도서관' },
      { id: 'starbucks-carte', name: '스타벅스 창동역 카뜨' },
      { id: 'cgv-banghak', name: 'CGV방학' },
      { id: 'cgv-myeong', name: 'CGV명씨네' },
      { id: 'airport', name: '공항' },
      { id: 'lotte-nowon', name: '롯데노원' },
      { id: 'cgv-yongsan', name: 'CGV용산' },
      { id: 'starbucks-to', name: '스타벅스 창동역 TO' },
      { id: 'convenience-store', name: '편의점' },
    ]

    expect(sortPlacesForSelection(places).map((place) => place.name)).toEqual([
      'CGV용산',
      'CGV방학',
      '롯데노원',
      '스타벅스 창동역 TO',
      '스타벅스 창동역 카뜨',
      'CGV명씨네',
      '공항',
      '도서관',
      '편의점',
    ])
    expect(places[0]?.name).toBe('도서관')
  })
})
