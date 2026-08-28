import { describe, expect, it } from 'vitest'
import {
  getAvailableItemCategoryGroups,
  getItemCategoryGroupId,
  getItemCategoryStatistics,
  isMadeItemCategory,
  isLongWalkSuitabilityCategory,
  isItemVisibleInWardrobeSelection,
  itemMatchesCategoryGroup,
  sortItemsForOutfitDisplay,
} from './item-categories'

const productionCategories = [
  'Acc-Hands-made',
  'Acc-Head-made',
  'Acc-Neck',
  'Acc-Neck-made',
  'Acc-Waist',
  'Bags',
  'Bags-made',
  'Bottom-Knitwear',
  'Bottom-Pants',
  'Bottom-Skirts',
  'Dress',
  'Innerwear',
  'Outer-Cardigan',
  'Outer-Cardigan-made',
  'Outer-Coat',
  'Outer-Jacket',
  'Outer-Jumper',
  'Outer-Vest',
  'Outer-Vest-made',
  'Shoes',
  'Socks',
  'Top-Blouse',
  'Top-Hoodies',
  'Top-Knitwear',
  'Top-MTM',
  'Top-Sweater-made',
  'Top-T-shirts',
  'Top-T-shirts-innerwear',
]

describe('item category groups', () => {
  it('maps every current production category to a known upper group', () => {
    expect(
      productionCategories.every(
        (category) => getItemCategoryGroupId(category) !== 'other',
      ),
    ).toBe(true)
  })

  it('shows all seven Top tags together in the Top group', () => {
    expect(
      productionCategories.filter(
        (category) => getItemCategoryGroupId(category) === 'top',
      ),
    ).toEqual([
      'Top-Blouse',
      'Top-Hoodies',
      'Top-Knitwear',
      'Top-MTM',
      'Top-Sweater-made',
      'Top-T-shirts',
      'Top-T-shirts-innerwear',
    ])
  })

  it('keeps the filter choices to the requested seven groups and order', () => {
    expect(getItemCategoryGroupId('New-Experimental')).toBe('other')
    expect(
      getAvailableItemCategoryGroups([
        { category: 'Socks' },
        { category: 'Bags' },
        { category: 'Shoes' },
        { category: 'Dress' },
        { category: 'Bottom-Pants' },
        { category: 'Top-Blouse' },
        { category: 'Outer-Coat' },
        { category: 'Innerwear' },
        { category: 'New-Experimental' },
      ]),
    ).toEqual([
      { id: 'outer', label: 'Outer' },
      { id: 'top', label: 'Top' },
      { id: 'bottom', label: 'Bottom' },
      { id: 'dress', label: 'Dress' },
      { id: 'shoes', label: 'Shoes' },
      { id: 'bag', label: 'Bag' },
      { id: 'acc', label: 'Acc' },
    ])
  })

  it('groups Socks under Acc and keeps standalone Innerwear for statistics only', () => {
    expect(getItemCategoryGroupId('Socks')).toBe('acc')
    expect(isItemVisibleInWardrobeSelection({ category: 'Socks' })).toBe(true)
    expect(
      isItemVisibleInWardrobeSelection({ category: 'Innerwear' }),
    ).toBe(false)
    expect(
      isItemVisibleInWardrobeSelection({
        category: 'Top-T-shirts-innerwear',
      }),
    ).toBe(true)
    expect(
      getAvailableItemCategoryGroups([
        { category: 'Socks' },
        { category: 'Innerwear' },
      ]),
    ).toEqual([{ id: 'acc', label: 'Acc' }])

    expect(
      getItemCategoryStatistics([
        { category: 'Socks', retired: false },
        { category: 'Innerwear', retired: false },
      ]).map(({ id, label }) => ({ id, label })),
    ).toEqual([
      { id: 'acc', label: 'Acc' },
      { id: 'innerwear', label: 'Innerwear' },
    ])
  })

  it('marks Shoes and Bags as long-walk suitability categories', () => {
    expect(isLongWalkSuitabilityCategory('Shoes')).toBe(true)
    expect(isLongWalkSuitabilityCategory('Bags')).toBe(true)
    expect(isLongWalkSuitabilityCategory('Bags-made')).toBe(true)
    expect(isLongWalkSuitabilityCategory('Outer-Cardigan')).toBe(false)
  })

  it('filters by upper group without changing the detailed category', () => {
    const item = { category: 'Outer-Cardigan-made' }
    expect(itemMatchesCategoryGroup(item, 'outer')).toBe(true)
    expect(itemMatchesCategoryGroup(item, 'top')).toBe(false)
    expect(item.category).toBe('Outer-Cardigan-made')
  })

  it('Statistics와 Closet에서 같은 -made 접미사 기준을 사용한다', () => {
    expect(isMadeItemCategory({ category: 'Outer-Cardigan-made' })).toBe(true)
    expect(isMadeItemCategory({ category: ' Acc-Neck-MADE ' })).toBe(true)
    expect(isMadeItemCategory({ category: 'Outer-Cardigan' })).toBe(false)
  })

  it('Lookbook 구성 아이템을 상위 카테고리 순서로 고정한다', () => {
    const items = [
      { id: 'bag', category: 'Bags' },
      { id: 'neck-made', category: 'Acc-Neck-made' },
      { id: 'top-innerwear', category: 'Top-T-shirts-innerwear' },
      { id: 'shoes', category: 'Shoes' },
      { id: 'socks', category: 'Socks' },
      { id: 'bottom', category: 'Bottom-Skirts' },
      { id: 'top', category: 'Top-Knitwear' },
      { id: 'outer', category: 'Outer-Jacket' },
      { id: 'neck', category: 'Acc-Neck' },
    ]

    expect(sortItemsForOutfitDisplay(items).map((item) => item.id)).toEqual([
      'neck-made',
      'neck',
      'outer',
      'top',
      'top-innerwear',
      'bottom',
      'socks',
      'shoes',
      'bag',
    ])
    expect(items[0].id).toBe('bag')
  })

  it('같은 표시 그룹 안에서는 Outfit에 저장된 순서를 유지한다', () => {
    expect(
      sortItemsForOutfitDisplay([
        { id: 'top-2', category: 'Top-T-shirts' },
        { id: 'top-1', category: 'Top-Blouse' },
      ]).map((item) => item.id),
    ).toEqual(['top-2', 'top-1'])
  })

  it('counts detailed tags and active items inside their upper group', () => {
    expect(
      getItemCategoryStatistics([
        { category: 'Outer-Cardigan', retired: false },
        { category: 'Outer-Cardigan', retired: true },
        { category: 'Outer-Cardigan-made', retired: false },
      ]),
    ).toEqual([
      {
        id: 'outer',
        label: 'Outer',
        totalCount: 3,
        activeCount: 2,
        categories: [
          {
            category: 'Outer-Cardigan',
            totalCount: 2,
            activeCount: 1,
          },
          {
            category: 'Outer-Cardigan-made',
            totalCount: 1,
            activeCount: 1,
          },
        ],
      },
    ])
  })
})
