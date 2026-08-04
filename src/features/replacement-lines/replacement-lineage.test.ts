import { describe, expect, it } from 'vitest'
import type {
  Item,
  ReplacementLineEdge,
  ReplacementLineSnapshot,
} from '../../lib/types'
import { buildReplacementLineage } from './replacement-lineage'

const item = (id: string, acquiredOn: string | null = null): Item => ({
  id,
  name: `Item ${id}`,
  category: 'Top',
  semanticColor: null,
  displayHex: '#EEEEEE',
  seasons: ['Spring'],
  retired: id === 'a',
  rainOk: false,
  longWalkOk: false,
  memo: null,
  acquiredOn,
})

const edge = (
  id: string,
  predecessorItemId: string,
  successorItemId: string,
  status: ReplacementLineEdge['status'] = 'confirmed',
): ReplacementLineEdge => ({
  id,
  replacementLineId: 'line-a',
  predecessorItemId,
  successorItemId,
  sourceLegacyLinkId: `source-${id}`,
  sourceKind: 'legacy_link',
  branchName: null,
  decisionReason: `reason-${id}`,
  status,
  confirmedAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
})

const snapshot: ReplacementLineSnapshot = {
  lines: [{ id: 'line-a', name: 'Line A', styleIdentity: null, colorCategory: null, reviewStatus: 'ready', lifecycleStatus: 'active', representativeLineId: null, archivedAt: null, updatedAt: '2026-08-03T00:00:00Z' }],
  memberships: ['a', 'b', 'c', 'd', 'e', 'f'].map((itemId) => ({
    replacementLineId: 'line-a',
    itemId,
  })),
}

describe('buildReplacementLineage', () => {
  it('derives generations from confirmed edges and preserves branch, merge, and unconnected membership', () => {
    const result = buildReplacementLineage(
      'line-a',
      snapshot,
      [
        edge('ab', 'a', 'b'),
        edge('ac', 'a', 'c'),
        edge('bd', 'b', 'd'),
        edge('cd', 'c', 'd'),
        edge('de', 'd', 'e'),
        edge('ignored', 'f', 'e', 'needs_review'),
      ],
      [
        item('a', '2026-01-01'),
        item('b', '2024-01-01'),
        item('c', '2025-01-01'),
        item('d', '2023-01-01'),
        item('e', '2022-01-01'),
        item('f', '2021-01-01'),
      ],
    )

    expect(result).not.toBeNull()
    expect(result?.generations.map((generation) => generation.depth)).toEqual([
      0, 1, 2, 3,
    ])
    expect(result?.generations[0].groups[0].nodes.map((node) => node.item.id)).toEqual([
      'a',
    ])
    expect(result?.generations[1].groups[0].kind).toBe('branch')
    expect(result?.generations[1].groups[0].nodes.map((node) => node.item.id)).toEqual([
      'b', 'c',
    ])
    expect(result?.generations[2].groups[0].kind).toBe('merge')
    expect(result?.generations[2].groups[0].nodes[0].item.id).toBe('d')
    expect(result?.unconnectedMembers.map((entry) => entry.id)).toEqual(['f'])
    expect(result?.needsReviewEdgeCount).toBe(1)
    expect(result?.hasBranch).toBe(true)
    expect(result?.hasMerge).toBe(true)
  })

  it('reports a cycle instead of assigning invented generations', () => {
    const result = buildReplacementLineage(
      'line-a',
      snapshot,
      [edge('ab', 'a', 'b'), edge('ba', 'b', 'a')],
      [item('a'), item('b')],
    )

    expect(result?.cyclic).toBe(true)
    expect(result?.generations).toEqual([])
  })

  it('treats only explicitly designated standalone items as graph roots', () => {
    const result = buildReplacementLineage(
      'line-a',
      snapshot,
      [],
      [item('a'), item('b')],
      [
        {
          replacementLineId: 'line-a',
          itemId: 'a',
          designatedAt: '2026-08-03T02:00:00.000Z',
        },
      ],
    )

    expect(result?.generations[0].groups[0].nodes[0]).toMatchObject({
      item: { id: 'a' },
      isExplicitStart: true,
    })
    expect(result?.unconnectedMembers.map((entry) => entry.id)).toEqual(['b'])
    expect(result?.explicitStartCount).toBe(1)
  })
})
