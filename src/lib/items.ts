import type { Item } from './types'

export type ItemSort = 'acquired-desc' | 'acquired-asc' | 'name'

export function isWishItem(item: Pick<Item, 'acquiredOn'>) {
  return item.acquiredOn === null
}

function compareName(a: Item, b: Item) {
  return a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)
}

export function sortItems(items: Item[], sort: ItemSort): Item[] {
  return [...items].sort((a, b) => {
    if (sort === 'name') return compareName(a, b)

    if (a.acquiredOn === null && b.acquiredOn === null) return compareName(a, b)
    if (a.acquiredOn === null) return -1
    if (b.acquiredOn === null) return 1

    const dateOrder =
      sort === 'acquired-desc'
        ? b.acquiredOn.localeCompare(a.acquiredOn)
        : a.acquiredOn.localeCompare(b.acquiredOn)

    return dateOrder || compareName(a, b)
  })
}
