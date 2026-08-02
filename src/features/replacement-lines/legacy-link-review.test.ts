import { describe, expect, it } from 'vitest'
import type {
  Item,
  ReplacementLegacyLink,
  ReplacementLineSnapshot,
} from '../../lib/types'
import {
  buildLegacyLinkReviewQueue,
  describeLegacyLinkDecision,
} from './legacy-link-review'

function item(id: string, name: string): Item {
  return {
    id,
    name,
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

describe('Legacy Link review queue', () => {
  it('preserves A/B order, shared Lines, progress, and unavailable Item boundaries', () => {
    const links: ReplacementLegacyLink[] = [
      {
        id: 'link-pending',
        itemAId: 'item-a',
        itemBId: 'item-b',
        reviewStatus: 'pending',
        reviewDecision: null,
        reviewReason: null,
        reviewedAt: null,
      },
      {
        id: 'link-reviewed',
        itemAId: 'item-a',
        itemBId: 'missing',
        reviewStatus: 'reviewed',
        reviewDecision: 'parallel',
        reviewReason: '같은 역할',
        reviewedAt: '2026-08-03T00:00:00Z',
      },
    ]
    const lines: ReplacementLineSnapshot = {
      lines: [{ id: 'line', name: 'Daily Top', styleIdentity: null }],
      memberships: [
        { replacementLineId: 'line', itemId: 'item-a' },
        { replacementLineId: 'line', itemId: 'item-b' },
      ],
    }

    const queue = buildLegacyLinkReviewQueue(links, lines, [
      item('item-a', 'A'),
      item('item-b', 'B'),
    ])

    expect(queue.reviewedCount).toBe(1)
    expect(queue.pendingPairs).toHaveLength(1)
    expect(queue.hiddenItemPairCount).toBe(1)
    expect(queue.pendingPairs[0]).toMatchObject({
      sharedLineNames: ['Daily Top'],
      reviewable: true,
      itemA: { name: 'A' },
      itemB: { name: 'B' },
    })
  })

  it('describes only the human-selected relationship', () => {
    expect(describeLegacyLinkDecision('a_to_b', 'Old', 'New')).toBe(
      'Old → New',
    )
    expect(describeLegacyLinkDecision('b_to_a', 'Old', 'New')).toBe(
      'New → Old',
    )
    expect(describeLegacyLinkDecision('parallel', 'Old', 'New')).toBe(
      '동등·병렬 후보',
    )
    expect(describeLegacyLinkDecision('not_replacement', 'Old', 'New')).toBe(
      '대체 관계 아님',
    )
  })
})
