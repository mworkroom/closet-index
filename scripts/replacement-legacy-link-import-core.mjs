import { createHash } from 'node:crypto'
import { collectCanonicalLegacyLinkPairs } from './phase4-baseline-audit-core.mjs'

function stableUuid(value) {
  const bytes = Buffer.from(
    createHash('sha256').update(value).digest().subarray(0, 16),
  )
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

export function buildReplacementLegacyLinkImportPlan(
  snapshot,
  workspaceId,
  expectedPairCount = 49,
) {
  const collected = collectCanonicalLegacyLinkPairs(snapshot.items ?? [])
  const blockers = []

  if (collected.pairs.length !== expectedPairCount) {
    blockers.push(
      `legacy pair count: expected ${expectedPairCount}, actual ${collected.pairs.length}`,
    )
  }
  if (collected.reciprocalPairCount !== collected.pairs.length) {
    blockers.push(
      `non-reciprocal pairs: ${collected.pairs.length - collected.reciprocalPairCount}`,
    )
  }
  if (collected.selfLegacyLinks > 0) {
    blockers.push(`self links: ${collected.selfLegacyLinks}`)
  }
  if (collected.brokenLegacyEntries > 0) {
    blockers.push(`broken entries: ${collected.brokenLegacyEntries}`)
  }

  const rows = collected.pairs.map((pair) => ({
    id: stableUuid(
      `closet-index:${workspaceId}:legacy-link:${pair.itemAId}:${pair.itemBId}`,
    ),
    workspace_id: workspaceId,
    item_a_id: pair.itemAId,
    item_b_id: pair.itemBId,
    source: 'notion_replaces',
    source_item_a_notion_page_id: pair.itemAId,
    source_item_b_notion_page_id: pair.itemBId,
  }))

  return {
    blockers,
    counts: {
      directedEntries: collected.directedEntryCount,
      canonicalPairs: collected.pairs.length,
      reciprocalPairs: collected.reciprocalPairCount,
    },
    rows,
  }
}
