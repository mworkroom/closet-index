import { describe, expect, it } from 'vitest'
import type {
  ReplacementLineRecord,
  ReplacementLineSnapshot,
} from '../../lib/types'
import {
  applyAddedReplacementLineItem,
  applyRemovedReplacementLineItem,
  replaceReplacementLine,
} from './replacement-line-snapshot'

const sourceLine: ReplacementLineRecord = {
  id: 'line-source',
  name: 'Source',
  styleIdentity: null,
  colorCategory: null,
  reviewStatus: 'ready',
  lifecycleStatus: 'active',
  representativeLineId: null,
  archivedAt: null,
  updatedAt: '2026-08-05T00:00:00.000Z',
}

const targetLine: ReplacementLineRecord = {
  ...sourceLine,
  id: 'line-target',
  name: 'Target',
}

const snapshot: ReplacementLineSnapshot = {
  lines: [sourceLine, targetLine],
  memberships: [
    { replacementLineId: sourceLine.id, itemId: 'item-a' },
    { replacementLineId: targetLine.id, itemId: 'item-b' },
  ],
}

describe('replacement line snapshot updates', () => {
  it('replaces one saved Line without changing memberships', () => {
    const savedLine = {
      ...sourceLine,
      name: 'Renamed',
      updatedAt: '2026-08-05T01:00:00.000Z',
    }

    expect(replaceReplacementLine(snapshot, savedLine)).toEqual({
      lines: [savedLine, targetLine],
      memberships: snapshot.memberships,
    })
  })

  it('moves an added Item membership to the saved Line', () => {
    const savedLine = {
      ...targetLine,
      reviewStatus: 'needs_review' as const,
      updatedAt: '2026-08-05T01:00:00.000Z',
    }

    expect(
      applyAddedReplacementLineItem(
        snapshot,
        {
          lineId: targetLine.id,
          itemId: 'item-a',
          expectedUpdatedAt: targetLine.updatedAt,
        },
        savedLine,
      ),
    ).toEqual({
      lines: [sourceLine, savedLine],
      memberships: [
        { replacementLineId: targetLine.id, itemId: 'item-b' },
        { replacementLineId: targetLine.id, itemId: 'item-a' },
      ],
    })
  })

  it('removes only the source membership and applies every returned Line', () => {
    const savedSource = {
      ...sourceLine,
      updatedAt: '2026-08-05T01:00:00.000Z',
    }
    const savedTarget = {
      ...targetLine,
      reviewStatus: 'needs_review' as const,
      updatedAt: '2026-08-05T01:00:00.000Z',
    }

    expect(
      applyRemovedReplacementLineItem(
        snapshot,
        {
          sourceLineId: sourceLine.id,
          itemId: 'item-a',
          expectedSourceUpdatedAt: sourceLine.updatedAt,
        },
        [savedSource, savedTarget],
      ),
    ).toEqual({
      lines: [savedSource, savedTarget],
      memberships: [
        { replacementLineId: targetLine.id, itemId: 'item-b' },
      ],
    })
  })
})
