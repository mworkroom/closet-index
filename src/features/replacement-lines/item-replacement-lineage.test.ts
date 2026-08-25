import { describe, expect, it } from 'vitest'
import type { Item, ReplacementLineEdge } from '../../lib/types'
import { getItemReplacementLineage } from './item-replacement-lineage'

const items = [
  { id: 'parent', name: '부모', acquiredOn: '2024-01-01' },
  { id: 'current', name: '현재', acquiredOn: '2025-01-01' },
  { id: 'child', name: '자식', acquiredOn: '2026-01-01' },
  { id: 'retired-parent', name: 'Retired 부모', acquiredOn: '2023-01-01', retired: true },
].map(
  (item): Item => ({
    category: 'Top',
    semanticColor: null,
    displayHex: '#111111',
    seasons: [],
    retired: false,
    rainOk: false,
    longWalkOk: false,
    memo: null,
    image: null,
    ...item,
  }),
)

function edge(
  id: string,
  predecessorItemId: string,
  successorItemId: string,
  status: ReplacementLineEdge['status'] = 'confirmed',
): ReplacementLineEdge {
  return {
    id,
    replacementLineId: 'line',
    predecessorItemId,
    successorItemId,
    branchName: null,
    decisionReason: `${id} 이유`,
    status,
    confirmedAt: '2026-08-06T00:00:00Z',
    updatedAt: '2026-08-06T00:00:00Z',
  }
}

describe('getItemReplacementLineage', () => {
  it('keeps confirmed direct parents and children, including Retired items', () => {
    const result = getItemReplacementLineage('current', items, [
      edge('parent-edge', 'parent', 'current'),
      edge('retired-edge', 'retired-parent', 'current'),
      edge('child-edge', 'current', 'child'),
      edge('archived-edge', 'current', 'parent', 'archived'),
      edge('unrelated-edge', 'parent', 'child'),
    ])

    expect(result.parents.map((relation) => relation.item.id)).toEqual([
      'retired-parent',
      'parent',
    ])
    expect(result.parents.map((relation) => relation.decisionReason)).toEqual([
      'retired-edge 이유',
      'parent-edge 이유',
    ])
    expect(result.children.map((relation) => relation.item.id)).toEqual(['child'])
  })

  it('ignores confirmed relations whose related Item is unavailable', () => {
    expect(
      getItemReplacementLineage('current', items, [
        edge('missing-parent', 'missing', 'current'),
        edge('missing-child', 'current', 'missing'),
      ]),
    ).toEqual({ parents: [], children: [] })
  })
})
