import { describe, expect, it } from 'vitest'
import type { Item, ReplacementLineSnapshot } from '../../lib/types'
import { buildReplacementLineOverview } from './replacement-line-overview'

function item(
  id: string,
  options: Partial<Pick<Item, 'retired' | 'acquiredOn' | 'name'>> = {},
): Item {
  return {
    id,
    name: options.name ?? id,
    category: 'Top-T-shirts',
    semanticColor: null,
    displayHex: '#222222',
    seasons: ['Summer'],
    retired: options.retired ?? false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: options.acquiredOn ?? null,
    image: null,
  }
}

describe('Replacement Line overview', () => {
  it('groups Lines and derives lifecycle, warning, and newest Active facts', () => {
    const snapshot: ReplacementLineSnapshot = {
      lines: [
        { id: 'line-a', name: 'Alpha', styleIdentity: 'Uniform' },
        { id: 'line-b', name: 'Beta', styleIdentity: 'Uniform' },
        { id: 'line-empty', name: 'Empty', styleIdentity: null },
      ],
      memberships: [
        { replacementLineId: 'line-a', itemId: 'active-old' },
        { replacementLineId: 'line-a', itemId: 'active-new' },
        { replacementLineId: 'line-a', itemId: 'retired' },
        { replacementLineId: 'line-b', itemId: 'active-new' },
      ],
    }

    const overview = buildReplacementLineOverview(snapshot, [
      item('active-old', { acquiredOn: '2024-01-01' }),
      item('active-new', { acquiredOn: '2026-07-01' }),
      item('retired', { retired: true, acquiredOn: '2025-02-01' }),
    ])

    expect(overview.groups.map((group) => group.label)).toEqual([
      'Uniform',
      'Style Identity 미지정',
    ])
    expect(overview.summary).toMatchObject({
      lineCount: 3,
      membershipCount: 4,
      uniqueItemCount: 3,
      activeItemCount: 2,
      retiredItemCount: 1,
      emptyLineCount: 1,
      singleItemLineCount: 1,
      multipleLineItemCount: 1,
      hiddenMembershipCount: 0,
    })
    expect(overview.lines.find((line) => line.id === 'line-a')).toMatchObject({
      membershipCount: 3,
      newestActiveAcquiredOn: '2026-07-01',
      hasMultipleLineItem: true,
    })
  })

  it('never exposes a membership Item that is absent from the loaded workspace snapshot', () => {
    const overview = buildReplacementLineOverview(
      {
        lines: [{ id: 'line', name: 'Scoped', styleIdentity: 'Secure' }],
        memberships: [
          { replacementLineId: 'line', itemId: 'workspace-item' },
          { replacementLineId: 'line', itemId: 'unavailable-item' },
        ],
      },
      [item('workspace-item')],
    )

    expect(overview.lines[0].activeItems.map(({ item }) => item.id)).toEqual([
      'workspace-item',
    ])
    expect(overview.lines[0].hiddenMembershipCount).toBe(1)
    expect(overview.summary.hiddenMembershipCount).toBe(1)
  })
})
