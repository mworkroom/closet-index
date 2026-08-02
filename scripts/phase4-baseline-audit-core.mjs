export const PHASE4_EXPECTED_BASELINE = {
  production: {
    items: 451,
    outfits: 508,
    notionBackedOutfits: 505,
    appCreatedOutfits: 3,
    wearLogs: 783,
    notionBackedWearLogs: 782,
    appCreatedWearLogs: 1,
    acquiredKnown: 442,
    acquiredUnknown: 9,
    replacementLines: 53,
    replacementMemberships: 165,
    replacementUniqueItems: 163,
    emptyLines: 1,
    singleItemLines: 10,
    multiItemLines: 42,
    multiLineItems: 2,
  },
  notion: {
    items: 451,
    outfits: 507,
    wearLogs: 783,
    replacementLines: 53,
    replacementMemberships: 165,
    replacementUniqueItems: 163,
    emptyLines: 1,
    singleItemLines: 10,
    multiItemLines: 42,
    multiLineItems: 2,
    legacyLinkEntries: 98,
    legacyLinkPairs: 49,
    asymmetricLegacyEntries: 0,
    selfLegacyLinks: 0,
    legacyPairsWithoutSharedLine: 0,
  },
  outfitOrigin: {
    notionOutfitsMissingInProduction: 2,
    productionNotionOutfitsMissingInSnapshot: 0,
  },
  wearLogOrigin: {
    notionWearLogsMissingInProduction: 1,
    productionNotionWearLogsMissingInSnapshot: 0,
  },
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function pairKey(left, right) {
  return [left, right].sort((a, b) => a.localeCompare(b)).join('|')
}

export function collectCanonicalLegacyLinkPairs(items) {
  const knownItemIds = new Set(items.map((item) => item.id))
  const directedEdges = new Set()
  const pairDirections = new Map()
  let selfLegacyLinks = 0
  let brokenLegacyEntries = 0

  for (const item of items) {
    for (const relatedItemId of unique(item.replacesItemIds)) {
      if (relatedItemId === item.id) {
        selfLegacyLinks += 1
        continue
      }
      if (!knownItemIds.has(relatedItemId)) {
        brokenLegacyEntries += 1
        continue
      }
      const directedKey = `${item.id}>${relatedItemId}`
      if (directedEdges.has(directedKey)) continue
      directedEdges.add(directedKey)
      const key = pairKey(item.id, relatedItemId)
      const directions = pairDirections.get(key) ?? new Set()
      directions.add(directedKey)
      pairDirections.set(key, directions)
    }
  }

  const pairs = [...pairDirections.entries()]
    .map(([key, directions]) => {
      const [itemAId, itemBId] = key.split('|')
      return { itemAId, itemBId, directionCount: directions.size }
    })
    .sort((left, right) =>
      pairKey(left.itemAId, left.itemBId).localeCompare(
        pairKey(right.itemAId, right.itemBId),
      ),
    )

  return {
    pairs,
    directedEntryCount: directedEdges.size,
    reciprocalPairCount: pairs.filter((pair) => pair.directionCount === 2)
      .length,
    asymmetricEntryCount: pairs
      .filter((pair) => pair.directionCount !== 2)
      .reduce((total, pair) => total + pair.directionCount, 0),
    selfLegacyLinks,
    brokenLegacyEntries,
  }
}

export function analyzeReplacementLines(lines, memberships) {
  const lineIds = new Set(lines.map((line) => line.id))
  const membershipsByLine = new Map(lines.map((line) => [line.id, new Set()]))
  const linesByItem = new Map()
  let orphanMemberships = 0

  for (const membership of memberships) {
    if (!lineIds.has(membership.replacementLineId)) {
      orphanMemberships += 1
      continue
    }
    membershipsByLine
      .get(membership.replacementLineId)
      .add(membership.itemId)
    const itemLines = linesByItem.get(membership.itemId) ?? new Set()
    itemLines.add(membership.replacementLineId)
    linesByItem.set(membership.itemId, itemLines)
  }

  const membershipCounts = [...membershipsByLine.values()].map(
    (itemIds) => itemIds.size,
  )
  return {
    replacementLines: lines.length,
    replacementMemberships: membershipCounts.reduce(
      (total, count) => total + count,
      0,
    ),
    replacementUniqueItems: linesByItem.size,
    emptyLines: membershipCounts.filter((count) => count === 0).length,
    singleItemLines: membershipCounts.filter((count) => count === 1).length,
    multiItemLines: membershipCounts.filter((count) => count >= 2).length,
    multiLineItems: [...linesByItem.values()].filter(
      (lineIdsForItem) => lineIdsForItem.size > 1,
    ).length,
    missingStyleIdentity: lines.filter((line) => !line.styleIdentity).length,
    orphanMemberships,
    linesByItem,
  }
}

export function analyzeLegacyLinks(items, linesByItem = new Map()) {
  const collected = collectCanonicalLegacyLinkPairs(items)

  let legacyPairsWithoutSharedLine = 0
  for (const pair of collected.pairs) {
    const leftLines = linesByItem.get(pair.itemAId) ?? new Set()
    const rightLines = linesByItem.get(pair.itemBId) ?? new Set()
    const sharesLine = [...leftLines].some((lineId) => rightLines.has(lineId))
    if (!sharesLine) legacyPairsWithoutSharedLine += 1
  }

  return {
    legacyLinkEntries: collected.directedEntryCount,
    legacyLinkPairs: collected.pairs.length,
    reciprocalPairs: collected.reciprocalPairCount,
    asymmetricLegacyEntries: collected.asymmetricEntryCount,
    selfLegacyLinks: collected.selfLegacyLinks,
    brokenLegacyEntries: collected.brokenLegacyEntries,
    legacyPairsWithoutSharedLine,
  }
}

export function analyzeNotionSnapshot(snapshot) {
  const lines = snapshot.replacementLines ?? []
  const memberships = lines.flatMap((line) =>
    unique(line.itemIds).map((itemId) => ({
      replacementLineId: line.id,
      itemId,
    })),
  )
  const lineAnalysis = analyzeReplacementLines(lines, memberships)
  const legacyAnalysis = analyzeLegacyLinks(
    snapshot.items ?? [],
    lineAnalysis.linesByItem,
  )

  return {
    items: snapshot.items?.length ?? 0,
    outfits: snapshot.outfits?.length ?? 0,
    wearLogs: snapshot.wearLogs?.length ?? 0,
    replacementLines: lineAnalysis.replacementLines,
    replacementMemberships: lineAnalysis.replacementMemberships,
    replacementUniqueItems: lineAnalysis.replacementUniqueItems,
    emptyLines: lineAnalysis.emptyLines,
    singleItemLines: lineAnalysis.singleItemLines,
    multiItemLines: lineAnalysis.multiItemLines,
    multiLineItems: lineAnalysis.multiLineItems,
    missingStyleIdentity: lineAnalysis.missingStyleIdentity,
    orphanMemberships: lineAnalysis.orphanMemberships,
    ...legacyAnalysis,
  }
}

export function compareBaseline(actual, expected) {
  const mismatches = []
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[key]
    if (actualValue !== expectedValue) {
      mismatches.push({ key, expected: expectedValue, actual: actualValue })
    }
  }
  return mismatches
}
