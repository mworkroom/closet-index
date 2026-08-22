import type {
  ColorCategory,
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
  colorCategory: string | null
  isColorCategoryDirect: boolean
  reviewStatus: 'ready' | 'needs_review'
  lifecycleStatus: 'active' | 'archived'
  representativeLineId: string | null
  archivedAt: string | null
  semanticColor: string | null
  displayHex: string
  hasMultipleSemanticColors: boolean
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

export interface ReplacementLineColorGroup {
  id: string
  label: string
  displayHex: string
  lines: ReplacementLineOverviewRow[]
}

export interface ReplacementLineOverview {
  groups: ReplacementLineOverviewGroup[]
  colorGroups: ReplacementLineColorGroup[]
  lines: ReplacementLineOverviewRow[]
  archivedLines: ReplacementLineOverviewRow[]
  summary: {
    lineCount: number
    archivedLineCount: number
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

function normalizeColor(value: string) {
  return value.trim().toLocaleLowerCase('ko')
}

const LINE_COLOR_ALIASES = [
  { label: 'Black', aliases: ['Black'] },
  { label: 'Charcoal', aliases: ['Charcoal'] },
  { label: 'Grey', aliases: ['Grey', 'Gray'] },
  { label: 'Silver', aliases: ['Silver'] },
  { label: 'Ivory', aliases: ['White', 'Ivory', 'Cream'] },
  { label: 'Blue', aliases: ['Blue', 'Navy'] },
  { label: 'Light blue', aliases: ['Light blue', 'Denim', 'Demin'] },
  { label: 'Brown', aliases: ['Brown'] },
  { label: 'Beige', aliases: ['Beige'] },
  { label: 'Burgundy', aliases: ['Burgundy'] },
  { label: 'Red', aliases: ['Red'] },
  { label: 'Pink', aliases: ['Pink'] },
  { label: 'Purple', aliases: ['Purple'] },
  { label: 'Lavender', aliases: ['Lavender'] },
  { label: 'Green', aliases: ['Green'] },
  { label: 'Khaki', aliases: ['Khaki'] },
  { label: 'Yellow', aliases: ['Yellow'] },
  { label: 'Orange', aliases: ['Orange'] },
] as const satisfies readonly {
  label: ColorCategory
  aliases: readonly string[]
}[]

function lineColorFromName(lineName: string) {
  const normalizedName = normalizeColor(lineName)
  return LINE_COLOR_ALIASES.find(({ aliases }) =>
    aliases.some((alias) => {
      const escapedAlias = normalizeColor(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|[^a-z0-9])${escapedAlias}([^a-z0-9]|$)`, 'i').test(
        normalizedName,
      )
    }),
  )?.label ?? null
}

function mostFrequent(values: string[], fallback: string) {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return (
    [...counts.entries()].sort((left, right) => {
      const countDifference = right[1] - left[1]
      return countDifference || compareText(left[0], right[0])
    })[0]?.[0] ?? fallback
  )
}

export function buildReplacementLineOverview(
  snapshot: ReplacementLineSnapshot,
  items: Item[],
): ReplacementLineOverview {
  const linesById = new Map(snapshot.lines.map((line) => [line.id, line]))
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const colorsByKey = new Map<
    string,
    { labels: string[]; displayHexes: string[] }
  >()
  const addKnownColor = (labelValue: string | null | undefined, displayHex: string) => {
    const label = labelValue?.trim()
    if (!label) return
    const key = normalizeColor(label)
    const color = colorsByKey.get(key) ?? { labels: [], displayHexes: [] }
    color.labels.push(label)
    color.displayHexes.push(displayHex.toUpperCase())
    colorsByKey.set(key, color)
  }
  for (const item of items) {
    addKnownColor(item.paletteName, item.displayHex)
    addKnownColor(item.semanticColor, item.displayHex)
  }
  const knownColors = [...colorsByKey.entries()]
    .map(([key, color]) => ({
      key,
      label: mostFrequent(color.labels, key),
      displayHex: mostFrequent(color.displayHexes, '#ECEBE6'),
    }))
    .sort((left, right) => right.label.length - left.label.length)
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

  const allLines = snapshot.lines
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
      const memberPaletteColorKeys = new Set(
        resolvedItems
          .map((item) => item.paletteName?.trim())
          .filter((value): value is string => Boolean(value))
          .map(normalizeColor),
      )
      const memberSemanticColorKeys = new Set(
        resolvedItems
          .map((item) => item.semanticColor?.trim())
          .filter((value): value is string => Boolean(value))
          .map(normalizeColor),
      )
      const directColorCategory = line.colorCategory?.trim() || null
      const explicitLineColor = lineColorFromName(line.name)
      const nameNormalized = normalizeColor(line.name)
      const nameColor = knownColors.find(({ label }) =>
        nameNormalized.includes(normalizeColor(label)),
      )
      const memberColorKeys =
        memberPaletteColorKeys.size > 0
          ? memberPaletteColorKeys
          : memberSemanticColorKeys
      const hasMultipleSemanticColors =
        !directColorCategory &&
        !explicitLineColor &&
        !nameColor &&
        memberColorKeys.size > 1
      const semanticColorKey = hasMultipleSemanticColors
        ? null
        : directColorCategory
          ? normalizeColor(directColorCategory)
          : explicitLineColor
            ? normalizeColor(explicitLineColor)
            : (nameColor?.key ?? [...memberColorKeys][0] ?? null)
      const semanticColor = semanticColorKey
        ? knownColors.find((color) => color.key === semanticColorKey) ?? null
        : null
      const displayHex = mostFrequent(
        resolvedItems.map((item) => item.displayHex.toUpperCase()),
        semanticColor?.displayHex ?? '#ECEBE6',
      )

      return {
        id: line.id,
        name: line.name,
        styleIdentity: line.styleIdentity?.trim() || null,
        colorCategory: directColorCategory,
        isColorCategoryDirect: Boolean(directColorCategory),
        reviewStatus: line.reviewStatus,
        lifecycleStatus: line.lifecycleStatus,
        representativeLineId: line.representativeLineId,
        archivedAt: line.archivedAt,
        semanticColor:
          directColorCategory ?? explicitLineColor ?? semanticColor?.label ?? null,
        displayHex,
        hasMultipleSemanticColors,
        membershipCount: itemIds.length,
        activeItems,
        retiredItems,
        newestActiveAcquiredOn:
          activeAcquiredDates.at(-1) ?? null,
        hiddenMembershipCount: itemIds.length - resolvedItems.length,
        hasMultipleLineItem: itemIds.some(
          (itemId) =>
            (lineIdsByItem
              .get(itemId)
              ?.filter(
                (lineId) =>
                  linesById.get(lineId)?.lifecycleStatus === 'active',
              ).length ?? 0) > 1,
        ),
      }
    })
    .sort((left, right) => compareText(left.name, right.name))
  const lines = allLines.filter((line) => line.lifecycleStatus === 'active')
  const archivedLines = allLines.filter(
    (line) => line.lifecycleStatus === 'archived',
  )

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

  const colorGroupMap = new Map<string, ReplacementLineOverviewRow[]>()
  for (const line of lines) {
    const key = line.semanticColor ? normalizeColor(line.semanticColor) : 'unassigned'
    const group = colorGroupMap.get(key) ?? []
    group.push(line)
    colorGroupMap.set(key, group)
  }
  const colorGroups = [...colorGroupMap.entries()]
    .map<ReplacementLineColorGroup>(([colorKey, groupLines]) => {
      const meaningfulHexes = groupLines
        .map((line) => line.displayHex)
        .filter((displayHex) => displayHex !== '#ECEBE6')
      return {
        id: colorKey,
        label: groupLines[0]?.semanticColor ?? '색상 확인 필요',
        displayHex: mostFrequent(meaningfulHexes, '#ECEBE6'),
        lines: groupLines,
      }
    })
    .sort((left, right) => {
      if (left.id === 'unassigned') return 1
      if (right.id === 'unassigned') return -1
      return compareText(left.label, right.label)
    })

  const activeMemberships = [...uniqueMemberships.values()].filter(
    (membership) =>
      linesById.get(membership.lineId)?.lifecycleStatus === 'active',
  )
  const uniqueItemIds = new Set(
    activeMemberships.map((membership) => membership.itemId),
  )
  const resolvedUniqueItems = [...uniqueItemIds]
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is Item => Boolean(item))

  return {
    groups,
    colorGroups,
    lines,
    archivedLines,
    summary: {
      lineCount: lines.length,
      archivedLineCount: archivedLines.length,
      membershipCount: activeMemberships.length,
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
