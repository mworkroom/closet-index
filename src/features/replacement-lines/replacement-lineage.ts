import type {
  Item,
  ReplacementLineEdge,
  ReplacementLineRecord,
  ReplacementLineSnapshot,
  ReplacementLineStart,
} from '../../lib/types'

export interface ReplacementLineageNode {
  item: Item
  depth: number
  incomingEdges: ReplacementLineEdge[]
  outgoingEdges: ReplacementLineEdge[]
  predecessors: Item[]
  reason: string | null
  branchName: string | null
  isExplicitStart: boolean
}

export interface ReplacementLineageGroup {
  id: string
  depth: number
  label: string
  kind: 'root' | 'continuation' | 'branch' | 'merge'
  nodes: ReplacementLineageNode[]
  predecessors: Item[]
}

export interface ReplacementLineageGeneration {
  depth: number
  groups: ReplacementLineageGroup[]
}

export interface ReplacementLineage {
  line: ReplacementLineRecord
  members: Item[]
  connectedMembers: Item[]
  unconnectedMembers: Item[]
  generations: ReplacementLineageGeneration[]
  activeCount: number
  retiredCount: number
  confirmedEdgeCount: number
  explicitStartCount: number
  needsReviewEdgeCount: number
  invalidEdgeCount: number
  hasBranch: boolean
  hasMerge: boolean
  cyclic: boolean
}

const itemCollator = new Intl.Collator('ko-KR')

function compareItems(a: Item, b: Item) {
  if (a.acquiredOn && b.acquiredOn && a.acquiredOn !== b.acquiredOn) {
    return a.acquiredOn.localeCompare(b.acquiredOn)
  }
  if (a.acquiredOn && !b.acquiredOn) return -1
  if (!a.acquiredOn && b.acquiredOn) return 1
  return itemCollator.compare(a.name, b.name)
}

function uniqueText(values: Array<string | null>) {
  const result = [...new Set(values.map((value) => value?.trim()).filter(Boolean))]
  return result.length > 0 ? result.join(' · ') : null
}

function generationLabel(
  depth: number,
  nodes: ReplacementLineageNode[],
  predecessors: Item[],
  rootCount: number,
) {
  if (depth === 0) {
    return nodes.length === 1 ? '시작 아이템' : `시작 아이템 ${nodes.length}`
  }
  if (depth === 1 && rootCount === 1 && predecessors.length === 1) {
    return nodes.length === 1
      ? '시작 아이템에서 이어짐'
      : `시작 아이템에서 이어진 후보 ${nodes.length}`
  }
  if (predecessors.length === 1) {
    return `${predecessors[0].name}에서 이어짐`
  }
  if (predecessors.length > 1) {
    return `${predecessors.map((item) => item.name).join(' · ')}에서 합류`
  }
  return `이어진 아이템 ${nodes.length}`
}

export function buildReplacementLineage(
  lineId: string,
  snapshot: ReplacementLineSnapshot,
  edges: ReplacementLineEdge[],
  items: Item[],
  starts: ReplacementLineStart[] = [],
): ReplacementLineage | null {
  const line = snapshot.lines.find((entry) => entry.id === lineId)
  if (!line) return null

  const itemById = new Map(items.map((item) => [item.id, item]))
  const memberIds = new Set(
    snapshot.memberships
      .filter((membership) => membership.replacementLineId === lineId)
      .map((membership) => membership.itemId),
  )
  const members = [...memberIds]
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is Item => Boolean(item))
    .sort(compareItems)

  const lineEdges = edges.filter((edge) => edge.replacementLineId === lineId)
  const needsReviewEdgeCount = lineEdges.filter(
    (edge) => edge.status === 'needs_review',
  ).length
  const candidateEdges = lineEdges.filter((edge) => edge.status === 'confirmed')
  const confirmedEdges = candidateEdges.filter(
    (edge) =>
      edge.predecessorItemId !== edge.successorItemId &&
      memberIds.has(edge.predecessorItemId) &&
      memberIds.has(edge.successorItemId) &&
      itemById.has(edge.predecessorItemId) &&
      itemById.has(edge.successorItemId),
  )

  const nodeIds = new Set<string>()
  const explicitStartIds = new Set(
    starts
      .filter(
        (start) =>
          start.replacementLineId === lineId &&
          memberIds.has(start.itemId) &&
          itemById.has(start.itemId),
      )
      .map((start) => start.itemId),
  )
  explicitStartIds.forEach((itemId) => nodeIds.add(itemId))
  const incoming = new Map<string, ReplacementLineEdge[]>()
  const outgoing = new Map<string, ReplacementLineEdge[]>()
  for (const edge of confirmedEdges) {
    nodeIds.add(edge.predecessorItemId)
    nodeIds.add(edge.successorItemId)
    incoming.set(edge.successorItemId, [
      ...(incoming.get(edge.successorItemId) ?? []),
      edge,
    ])
    outgoing.set(edge.predecessorItemId, [
      ...(outgoing.get(edge.predecessorItemId) ?? []),
      edge,
    ])
  }

  const indegree = new Map(
    [...nodeIds].map((itemId) => [itemId, incoming.get(itemId)?.length ?? 0]),
  )
  const depths = new Map<string, number>()
  const roots = [...nodeIds]
    .filter((itemId) => indegree.get(itemId) === 0)
    .sort((a, b) => compareItems(itemById.get(a)!, itemById.get(b)!))
  const queue = [...roots]
  roots.forEach((itemId) => depths.set(itemId, 0))
  let processedCount = 0

  while (queue.length > 0) {
    const itemId = queue.shift()!
    processedCount += 1
    const currentDepth = depths.get(itemId) ?? 0
    for (const edge of outgoing.get(itemId) ?? []) {
      const nextDepth = Math.max(
        depths.get(edge.successorItemId) ?? 0,
        currentDepth + 1,
      )
      depths.set(edge.successorItemId, nextDepth)
      const nextIndegree = (indegree.get(edge.successorItemId) ?? 0) - 1
      indegree.set(edge.successorItemId, nextIndegree)
      if (nextIndegree === 0) queue.push(edge.successorItemId)
    }
  }

  const cyclic = processedCount !== nodeIds.size
  const nodes = cyclic
    ? []
    : [...nodeIds].map((itemId): ReplacementLineageNode => {
        const incomingEdges = incoming.get(itemId) ?? []
        const outgoingEdges = outgoing.get(itemId) ?? []
        return {
          item: itemById.get(itemId)!,
          depth: depths.get(itemId) ?? 0,
          incomingEdges,
          outgoingEdges,
          predecessors: incomingEdges
            .map((edge) => itemById.get(edge.predecessorItemId))
            .filter((item): item is Item => Boolean(item))
            .sort(compareItems),
          reason: uniqueText(incomingEdges.map((edge) => edge.decisionReason)),
          branchName: uniqueText(incomingEdges.map((edge) => edge.branchName)),
          isExplicitStart: explicitStartIds.has(itemId),
        }
      })

  const nodesByDepth = new Map<number, ReplacementLineageNode[]>()
  for (const node of nodes) {
    nodesByDepth.set(node.depth, [...(nodesByDepth.get(node.depth) ?? []), node])
  }

  const generations = [...nodesByDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, generationNodes]): ReplacementLineageGeneration => {
      if (depth === 0) {
        const sortedNodes = generationNodes.sort((a, b) =>
          compareItems(a.item, b.item),
        )
        return {
          depth,
          groups: [
            {
              id: 'roots',
              depth,
              label: generationLabel(depth, sortedNodes, [], roots.length),
              kind: 'root',
              nodes: sortedNodes,
              predecessors: [],
            },
          ],
        }
      }

      const grouped = new Map<string, ReplacementLineageNode[]>()
      for (const node of generationNodes) {
        const key = node.predecessors
          .map((item) => item.id)
          .sort()
          .join(':') || `unparented:${node.item.id}`
        grouped.set(key, [...(grouped.get(key) ?? []), node])
      }

      const groups = [...grouped.entries()]
        .map(([id, groupedNodes]): ReplacementLineageGroup => {
          const sortedNodes = groupedNodes.sort((a, b) =>
            compareItems(a.item, b.item),
          )
          const predecessors = sortedNodes[0]?.predecessors ?? []
          return {
            id,
            depth,
            label: generationLabel(
              depth,
              sortedNodes,
              predecessors,
              roots.length,
            ),
            kind:
              predecessors.length > 1
                ? 'merge'
                : sortedNodes.length > 1
                  ? 'branch'
                  : 'continuation',
            nodes: sortedNodes,
            predecessors,
          }
        })
        .sort((a, b) => itemCollator.compare(a.label, b.label))

      return { depth, groups }
    })

  const connectedMembers = members.filter((item) => nodeIds.has(item.id))
  const unconnectedMembers = members.filter((item) => !nodeIds.has(item.id))

  return {
    line,
    members,
    connectedMembers,
    unconnectedMembers,
    generations,
    activeCount: members.filter((item) => !item.retired).length,
    retiredCount: members.filter((item) => item.retired).length,
    confirmedEdgeCount: confirmedEdges.length,
    explicitStartCount: explicitStartIds.size,
    needsReviewEdgeCount,
    invalidEdgeCount: candidateEdges.length - confirmedEdges.length,
    hasBranch: [...outgoing.values()].some((entries) => entries.length > 1),
    hasMerge: [...incoming.values()].some((entries) => entries.length > 1),
    cyclic,
  }
}
