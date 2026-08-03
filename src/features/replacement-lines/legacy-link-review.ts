import type {
  Item,
  ReplacementLegacyLink,
  ReplacementLegacyLinkDecision,
  ReplacementLineSnapshot,
} from '../../lib/types'

export interface LegacyLinkReviewPair {
  link: ReplacementLegacyLink
  itemA: Item | null
  itemB: Item | null
  sharedLineNames: string[]
  reviewable: boolean
}

export interface LegacyLinkReviewQueue {
  pairs: LegacyLinkReviewPair[]
  pendingPairs: LegacyLinkReviewPair[]
  reviewedPairs: LegacyLinkReviewPair[]
  reviewedCount: number
  hiddenItemPairCount: number
}

export function buildLegacyLinkReviewQueue(
  links: ReplacementLegacyLink[],
  lineSnapshot: ReplacementLineSnapshot,
  items: Item[],
): LegacyLinkReviewQueue {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const linesById = new Map(lineSnapshot.lines.map((line) => [line.id, line]))
  const lineIdsByItem = new Map<string, Set<string>>()

  for (const membership of lineSnapshot.memberships) {
    if (!linesById.has(membership.replacementLineId)) continue
    const lineIds = lineIdsByItem.get(membership.itemId) ?? new Set<string>()
    lineIds.add(membership.replacementLineId)
    lineIdsByItem.set(membership.itemId, lineIds)
  }

  const pairs = links.map<LegacyLinkReviewPair>((link) => {
    const itemA = itemsById.get(link.itemAId) ?? null
    const itemB = itemsById.get(link.itemBId) ?? null
    const itemALines = lineIdsByItem.get(link.itemAId) ?? new Set<string>()
    const itemBLines = lineIdsByItem.get(link.itemBId) ?? new Set<string>()
    const sharedLineNames = [...itemALines]
      .filter((lineId) => itemBLines.has(lineId))
      .map((lineId) => linesById.get(lineId)?.name)
      .filter((name): name is string => Boolean(name))
      .sort((left, right) => left.localeCompare(right, 'ko'))

    return {
      link,
      itemA,
      itemB,
      sharedLineNames,
      reviewable: Boolean(itemA && itemB),
    }
  })

  return {
    pairs,
    pendingPairs: pairs.filter(
      (pair) => pair.link.reviewStatus === 'pending',
    ),
    reviewedPairs: pairs.filter(
      (pair) => pair.link.reviewStatus === 'reviewed',
    ),
    reviewedCount: pairs.filter(
      (pair) => pair.link.reviewStatus === 'reviewed',
    ).length,
    hiddenItemPairCount: pairs.filter((pair) => !pair.reviewable).length,
  }
}

export function describeLegacyLinkDecision(
  decision: ReplacementLegacyLinkDecision,
  itemAName: string,
  itemBName: string,
) {
  switch (decision) {
    case 'a_to_b':
      return `${itemAName} → ${itemBName}`
    case 'b_to_a':
      return `${itemBName} → ${itemAName}`
    case 'parallel':
      return '동등·병렬 후보'
    case 'not_replacement':
      return '대체 관계 아님'
  }
}
