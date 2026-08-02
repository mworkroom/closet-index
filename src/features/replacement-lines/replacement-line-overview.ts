import type {
  Item,
  ReplacementLineSnapshot,
} from '../../lib/types'

export const LEGACY_LINK_BASELINE_COUNT = 49

export interface ReplacementLineItemOverview {
  item: Item
  lineIds: string[]
  lineNames: string[]
}

export interface ReplacementLineOverviewRow {
  id: string
  name: string
  styleIdentity: string | null
  membershipCount: number
  activeItems: ReplacementLineItemOverview[]
  retiredItems: ReplacementLineItemOverview[]
  newestActiveAcquiredOn: string | null
  hiddenMembershipCount: number
  hasMultipleLineItem: boolean
}

export interface ReplacementLineOverviewGroup {
  id: string
  label: string
  lines: ReplacementLineOverviewRow[]
}

export interface ReplacementLineOverview {
  groups: ReplacementLineOverviewGroup[]
  lines: ReplacementLineOverviewRow[]
  summary: {
    lineCount: number
    membershipCount: number
    uniqueItemCount: number
    activeItemCount: number
    retiredItemCount: number
    emptyLineCount: number
    singleItemLineCount: number
    multipleLineItemCount: number
    hiddenMembershipCount: number
  }
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'ko', { sensitivity: 'base' })
}

export function buildReplacementLineOverview(
  snapshot: ReplacementLineSnapshot,
  items: Item[],
): ReplacementLineOverview {
  const linesById = new Map(snapshot.lines.map((line) => [line.id, line]))
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const uniqueMemberships = new Map<string, { lineId: string; itemId: string }>()

  for (const membership of snapshot.memberships) {
    if (!linesById.has(membership.replacementLineId)) continue
    uniqueMemberships.set(
      `${membership.replacementLineId}\n${membership.itemId}`,
      {
        lineId: membership.replacementLineId,
        itemId: membership.itemId,
      },
    )
  }

  const membershipsByLine = new Map<string, string[]>()
  const lineIdsByItem = new Map<string, string[]>()
  for (const membership of uniqueMemberships.values()) {
    const lineItems = membershipsByLine.get(membership.lineId) ?? []
    lineItems.push(membership.itemId)
    membershipsByLine.set(membership.lineId, lineItems)

    const itemLines = lineIdsByItem.get(membership.itemId) ?? []
    itemLines.push(membership.lineId)
    lineIdsByItem.set(membership.itemId, itemLines)
  }

  const toItemOverview = (item: Item): ReplacementLineItemOverview => {
    const lineIds = [...(lineIdsByItem.get(item.id) ?? [])]
    return {
      item,
      lineIds,
      lineNames: lineIds
        .map((lineId) => linesById.get(lineId)?.name)
        .filter((name): name is string => Boolean(name))
        .sort(compareText),
    }
  }

  const lines = snapshot.lines
    .map<ReplacementLineOverviewRow>((line) => {
      const itemIds = membershipsByLine.get(line.id) ?? []
      const resolvedItems = itemIds
        .map((itemId) => itemsById.get(itemId))
        .filter((item): item is Item => Boolean(item))
      const activeItems = resolvedItems
        .filter((item) => !item.retired)
        .map(toItemOverview)
        .sort((left, right) => compareText(left.item.name, right.item.name))
      const retiredItems = resolvedItems
        .filter((item) => item.retired)
        .map(toItemOverview)
        .sort((left, right) => compareText(left.item.name, right.item.name))
      const activeAcquiredDates = activeItems
        .map(({ item }) => item.acquiredOn)
        .filter((date): date is string => Boolean(date))
        .sort()

      return {
        id: line.id,
        name: line.name,
        styleIdentity: line.styleIdentity?.trim() || null,
        membershipCount: itemIds.length,
        activeItems,
        retiredItems,
        newestActiveAcquiredOn:
          activeAcquiredDates.at(-1) ?? null,
        hiddenMembershipCount: itemIds.length - resolvedItems.length,
        hasMultipleLineItem: itemIds.some(
          (itemId) => (lineIdsByItem.get(itemId)?.length ?? 0) > 1,
        ),
      }
    })
    .sort((left, right) => compareText(left.name, right.name))

  const groupMap = new Map<string, ReplacementLineOverviewRow[]>()
  for (const line of lines) {
    const key = line.styleIdentity ?? ''
    const group = groupMap.get(key) ?? []
    group.push(line)
    groupMap.set(key, group)
  }
  const groups = [...groupMap.entries()]
    .map<ReplacementLineOverviewGroup>(([styleIdentity, groupLines]) => ({
      id: styleIdentity || 'unassigned',
      label: styleIdentity || 'Style Identity 미지정',
      lines: groupLines,
    }))
    .sort((left, right) => {
      if (left.id === 'unassigned') return 1
      if (right.id === 'unassigned') return -1
      return compareText(left.label, right.label)
    })

  const uniqueItemIds = new Set(
    [...uniqueMemberships.values()].map((membership) => membership.itemId),
  )
  const resolvedUniqueItems = [...uniqueItemIds]
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is Item => Boolean(item))

  return {
    groups,
    lines,
    summary: {
      lineCount: lines.length,
      membershipCount: uniqueMemberships.size,
      uniqueItemCount: uniqueItemIds.size,
      activeItemCount: resolvedUniqueItems.filter((item) => !item.retired).length,
      retiredItemCount: resolvedUniqueItems.filter((item) => item.retired).length,
      emptyLineCount: lines.filter((line) => line.membershipCount === 0).length,
      singleItemLineCount: lines.filter((line) => line.membershipCount === 1)
        .length,
      multipleLineItemCount: [...lineIdsByItem.values()].filter(
        (lineIds) => lineIds.length > 1,
      ).length,
      hiddenMembershipCount: lines.reduce(
        (total, line) => total + line.hiddenMembershipCount,
        0,
      ),
    },
  }
}
