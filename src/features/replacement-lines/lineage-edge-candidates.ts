import type {
  Item,
  ReplacementLegacyLink,
  ReplacementLineRecord,
  ReplacementLineSnapshot,
} from '../../lib/types'

export type LineageEdgeCandidateStatus =
  | 'ready'
  | 'needs_line_choice'
  | 'excluded'
  | 'pending'
  | 'invalid'

export interface LineageEdgeCandidate {
  link: ReplacementLegacyLink
  itemA: Item | null
  itemB: Item | null
  predecessor: Item | null
  successor: Item | null
  sharedLines: ReplacementLineRecord[]
  status: LineageEdgeCandidateStatus
  note: string
}

export interface LineageGraphPoint {
  line: ReplacementLineRecord
  item: Item
  connectedItems: Item[]
}

export interface LineageEdgeCandidatePreview {
  candidates: LineageEdgeCandidate[]
  readyCandidates: LineageEdgeCandidate[]
  needsLineChoiceCandidates: LineageEdgeCandidate[]
  excludedCandidates: LineageEdgeCandidate[]
  pendingCandidates: LineageEdgeCandidate[]
  invalidCandidates: LineageEdgeCandidate[]
  branchPoints: LineageGraphPoint[]
  mergePoints: LineageGraphPoint[]
  summary: {
    total: number
    directional: number
    ready: number
    needsLineChoice: number
    excluded: number
    pending: number
    invalid: number
    selfEdges: number
    duplicateEdges: number
    cycleLines: number
    branchPoints: number
    mergePoints: number
  }
}

function candidateStatus(
  link: ReplacementLegacyLink,
  itemA: Item | null,
  itemB: Item | null,
  sharedLines: ReplacementLineRecord[],
): Pick<LineageEdgeCandidate, 'status' | 'note'> {
  if (!itemA || !itemB) {
    return {
      status: 'invalid',
      note: '현재 workspace에서 두 Item을 모두 확인할 수 없습니다.',
    }
  }
  if (link.reviewStatus !== 'reviewed' || !link.reviewDecision) {
    return { status: 'pending', note: 'Legacy Link 검토가 아직 끝나지 않았습니다.' }
  }
  if (link.reviewDecision === 'parallel') {
    return { status: 'excluded', note: '동등·병렬 후보로 검토했습니다.' }
  }
  if (link.reviewDecision === 'not_replacement') {
    return { status: 'excluded', note: '대체 관계가 아닌 것으로 검토했습니다.' }
  }
  if (sharedLines.length === 0) {
    return {
      status: 'invalid',
      note: '두 Item이 함께 속한 Replacement Line이 없습니다.',
    }
  }
  if (sharedLines.length > 1) {
    return {
      status: 'needs_line_choice',
      note: '두 Item이 함께 속한 Line 중 edge를 둘 Line을 선택해야 합니다.',
    }
  }
  return { status: 'ready', note: '한 개의 공통 Line에 방향 후보를 만들 수 있습니다.' }
}

function hasCycle(edges: Array<{ predecessorId: string; successorId: string }>) {
  const successorsByItem = new Map<string, Set<string>>()
  const nodes = new Set<string>()
  for (const edge of edges) {
    nodes.add(edge.predecessorId)
    nodes.add(edge.successorId)
    const successors = successorsByItem.get(edge.predecessorId) ?? new Set<string>()
    successors.add(edge.successorId)
    successorsByItem.set(edge.predecessorId, successors)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (itemId: string): boolean => {
    if (visiting.has(itemId)) return true
    if (visited.has(itemId)) return false
    visiting.add(itemId)
    for (const successorId of successorsByItem.get(itemId) ?? []) {
      if (visit(successorId)) return true
    }
    visiting.delete(itemId)
    visited.add(itemId)
    return false
  }

  return [...nodes].some(visit)
}

export function buildLineageEdgeCandidatePreview(
  links: ReplacementLegacyLink[],
  lineSnapshot: ReplacementLineSnapshot,
  items: Item[],
): LineageEdgeCandidatePreview {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const linesById = new Map(lineSnapshot.lines.map((line) => [line.id, line]))
  const lineIdsByItem = new Map<string, Set<string>>()

  for (const membership of lineSnapshot.memberships) {
    if (!linesById.has(membership.replacementLineId)) continue
    const lineIds = lineIdsByItem.get(membership.itemId) ?? new Set<string>()
    lineIds.add(membership.replacementLineId)
    lineIdsByItem.set(membership.itemId, lineIds)
  }

  const candidates = links.map<LineageEdgeCandidate>((link) => {
    const itemA = itemsById.get(link.itemAId) ?? null
    const itemB = itemsById.get(link.itemBId) ?? null
    const itemALines = lineIdsByItem.get(link.itemAId) ?? new Set<string>()
    const itemBLines = lineIdsByItem.get(link.itemBId) ?? new Set<string>()
    const sharedLines = [...itemALines]
      .filter((lineId) => itemBLines.has(lineId))
      .map((lineId) => linesById.get(lineId))
      .filter((line): line is ReplacementLineRecord => Boolean(line))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
    const state = candidateStatus(link, itemA, itemB, sharedLines)
    const predecessor =
      link.reviewDecision === 'a_to_b'
        ? itemA
        : link.reviewDecision === 'b_to_a'
          ? itemB
          : null
    const successor =
      link.reviewDecision === 'a_to_b'
        ? itemB
        : link.reviewDecision === 'b_to_a'
          ? itemA
          : null

    return {
      link,
      itemA,
      itemB,
      predecessor,
      successor,
      sharedLines,
      ...state,
    }
  })

  const readyCandidates = candidates.filter((candidate) => candidate.status === 'ready')
  const needsLineChoiceCandidates = candidates.filter(
    (candidate) => candidate.status === 'needs_line_choice',
  )
  const excludedCandidates = candidates.filter(
    (candidate) => candidate.status === 'excluded',
  )
  const pendingCandidates = candidates.filter((candidate) => candidate.status === 'pending')
  const invalidCandidates = candidates.filter((candidate) => candidate.status === 'invalid')
  const edgeKeys = new Set<string>()
  let duplicateEdges = 0
  let selfEdges = 0
  const graphByLine = new Map<
    string,
    Array<{ predecessorId: string; successorId: string }>
  >()

  for (const candidate of readyCandidates) {
    const line = candidate.sharedLines[0]
    const predecessor = candidate.predecessor
    const successor = candidate.successor
    if (!line || !predecessor || !successor) continue
    if (predecessor.id === successor.id) selfEdges += 1
    const key = `${line.id}:${predecessor.id}:${successor.id}`
    if (edgeKeys.has(key)) duplicateEdges += 1
    edgeKeys.add(key)
    const edges = graphByLine.get(line.id) ?? []
    edges.push({ predecessorId: predecessor.id, successorId: successor.id })
    graphByLine.set(line.id, edges)
  }

  const branchPoints: LineageGraphPoint[] = []
  const mergePoints: LineageGraphPoint[] = []
  let cycleLines = 0
  for (const [lineId, edges] of graphByLine) {
    const line = linesById.get(lineId)
    if (!line) continue
    if (hasCycle(edges)) cycleLines += 1
    const successorsByItem = new Map<string, Set<string>>()
    const predecessorsByItem = new Map<string, Set<string>>()
    for (const edge of edges) {
      const successors = successorsByItem.get(edge.predecessorId) ?? new Set<string>()
      successors.add(edge.successorId)
      successorsByItem.set(edge.predecessorId, successors)
      const predecessors = predecessorsByItem.get(edge.successorId) ?? new Set<string>()
      predecessors.add(edge.predecessorId)
      predecessorsByItem.set(edge.successorId, predecessors)
    }
    for (const [itemId, successorIds] of successorsByItem) {
      const item = itemsById.get(itemId)
      const connectedItems = [...successorIds]
        .map((successorId) => itemsById.get(successorId))
        .filter((connected): connected is Item => Boolean(connected))
      if (item && connectedItems.length > 1) branchPoints.push({ line, item, connectedItems })
    }
    for (const [itemId, predecessorIds] of predecessorsByItem) {
      const item = itemsById.get(itemId)
      const connectedItems = [...predecessorIds]
        .map((predecessorId) => itemsById.get(predecessorId))
        .filter((connected): connected is Item => Boolean(connected))
      if (item && connectedItems.length > 1) mergePoints.push({ line, item, connectedItems })
    }
  }

  return {
    candidates,
    readyCandidates,
    needsLineChoiceCandidates,
    excludedCandidates,
    pendingCandidates,
    invalidCandidates,
    branchPoints,
    mergePoints,
    summary: {
      total: candidates.length,
      directional: readyCandidates.length + needsLineChoiceCandidates.length,
      ready: readyCandidates.length,
      needsLineChoice: needsLineChoiceCandidates.length,
      excluded: excludedCandidates.length,
      pending: pendingCandidates.length,
      invalid: invalidCandidates.length,
      selfEdges,
      duplicateEdges,
      cycleLines,
      branchPoints: branchPoints.length,
      mergePoints: mergePoints.length,
    },
  }
}
