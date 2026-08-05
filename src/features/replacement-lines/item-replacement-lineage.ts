import type { Item, ReplacementLineEdge } from '../../lib/types'

export interface ItemReplacementLineRelation {
  edgeId: string
  item: Item
  decisionReason: string
}

export interface ItemReplacementLineage {
  parents: ItemReplacementLineRelation[]
  children: ItemReplacementLineRelation[]
}

const itemCollator = new Intl.Collator('ko-KR')

function compareRelations(
  left: ItemReplacementLineRelation,
  right: ItemReplacementLineRelation,
) {
  return (
    (left.item.acquiredOn ?? '').localeCompare(right.item.acquiredOn ?? '') ||
    itemCollator.compare(left.item.name, right.item.name) ||
    left.edgeId.localeCompare(right.edgeId)
  )
}

export function getItemReplacementLineage(
  itemId: string,
  items: Item[],
  edges: ReplacementLineEdge[],
): ItemReplacementLineage {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const parents: ItemReplacementLineRelation[] = []
  const children: ItemReplacementLineRelation[] = []

  for (const edge of edges) {
    if (edge.status !== 'confirmed') continue

    if (edge.successorItemId === itemId) {
      const parent = itemsById.get(edge.predecessorItemId)
      if (parent) {
        parents.push({
          edgeId: edge.id,
          item: parent,
          decisionReason: edge.decisionReason,
        })
      }
    }

    if (edge.predecessorItemId === itemId) {
      const child = itemsById.get(edge.successorItemId)
      if (child) {
        children.push({
          edgeId: edge.id,
          item: child,
          decisionReason: edge.decisionReason,
        })
      }
    }
  }

  return {
    parents: parents.sort(compareRelations),
    children: children.sort(compareRelations),
  }
}
