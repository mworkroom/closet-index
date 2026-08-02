import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeLegacyLinks,
  analyzeNotionSnapshot,
  analyzeReplacementLines,
  compareBaseline,
} from './phase4-baseline-audit-core.mjs'

test('replacement line analysis preserves empty, single, multi, and duplicate membership states', () => {
  const result = analyzeReplacementLines(
    [
      { id: 'line-empty', styleIdentity: null },
      { id: 'line-one', styleIdentity: 'Basic' },
      { id: 'line-many', styleIdentity: 'Basic' },
    ],
    [
      { replacementLineId: 'line-one', itemId: 'item-a' },
      { replacementLineId: 'line-many', itemId: 'item-a' },
      { replacementLineId: 'line-many', itemId: 'item-b' },
      { replacementLineId: 'line-many', itemId: 'item-b' },
      { replacementLineId: 'missing-line', itemId: 'item-c' },
    ],
  )

  assert.deepEqual(
    {
      replacementLines: result.replacementLines,
      replacementMemberships: result.replacementMemberships,
      replacementUniqueItems: result.replacementUniqueItems,
      emptyLines: result.emptyLines,
      singleItemLines: result.singleItemLines,
      multiItemLines: result.multiItemLines,
      multiLineItems: result.multiLineItems,
      missingStyleIdentity: result.missingStyleIdentity,
      orphanMemberships: result.orphanMemberships,
    },
    {
      replacementLines: 3,
      replacementMemberships: 3,
      replacementUniqueItems: 2,
      emptyLines: 1,
      singleItemLines: 1,
      multiItemLines: 1,
      multiLineItems: 1,
      missingStyleIdentity: 1,
      orphanMemberships: 1,
    },
  )
})

test('legacy link analysis collapses reciprocal entries into unordered pairs without guessing direction', () => {
  const lineAnalysis = analyzeReplacementLines(
    [
      { id: 'line-ab', styleIdentity: 'Basic' },
      { id: 'line-bc', styleIdentity: 'Basic' },
    ],
    [
      { replacementLineId: 'line-ab', itemId: 'item-a' },
      { replacementLineId: 'line-ab', itemId: 'item-b' },
      { replacementLineId: 'line-bc', itemId: 'item-b' },
      { replacementLineId: 'line-bc', itemId: 'item-c' },
    ],
  )
  const result = analyzeLegacyLinks(
    [
      { id: 'item-a', replacesItemIds: ['item-b', 'item-b'] },
      { id: 'item-b', replacesItemIds: ['item-a', 'item-c'] },
      { id: 'item-c', replacesItemIds: ['item-b', 'item-c', 'missing'] },
    ],
    lineAnalysis.linesByItem,
  )

  assert.deepEqual(result, {
    legacyLinkEntries: 4,
    legacyLinkPairs: 2,
    reciprocalPairs: 2,
    asymmetricLegacyEntries: 0,
    selfLegacyLinks: 1,
    brokenLegacyEntries: 1,
    legacyPairsWithoutSharedLine: 0,
  })
})

test('notion snapshot analysis and baseline comparison expose mismatches', () => {
  const actual = analyzeNotionSnapshot({
    items: [
      { id: 'item-a', replacesItemIds: ['item-b'] },
      { id: 'item-b', replacesItemIds: ['item-a'] },
    ],
    replacementLines: [
      {
        id: 'line-a',
        styleIdentity: 'Basic',
        itemIds: ['item-a', 'item-b'],
      },
    ],
    outfits: [{ id: 'outfit-a' }],
    wearLogs: [{ id: 'log-a' }, { id: 'log-b' }],
  })

  assert.equal(actual.outfits, 1)
  assert.equal(actual.wearLogs, 2)
  assert.equal(actual.legacyLinkEntries, 2)
  assert.equal(actual.legacyLinkPairs, 1)
  assert.equal(actual.reciprocalPairs, 1)
  assert.deepEqual(compareBaseline(actual, { items: 2, legacyLinkPairs: 2 }), [
    { key: 'legacyLinkPairs', expected: 2, actual: 1 },
  ])
})
