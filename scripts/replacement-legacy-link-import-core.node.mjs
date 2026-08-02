import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplacementLegacyLinkImportPlan } from './replacement-legacy-link-import-core.mjs'

test('builds one canonical row from reciprocal Notion relation entries', () => {
  const plan = buildReplacementLegacyLinkImportPlan(
    {
      items: [
        { id: '10000000-0000-0000-0000-000000000001', replacesItemIds: ['20000000-0000-0000-0000-000000000001'] },
        { id: '20000000-0000-0000-0000-000000000001', replacesItemIds: ['10000000-0000-0000-0000-000000000001'] },
      ],
    },
    '30000000-0000-0000-0000-000000000001',
    1,
  )

  assert.deepEqual(plan.blockers, [])
  assert.deepEqual(plan.counts, {
    directedEntries: 2,
    canonicalPairs: 1,
    reciprocalPairs: 1,
  })
  assert.deepEqual(plan.rows[0], {
    id: plan.rows[0].id,
    workspace_id: '30000000-0000-0000-0000-000000000001',
    item_a_id: '10000000-0000-0000-0000-000000000001',
    item_b_id: '20000000-0000-0000-0000-000000000001',
    source: 'notion_replaces',
    source_item_a_notion_page_id: '10000000-0000-0000-0000-000000000001',
    source_item_b_notion_page_id: '20000000-0000-0000-0000-000000000001',
  })
})

test('blocks asymmetric, self, broken, and unexpected pair counts', () => {
  const plan = buildReplacementLegacyLinkImportPlan(
    {
      items: [
        {
          id: 'item-a',
          replacesItemIds: ['item-a', 'item-b', 'missing-item'],
        },
        { id: 'item-b', replacesItemIds: [] },
      ],
    },
    'workspace',
    2,
  )

  assert.deepEqual(plan.blockers, [
    'legacy pair count: expected 2, actual 1',
    'non-reciprocal pairs: 1',
    'self links: 1',
    'broken entries: 1',
  ])
})
