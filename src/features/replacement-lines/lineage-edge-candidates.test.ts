import { describe, expect, it } from 'vitest'
import type { Item, ReplacementLegacyLink, ReplacementLineSnapshot } from '../../lib/types'
import { buildLineageEdgeCandidatePreview } from './lineage-edge-candidates'

function item(id: string): Item {
  return {
    id,
    name: id.toUpperCase(),
    category: 'Top',
    semanticColor: null,
    displayHex: '#222222',
    seasons: [],
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: null,
    image: null,
  }
}

function link(
  id: string,
  itemAId: string,
  itemBId: string,
  decision: ReplacementLegacyLink['reviewDecision'],
): ReplacementLegacyLink {
  return {
    id,
    itemAId,
    itemBId,
    reviewStatus: decision ? 'reviewed' : 'pending',
    reviewDecision: decision,
    reviewReason: decision ? '검토 근거' : null,
    reviewedAt: decision ? '2026-08-03T00:00:00Z' : null,
    updatedAt: '2026-08-03T00:00:00Z',
  }
}

describe('Lineage edge candidate preview', () => {
  it('separates ready, Line-choice, and excluded candidates and finds branch/merge points', () => {
    const snapshot: ReplacementLineSnapshot = {
      lines: [
        { id: 'line-1', name: 'Line One', styleIdentity: null, colorCategory: null, reviewStatus: 'ready', lifecycleStatus: 'active', representativeLineId: null, archivedAt: null, updatedAt: '2026-08-03T00:00:00Z' },
        { id: 'line-2', name: 'Line Two', styleIdentity: null, colorCategory: null, reviewStatus: 'ready', lifecycleStatus: 'active', representativeLineId: null, archivedAt: null, updatedAt: '2026-08-03T00:00:00Z' },
      ],
      memberships: [
        ...['a', 'b', 'c', 'd', 'e'].map((itemId) => ({
          replacementLineId: 'line-1',
          itemId,
        })),
        ...['d', 'e'].map((itemId) => ({ replacementLineId: 'line-2', itemId })),
      ],
    }
    const preview = buildLineageEdgeCandidatePreview(
      [
        link('a-b', 'a', 'b', 'a_to_b'),
        link('a-c', 'a', 'c', 'a_to_b'),
        link('b-c', 'b', 'c', 'a_to_b'),
        link('d-e', 'd', 'e', 'b_to_a'),
        link('parallel', 'b', 'd', 'parallel'),
      ],
      snapshot,
      ['a', 'b', 'c', 'd', 'e'].map(item),
    )

    expect(preview.summary).toMatchObject({
      total: 5,
      directional: 4,
      ready: 3,
      needsLineChoice: 1,
      excluded: 1,
      branchPoints: 1,
      mergePoints: 1,
      selfEdges: 0,
      duplicateEdges: 0,
      cycleLines: 0,
    })
    expect(preview.needsLineChoiceCandidates[0].sharedLines.map((line) => line.name)).toEqual([
      'Line One',
      'Line Two',
    ])
    expect(preview.branchPoints[0]).toMatchObject({ item: { id: 'a' } })
    expect(preview.mergePoints[0]).toMatchObject({ item: { id: 'c' } })
  })

  it('reports a candidate cycle without trying to repair it', () => {
    const snapshot: ReplacementLineSnapshot = {
      lines: [{ id: 'line', name: 'Cycle Line', styleIdentity: null, colorCategory: null, reviewStatus: 'ready', lifecycleStatus: 'active', representativeLineId: null, archivedAt: null, updatedAt: '2026-08-03T00:00:00Z' }],
      memberships: ['a', 'b', 'c'].map((itemId) => ({
        replacementLineId: 'line',
        itemId,
      })),
    }
    const preview = buildLineageEdgeCandidatePreview(
      [
        link('a-b', 'a', 'b', 'a_to_b'),
        link('b-c', 'b', 'c', 'a_to_b'),
        link('a-c', 'a', 'c', 'b_to_a'),
      ],
      snapshot,
      ['a', 'b', 'c'].map(item),
    )

    expect(preview.summary.cycleLines).toBe(1)
  })
})
