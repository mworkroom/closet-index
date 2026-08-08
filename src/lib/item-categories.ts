import type { Item } from './types'

export type ItemCategoryGroupId =
  | 'outer'
  | 'top'
  | 'bottom'
  | 'dress'
  | 'shoes'
  | 'bag'
  | 'acc'
  | 'innerwear'
  | 'other'

export type ItemCategoryFilterGroupId = Exclude<
  ItemCategoryGroupId,
  'innerwear' | 'other'
>

export interface ItemCategoryGroupDefinition {
  id: ItemCategoryGroupId
  label: string
}

export const ITEM_CATEGORY_GROUPS: readonly ItemCategoryGroupDefinition[] = [
  { id: 'outer', label: 'Outer' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'dress', label: 'Dress' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'bag', label: 'Bag' },
  { id: 'acc', label: 'Acc' },
  { id: 'innerwear', label: 'Innerwear' },
  { id: 'other', label: 'Other' },
]

export const ITEM_CATEGORY_FILTER_GROUPS =
  ITEM_CATEGORY_GROUPS.filter(
    (
      group,
    ): group is ItemCategoryGroupDefinition & {
      id: ItemCategoryFilterGroupId
    } => group.id !== 'innerwear' && group.id !== 'other',
  )

const filterGroupIds = new Set(
  ITEM_CATEGORY_FILTER_GROUPS.map((group) => group.id),
)
const groupOrder = new Map(
  ITEM_CATEGORY_GROUPS.map((group, index) => [group.id, index]),
)

const outfitDisplayOrder: Record<ItemCategoryGroupId, number> = {
  outer: 1,
  top: 2,
  bottom: 4,
  shoes: 6,
  bag: 7,
  dress: 8,
  acc: 9,
  innerwear: 10,
  other: 11,
}

function getOutfitDisplayOrder(category: string) {
  const normalized = category.trim().toLocaleLowerCase('en')
  if (normalized === 'acc-neck' || normalized === 'acc-neck-made') {
    return 0
  }
  if (normalized.startsWith('top') && normalized.includes('innerwear')) {
    return 3
  }
  if (normalized.startsWith('sock')) return 5
  return outfitDisplayOrder[getItemCategoryGroupId(category)]
}

export function isItemCategoryFilterGroupId(
  value: string,
): value is ItemCategoryFilterGroupId {
  return filterGroupIds.has(value as ItemCategoryFilterGroupId)
}

export function getItemCategoryGroupId(
  category: string,
): ItemCategoryGroupId {
  const normalized = category.trim().toLocaleLowerCase('en')

  if (normalized.startsWith('outer')) return 'outer'
  if (normalized.startsWith('top')) return 'top'
  if (
    normalized.startsWith('bottom') ||
    normalized.startsWith('pants') ||
    normalized.startsWith('skirt')
  ) {
    return 'bottom'
  }
  if (normalized.startsWith('dress')) return 'dress'
  if (normalized.startsWith('innerwear')) return 'innerwear'
  if (normalized.startsWith('shoe')) return 'shoes'
  if (normalized.startsWith('bag')) return 'bag'
  if (
    normalized.startsWith('sock') ||
    normalized.startsWith('acc-') ||
    normalized.includes('accessor')
  ) {
    return 'acc'
  }
  return 'other'
}

export function itemMatchesCategoryGroup(
  item: Pick<Item, 'category'>,
  groupId: ItemCategoryFilterGroupId | '',
) {
  return !groupId || getItemCategoryGroupId(item.category) === groupId
}

export function sortItemsForOutfitDisplay<T extends Pick<Item, 'category'>>(
  items: readonly T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        getOutfitDisplayOrder(left.item.category) -
          getOutfitDisplayOrder(right.item.category) ||
        left.index - right.index,
    )
    .map(({ item }) => item)
}

export function isMadeItemCategory(item: Pick<Item, 'category'>) {
  return item.category.trim().toLocaleLowerCase('en').endsWith('-made')
}

export function isItemVisibleInWardrobeSelection(
  item: Pick<Item, 'category'>,
) {
  return getItemCategoryGroupId(item.category) !== 'innerwear'
}

export function getAvailableItemCategoryGroups(
  items: ReadonlyArray<Pick<Item, 'category'>>,
) {
  const available = new Set(
    items.map((item) => getItemCategoryGroupId(item.category)),
  )
  return ITEM_CATEGORY_FILTER_GROUPS.filter((group) =>
    available.has(group.id),
  )
}

export interface DetailedCategoryCount {
  category: string
  totalCount: number
  activeCount: number
}

export interface ItemCategoryStatisticsGroup
  extends ItemCategoryGroupDefinition {
  totalCount: number
  activeCount: number
  categories: DetailedCategoryCount[]
}

export function getItemCategoryStatistics(
  items: ReadonlyArray<Pick<Item, 'category' | 'retired'>>,
): ItemCategoryStatisticsGroup[] {
  const categoryCounts = new Map<string, DetailedCategoryCount>()

  for (const item of items) {
    const category = item.category.trim()
    const existing = categoryCounts.get(category) ?? {
      category,
      totalCount: 0,
      activeCount: 0,
    }
    existing.totalCount += 1
    if (!item.retired) existing.activeCount += 1
    categoryCounts.set(category, existing)
  }

  const grouped = new Map<
    ItemCategoryGroupId,
    ItemCategoryStatisticsGroup
  >()
  for (const categoryCount of categoryCounts.values()) {
    const id = getItemCategoryGroupId(categoryCount.category)
    const definition = ITEM_CATEGORY_GROUPS.find((group) => group.id === id)!
    const group = grouped.get(id) ?? {
      ...definition,
      totalCount: 0,
      activeCount: 0,
      categories: [],
    }
    group.totalCount += categoryCount.totalCount
    group.activeCount += categoryCount.activeCount
    group.categories.push(categoryCount)
    grouped.set(id, group)
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      categories: group.categories.sort((left, right) =>
        left.category.localeCompare(right.category, 'en'),
      ),
    }))
    .sort(
      (left, right) =>
        (groupOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (groupOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    )
}
