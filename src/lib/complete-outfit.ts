import { getItemCategoryGroupId } from './item-categories'
import type { Item } from './types'

export function isCompleteRecommendationOutfit(
  items: ReadonlyArray<Pick<Item, 'category'>>,
) {
  const categoryGroups = new Set(
    items.map((item) => getItemCategoryGroupId(item.category)),
  )
  const hasShoes = categoryGroups.has('shoes')
  const hasDress = categoryGroups.has('dress')
  const hasSeparates = categoryGroups.has('top') && categoryGroups.has('bottom')

  return hasShoes && (hasDress || hasSeparates)
}
