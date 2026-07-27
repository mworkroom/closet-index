import { describe, expect, it } from 'vitest'
import type { Item, Outfit } from './types'
import {
  isSeasonDefiningItem,
  itemMatchesSeasonScope,
  normalizeSeasonScope,
  outfitMatchesSeasonScope,
} from './seasons'

function makeItem(
  id: string,
  category: string,
  seasons: string[],
): Item {
  return {
    id,
    name: id,
    category,
    semanticColor: null,
    displayHex: '#B8B8B4',
    seasons,
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: null,
  }
}

function makeOutfit(itemIds: string[]): Outfit {
  return {
    id: 'outfit',
    displayName: null,
    rating: null,
    itemIds,
  }
}

describe('season scope', () => {
  it('저장값에서 지원하는 계절만 정해진 순서로 복원한다', () => {
    expect(
      normalizeSeasonScope(['Winter', 'Summer', 'Unknown', 'Summer']),
    ).toEqual(['Summer', 'Winter'])
    expect(normalizeSeasonScope('Summer')).toEqual([])
  })

  it('전체 범위에서는 모든 Item을 표시하고 선택 범위에서는 교집합을 찾는다', () => {
    const item = makeItem('tee', 'Top-T-shirts', ['Summer', 'Fall'])

    expect(itemMatchesSeasonScope(item, [])).toBe(true)
    expect(itemMatchesSeasonScope(item, ['Summer'])).toBe(true)
    expect(itemMatchesSeasonScope(item, ['Winter'])).toBe(false)
  })

  it('주요 의류 하나라도 선택 계절이면 혼합 Outfit을 표시한다', () => {
    const items = [
      makeItem('sleeveless', 'Top-T-shirts-innerwear', ['Summer']),
      makeItem('cardigan', 'Outer-Cardigan', ['Fall']),
      makeItem('skirt', 'Bottom-Skirts', ['Summer', 'Fall']),
    ]
    const outfit = makeOutfit(items.map((item) => item.id))

    expect(outfitMatchesSeasonScope(outfit, items, ['Summer'])).toBe(true)
    expect(outfitMatchesSeasonScope(outfit, items, ['Fall'])).toBe(true)
    expect(outfitMatchesSeasonScope(outfit, items, ['Winter'])).toBe(false)
  })

  it('가방·액세서리·innerwear·양말은 Outfit 계절 판정에서 제외한다', () => {
    const items = [
      makeItem('padding', 'Outer-Jacket', ['Winter']),
      makeItem('pants', 'Bottom-Pants', ['Winter']),
      makeItem('bag', 'Bags-made', ['Summer']),
      makeItem('scarf', 'Acc-Neck-made', ['Summer']),
      makeItem('innerwear', 'Top-T-shirts-Innerwear', ['Summer']),
      makeItem('socks', 'Socks', ['Summer']),
    ]
    const outfit = makeOutfit(items.map((item) => item.id))

    expect(isSeasonDefiningItem(items[2])).toBe(false)
    expect(isSeasonDefiningItem(items[3])).toBe(false)
    expect(isSeasonDefiningItem(items[4])).toBe(false)
    expect(isSeasonDefiningItem(items[5])).toBe(false)
    expect(outfitMatchesSeasonScope(outfit, items, ['Summer'])).toBe(false)
    expect(outfitMatchesSeasonScope(outfit, items, ['Winter'])).toBe(true)
  })
})
