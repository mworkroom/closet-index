import { describe, expect, it } from 'vitest'
import {
  getAvailableItemCategoryGroups,
  getItemCategoryGroupId,
  getItemCategoryStatistics,
  isItemVisibleInWardrobeSelection,
  itemMatchesCategoryGroup,
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

  it('filters by upper group without changing the detailed category', () => {
    const item = { category: 'Outer-Cardigan-made' }
    expect(itemMatchesCategoryGroup(item, 'outer')).toBe(true)
    expect(itemMatchesCategoryGroup(item, 'top')).toBe(false)
    expect(item.category).toBe('Outer-Cardigan-made')
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
