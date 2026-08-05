import type {
  ReplacementLegacyLink,
  ReplacementLegacyLinkReviewInput,
  ReplacementLineArchiveInput,
  ReplacementLineColorUpdateInput,
  ReplacementLineCreateInput,
  ReplacementLineDeleteInput,
  ReplacementLineDetailsUpdateInput,
  ReplacementLineEdge,
  ReplacementLineEdgeConfirmationInput,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineEdgeDisconnectInput,
  ReplacementLineItemAddInput,
  ReplacementLineItemMoveInput,
  ReplacementLineItemRemoveInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineMergeInput,
  ReplacementLineRecord,
  ReplacementLineReviewInput,
  ReplacementLineSnapshot,
  ReplacementLineStart,
} from '../../lib/types'
import {
  normalizeReplacementLineDecisionReason,
  REPLACEMENT_LINE_DECISION_REASONS,
} from '../../lib/types'
import type { ReplacementLineRepository } from '../replacement-line-repository'

const LEGACY_LINK_REVIEW_STORAGE_KEY =
  'closet-index-demo-legacy-link-reviews:v1'
const LINEAGE_EDGE_STORAGE_KEY = 'closet-index-demo-lineage-edges:v1'
const LINEAGE_START_STORAGE_KEY = 'closet-index-demo-lineage-starts:v1'
const REPLACEMENT_LINE_STORAGE_KEY = 'closet-index-demo-replacement-lines:v1'

const demoReplacementLineSnapshot: ReplacementLineSnapshot = {
  lines: [
    {
      id: 'line-soft-layer',
      name: 'Soft Layer',
      styleIdentity: 'Soft Structure',
      colorCategory: null,
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    {
      id: 'line-everyday-shoes',
      name: 'Everyday Shoes',
      styleIdentity: 'Daily Uniform',
      colorCategory: null,
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    {
      id: 'line-blue-layer',
      name: 'Blue Layer',
      styleIdentity: 'Daily Uniform',
      colorCategory: 'Blue',
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    {
      id: 'line-navy-tee',
      name: 'Navy Tee',
      styleIdentity: 'Daily Uniform',
      colorCategory: 'Navy',
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    {
      id: 'line-future-dress',
      name: 'Future Black Dress',
      styleIdentity: null,
      colorCategory: 'Black',
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
  ],
  memberships: [
    { replacementLineId: 'line-soft-layer', itemId: 'item-cardigan' },
    { replacementLineId: 'line-soft-layer', itemId: 'item-knit' },
    { replacementLineId: 'line-everyday-shoes', itemId: 'item-shoes' },
    { replacementLineId: 'line-everyday-shoes', itemId: 'item-loafers' },
    { replacementLineId: 'line-blue-layer', itemId: 'item-cardigan' },
    { replacementLineId: 'line-blue-layer', itemId: 'item-knit' },
    { replacementLineId: 'line-navy-tee', itemId: 'item-tee' },
  ],
}

function readDemoReplacementLineSnapshot(): ReplacementLineSnapshot {
  try {
    const stored = window.localStorage.getItem(REPLACEMENT_LINE_STORAGE_KEY)
    const snapshot = stored
      ? (JSON.parse(stored) as ReplacementLineSnapshot)
      : structuredClone(demoReplacementLineSnapshot)
    return {
      ...snapshot,
      lines: snapshot.lines.map((line) => ({
        ...line,
        colorCategory: line.colorCategory ?? null,
        lifecycleStatus: line.lifecycleStatus ?? 'active',
        representativeLineId: line.representativeLineId ?? null,
        archivedAt: line.archivedAt ?? null,
      })),
    }
  } catch {
    return structuredClone(demoReplacementLineSnapshot)
  }
}

function writeDemoReplacementLineSnapshot(snapshot: ReplacementLineSnapshot) {
  window.localStorage.setItem(
    REPLACEMENT_LINE_STORAGE_KEY,
    JSON.stringify(snapshot),
  )
}

const demoReplacementLegacyLinks: ReplacementLegacyLink[] = [
  {
    id: 'legacy-layer',
    itemAId: 'item-cardigan',
    itemBId: 'item-knit',
    reviewStatus: 'pending',
    reviewDecision: null,
    reviewReason: null,
    reviewedAt: null,
    updatedAt: '2026-08-03T00:00:00.000Z',
  },
  {
    id: 'legacy-shoes',
    itemAId: 'item-loafers',
    itemBId: 'item-shoes',
    reviewStatus: 'pending',
    reviewDecision: null,
    reviewReason: null,
    reviewedAt: null,
    updatedAt: '2026-08-03T00:00:00.000Z',
  },
]

function readDemoReplacementLegacyLinks() {
  try {
    const stored = window.localStorage.getItem(LEGACY_LINK_REVIEW_STORAGE_KEY)
    if (!stored) return structuredClone(demoReplacementLegacyLinks)
    const reviews = JSON.parse(stored) as Record<
      string,
      Pick<
        ReplacementLegacyLink,
        | 'reviewStatus'
        | 'reviewDecision'
        | 'reviewReason'
        | 'reviewedAt'
        | 'updatedAt'
      >
    >
    return demoReplacementLegacyLinks.map((link) => ({
      ...link,
      ...(reviews[link.id] ?? {}),
    }))
  } catch {
    return structuredClone(demoReplacementLegacyLinks)
  }
}

function readDemoReplacementLineEdges(): ReplacementLineEdge[] {
  try {
    const stored = window.localStorage.getItem(LINEAGE_EDGE_STORAGE_KEY)
    return stored
        ? (JSON.parse(stored) as ReplacementLineEdge[]).map((edge) => ({
          ...edge,
          decisionReason: normalizeReplacementLineDecisionReason(
            edge.decisionReason,
          ),
          sourceKind:
            edge.sourceKind ??
            (edge.sourceLegacyLinkId ? 'legacy_link' : 'manual'),
        }))
      : []
  } catch {
    return []
  }
}

function readDemoReplacementLineStarts(): ReplacementLineStart[] {
  try {
    const stored = window.localStorage.getItem(LINEAGE_START_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as ReplacementLineStart[]) : []
  } catch {
    return []
  }
}

function writeDemoReplacementLegacyLinkReviews(
  links: ReplacementLegacyLink[],
) {
  const reviews = Object.fromEntries(
    links
      .filter((entry) => entry.reviewStatus === 'reviewed')
      .map((entry) => [
        entry.id,
        {
          reviewStatus: entry.reviewStatus,
          reviewDecision: entry.reviewDecision,
          reviewReason: entry.reviewReason,
          reviewedAt: entry.reviewedAt,
          updatedAt: entry.updatedAt,
        },
      ]),
  )
  window.localStorage.setItem(
    LEGACY_LINK_REVIEW_STORAGE_KEY,
    JSON.stringify(reviews),
  )
}

function hasLineageCycle(edges: ReplacementLineEdge[]) {
  const successors = new Map<string, string[]>()
  for (const edge of edges.filter((entry) => entry.status === 'confirmed')) {
    const key = `${edge.replacementLineId}:${edge.predecessorItemId}`
    successors.set(key, [
      ...(successors.get(key) ?? []),
      edge.successorItemId,
    ])
  }

  for (const edge of edges.filter((entry) => entry.status === 'confirmed')) {
    const visiting = new Set<string>()
    const visit = (itemId: string): boolean => {
      const key = `${edge.replacementLineId}:${itemId}`
      if (visiting.has(key)) return true
      visiting.add(key)
      for (const successorId of successors.get(key) ?? []) {
        if (visit(successorId)) return true
      }
      visiting.delete(key)
      return false
    }
    if (visit(edge.predecessorItemId)) return true
  }
  return false
}

export class DemoReplacementLineRepository
  implements ReplacementLineRepository
{
  constructor(private readonly hasItem: (itemId: string) => boolean) {}

  async create(
    input: ReplacementLineCreateInput,
  ): Promise<ReplacementLineRecord> {
    const name = input.name.trim()
    const styleIdentity = input.styleIdentity?.trim() || null
    if (!name) throw new Error('새 Line 이름을 입력해 주세요.')
    if (name.length > 200 || (styleIdentity?.length ?? 0) > 200) {
      throw new Error('Line 이름과 Style Identity는 200자 이하로 입력해 주세요.')
    }

    const snapshot = readDemoReplacementLineSnapshot()
    const created: ReplacementLineRecord = {
      id: crypto.randomUUID(),
      name,
      styleIdentity,
      colorCategory: input.colorCategory,
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    }
    snapshot.lines.push(created)
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(created)
  }

  async load() {
    return structuredClone(readDemoReplacementLineSnapshot())
  }

  async loadLegacyLinks() {
    return readDemoReplacementLegacyLinks()
  }

  async reviewLegacyLink(
    linkId: string,
    input: ReplacementLegacyLinkReviewInput,
  ) {
    const links = readDemoReplacementLegacyLinks()
    const link = links.find((entry) => entry.id === linkId)
    if (!link) {
      throw new Error('검토할 Legacy Link를 찾지 못했습니다.')
    }
    if (link.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('다른 곳에서 검토 결과가 변경되었습니다. 다시 불러와 주세요.')
    }
    const reason = input.reason.trim()
    if (!reason) throw new Error('선택 이유를 입력해 주세요.')
    const changedAt = new Date(
      Math.max(Date.now(), new Date(link.updatedAt).getTime() + 1),
    ).toISOString()
    const reviewed: ReplacementLegacyLink = {
      ...link,
      reviewStatus: 'reviewed',
      reviewDecision: input.decision,
      reviewReason: reason,
      reviewedAt: changedAt,
      updatedAt: changedAt,
    }
    writeDemoReplacementLegacyLinkReviews(
      links.map((entry) => (entry.id === linkId ? reviewed : entry)),
    )
    return reviewed
  }

  async loadEdges() {
    return structuredClone(readDemoReplacementLineEdges())
  }

  async confirmEdges(
    inputs: ReplacementLineEdgeConfirmationInput[],
  ) {
    if (inputs.length < 1 || inputs.length > 200) {
      throw new Error('한 번에 1개 이상 200개 이하의 edge를 저장해 주세요.')
    }
    if (new Set(inputs.map((input) => input.sourceLegacyLinkId)).size !== inputs.length) {
      throw new Error('같은 Legacy Link를 한 번에 두 번 저장할 수 없습니다.')
    }

    const links = readDemoReplacementLegacyLinks()
    const currentEdges = readDemoReplacementLineEdges()
    const nextEdges = [...currentEdges]
    const changedAt = new Date().toISOString()

    for (const input of inputs) {
      const link = links.find((entry) => entry.id === input.sourceLegacyLinkId)
      if (!link || link.reviewStatus !== 'reviewed') {
        throw new Error('검토가 끝난 Legacy Link만 edge로 저장할 수 있습니다.')
      }
      if (link.updatedAt !== input.expectedLegacyUpdatedAt) {
        throw new Error('검토 결과가 변경되었습니다. 다시 불러와 주세요.')
      }
      if (link.reviewDecision !== 'a_to_b' && link.reviewDecision !== 'b_to_a') {
        throw new Error('방향을 확정한 Legacy Link만 edge로 저장할 수 있습니다.')
      }
      const memberships = readDemoReplacementLineSnapshot().memberships.filter(
        (entry) => entry.replacementLineId === input.replacementLineId,
      )
      if (
        !memberships.some((entry) => entry.itemId === link.itemAId) ||
        !memberships.some((entry) => entry.itemId === link.itemBId)
      ) {
        throw new Error('두 Item이 함께 속한 Line을 선택해 주세요.')
      }
      if (currentEdges.some((edge) => edge.sourceLegacyLinkId === link.id)) {
        throw new Error('이미 저장된 Legacy Link edge가 있습니다.')
      }
      const predecessorItemId =
        link.reviewDecision === 'a_to_b' ? link.itemAId : link.itemBId
      const successorItemId =
        link.reviewDecision === 'a_to_b' ? link.itemBId : link.itemAId
      const decisionReason = input.decisionReason.trim()
      if (!decisionReason) throw new Error('edge 선택 이유가 필요합니다.')
      nextEdges.push({
        id: crypto.randomUUID(),
        replacementLineId: input.replacementLineId,
        predecessorItemId,
        successorItemId,
        sourceLegacyLinkId: link.id,
        sourceKind: 'legacy_link',
        branchName: input.branchName?.trim() || null,
        decisionReason,
        status: 'confirmed',
        confirmedAt: changedAt,
        updatedAt: changedAt,
      })
    }

    if (hasLineageCycle(nextEdges)) {
      throw new Error('Replacement Line 계보에는 cycle을 만들 수 없습니다.')
    }
    window.localStorage.setItem(LINEAGE_EDGE_STORAGE_KEY, JSON.stringify(nextEdges))
    return structuredClone(nextEdges.slice(currentEdges.length))
  }

  async updateEdgeConnection(
    edgeId: string,
    input: ReplacementLineEdgeConnectionUpdateInput,
  ) {
    const edges = readDemoReplacementLineEdges()
    const index = edges.findIndex((edge) => edge.id === edgeId)
    if (index < 0) throw new Error('수정할 계보 연결을 찾지 못했습니다.')

    const current = edges[index]
    if (current.updatedAt !== input.expectedUpdatedAt) {
      throw new Error(
        '다른 곳에서 계보 연결이 변경되었습니다. 다시 불러온 뒤 수정해 주세요.',
      )
    }
    if (current.status !== 'confirmed') {
      throw new Error('확정된 계보 연결만 수정할 수 있습니다.')
    }
    if (input.predecessorItemId === current.successorItemId) {
      throw new Error('자기 자신을 이전 Item으로 선택할 수 없습니다.')
    }

    const isMember = readDemoReplacementLineSnapshot().memberships.some(
      (membership) =>
        membership.replacementLineId === current.replacementLineId &&
        membership.itemId === input.predecessorItemId,
    )
    if (!isMember) throw new Error('같은 Line의 Item만 이전 Item으로 선택할 수 있습니다.')

    const decisionReason = input.decisionReason.trim()
    const branchName = input.branchName?.trim() || null
    if (!(REPLACEMENT_LINE_DECISION_REASONS as readonly string[]).includes(decisionReason)) {
      throw new Error('선택 이유를 목록에서 골라 주세요.')
    }
    if (branchName && branchName.length > 200) {
      throw new Error('가지 이름은 200자 이하로 입력해 주세요.')
    }
    if (
      current.predecessorItemId === input.predecessorItemId &&
      current.decisionReason === decisionReason &&
      current.branchName === branchName
    ) {
      throw new Error('변경된 내용이 없습니다.')
    }

    const changedAt = new Date(
      Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
    ).toISOString()
    const updated: ReplacementLineEdge = {
      ...current,
      predecessorItemId: input.predecessorItemId,
      sourceLegacyLinkId: null,
      sourceKind: 'manual',
      decisionReason,
      branchName,
      confirmedAt: changedAt,
      updatedAt: changedAt,
    }
    const nextEdges = edges.map((edge) => (edge.id === edgeId ? updated : edge))
    if (hasLineageCycle(nextEdges)) {
      throw new Error('Replacement Line 계보에는 cycle을 만들 수 없습니다.')
    }

    window.localStorage.setItem(LINEAGE_EDGE_STORAGE_KEY, JSON.stringify(nextEdges))
    return structuredClone(updated)
  }

  async disconnectEdge(
    edgeId: string,
    input: ReplacementLineEdgeDisconnectInput,
  ) {
    const edges = readDemoReplacementLineEdges()
    const current = edges.find((edge) => edge.id === edgeId)
    if (!current) throw new Error('해제할 계보 연결을 찾지 못했습니다.')
    if (current.updatedAt !== input.expectedUpdatedAt) {
      throw new Error(
        '다른 곳에서 계보 연결이 변경되었습니다. 다시 불러온 뒤 수정해 주세요.',
      )
    }
    if (current.status !== 'confirmed') {
      throw new Error('확정된 계보 연결만 해제할 수 있습니다.')
    }

    const nextEdges = edges.filter((edge) => edge.id !== edgeId)
    const shouldBeStart = !nextEdges.some(
      (edge) =>
        edge.replacementLineId === current.replacementLineId &&
        edge.successorItemId === current.successorItemId &&
        edge.status === 'confirmed',
    )
    window.localStorage.setItem(LINEAGE_EDGE_STORAGE_KEY, JSON.stringify(nextEdges))

    if (shouldBeStart) {
      const starts = readDemoReplacementLineStarts().filter(
        (start) =>
          start.replacementLineId !== current.replacementLineId ||
          start.itemId !== current.successorItemId,
      )
      starts.push({
        replacementLineId: current.replacementLineId,
        itemId: current.successorItemId,
        designatedAt: new Date().toISOString(),
      })
      window.localStorage.setItem(LINEAGE_START_STORAGE_KEY, JSON.stringify(starts))
    }

    return shouldBeStart
  }

  async reverseEdge(
    edgeId: string,
    input: ReplacementLineEdgeDirectionUpdateInput,
  ) {
    const edges = readDemoReplacementLineEdges()
    const index = edges.findIndex((edge) => edge.id === edgeId)
    if (index < 0) throw new Error('방향을 바꿀 계보 연결을 찾지 못했습니다.')

    const current = edges[index]
    if (current.updatedAt !== input.expectedUpdatedAt) {
      throw new Error(
        '다른 곳에서 계보 연결이 변경되었습니다. 다시 불러온 뒤 수정해 주세요.',
      )
    }
    if (current.status !== 'confirmed') {
      throw new Error('확정된 계보 연결만 방향을 바꿀 수 있습니다.')
    }

    const sourceKind =
      current.sourceKind ??
      (current.sourceLegacyLinkId ? 'legacy_link' : 'manual')
    const links = readDemoReplacementLegacyLinks()
    const linkIndex = links.findIndex(
      (link) => link.id === current.sourceLegacyLinkId,
    )
    const link = links[linkIndex]
    if (
      sourceKind === 'legacy_link' &&
      (!link ||
        link.reviewStatus !== 'reviewed' ||
        (link.reviewDecision !== 'a_to_b' && link.reviewDecision !== 'b_to_a'))
    ) {
      throw new Error('방향이 확정된 Legacy Link를 찾지 못했습니다.')
    }

    const changedAt = new Date(
      Math.max(
        Date.now(),
        new Date(current.updatedAt).getTime() + 1,
        link ? new Date(link.updatedAt).getTime() + 1 : 0,
      ),
    ).toISOString()
    const reversedEdge: ReplacementLineEdge = {
      ...current,
      predecessorItemId: current.successorItemId,
      successorItemId: current.predecessorItemId,
      confirmedAt: changedAt,
      updatedAt: changedAt,
    }
    const nextEdges = edges.map((edge) =>
      edge.id === edgeId ? reversedEdge : edge,
    )
    if (
      readDemoReplacementLineStarts().some(
        (start) =>
          start.replacementLineId === current.replacementLineId &&
          start.itemId === reversedEdge.successorItemId,
      )
    ) {
      throw new Error('시작점으로 지정된 Item에는 이전 Item을 연결할 수 없습니다.')
    }
    if (hasLineageCycle(nextEdges)) {
      throw new Error('Replacement Line 계보에는 cycle을 만들 수 없습니다.')
    }

    if (sourceKind === 'legacy_link' && link) {
      links[linkIndex] = {
        ...link,
        reviewDecision: link.reviewDecision === 'a_to_b' ? 'b_to_a' : 'a_to_b',
        reviewedAt: changedAt,
        updatedAt: changedAt,
      }
      writeDemoReplacementLegacyLinkReviews(links)
    }
    window.localStorage.setItem(LINEAGE_EDGE_STORAGE_KEY, JSON.stringify(nextEdges))
    return structuredClone(reversedEdge)
  }

  async loadStarts() {
    return structuredClone(readDemoReplacementLineStarts())
  }

  async setStart(
    replacementLineId: string,
    itemId: string,
    isStart: boolean,
  ) {
    const isMember = readDemoReplacementLineSnapshot().memberships.some(
      (membership) =>
        membership.replacementLineId === replacementLineId &&
        membership.itemId === itemId,
    )
    if (!isMember) throw new Error('Line에 속한 Item만 시작점으로 지정할 수 있습니다.')

    const starts = readDemoReplacementLineStarts()
    const nextStarts = starts.filter(
      (start) =>
        start.replacementLineId !== replacementLineId || start.itemId !== itemId,
    )
    if (isStart) {
      const hasIncoming = readDemoReplacementLineEdges().some(
        (edge) =>
          edge.replacementLineId === replacementLineId &&
          edge.successorItemId === itemId &&
          edge.status === 'confirmed',
      )
      if (hasIncoming) {
        throw new Error('이전 Item이 있는 Item은 시작점으로 지정할 수 없습니다.')
      }
      nextStarts.push({
        replacementLineId,
        itemId,
        designatedAt: new Date().toISOString(),
      })
    }
    window.localStorage.setItem(
      LINEAGE_START_STORAGE_KEY,
      JSON.stringify(nextStarts),
    )
    return isStart
  }

  async createManualEdge(
    input: ReplacementLineManualEdgeInput,
  ) {
    if (input.predecessorItemId === input.successorItemId) {
      throw new Error('서로 다른 두 Item을 선택해 주세요.')
    }
    const memberIds = new Set(
      readDemoReplacementLineSnapshot().memberships
        .filter(
          (membership) =>
            membership.replacementLineId === input.replacementLineId,
        )
        .map((membership) => membership.itemId),
    )
    if (
      !memberIds.has(input.predecessorItemId) ||
      !memberIds.has(input.successorItemId)
    ) {
      throw new Error('같은 Line에 속한 두 Item을 선택해 주세요.')
    }
    if (
      readDemoReplacementLineStarts().some(
        (start) =>
          start.replacementLineId === input.replacementLineId &&
          start.itemId === input.successorItemId,
      )
    ) {
      throw new Error('시작점 지정부터 해제한 뒤 이전 Item을 연결해 주세요.')
    }

    const decisionReason = input.decisionReason.trim()
    const branchName = input.branchName?.trim() || null
    if (!(REPLACEMENT_LINE_DECISION_REASONS as readonly string[]).includes(decisionReason)) {
      throw new Error('선택 이유를 목록에서 골라 주세요.')
    }
    if (branchName && branchName.length > 200) {
      throw new Error('가지 이름은 200자 이하로 입력해 주세요.')
    }

    const edges = readDemoReplacementLineEdges()
    if (
      edges.some(
        (edge) =>
          edge.replacementLineId === input.replacementLineId &&
          edge.predecessorItemId === input.predecessorItemId &&
          edge.successorItemId === input.successorItemId,
      )
    ) {
      throw new Error('이미 같은 방향의 계보 연결이 있습니다.')
    }
    const changedAt = new Date().toISOString()
    const created: ReplacementLineEdge = {
      id: crypto.randomUUID(),
      replacementLineId: input.replacementLineId,
      predecessorItemId: input.predecessorItemId,
      successorItemId: input.successorItemId,
      sourceLegacyLinkId: null,
      sourceKind: 'manual',
      branchName,
      decisionReason,
      status: 'confirmed',
      confirmedAt: changedAt,
      updatedAt: changedAt,
    }
    const nextEdges = [...edges, created]
    if (hasLineageCycle(nextEdges)) {
      throw new Error('Replacement Line 계보에는 cycle을 만들 수 없습니다.')
    }
    window.localStorage.setItem(LINEAGE_EDGE_STORAGE_KEY, JSON.stringify(nextEdges))
    return structuredClone(created)
  }

  async moveItem(
    input: ReplacementLineItemMoveInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const sourceLine = snapshot.lines.find(
      (line) => line.id === input.sourceLineId,
    )
    if (!sourceLine) throw new Error('기존 Replacement Line을 찾지 못했습니다.')
    if (sourceLine.updatedAt !== input.expectedSourceUpdatedAt) {
      throw new Error('기존 Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (
      !snapshot.memberships.some(
        (membership) =>
          membership.replacementLineId === input.sourceLineId &&
          membership.itemId === input.itemId,
      )
    ) {
      throw new Error('이 Item은 기존 Line에 속해 있지 않습니다.')
    }
    if (
      readDemoReplacementLineEdges().some(
        (edge) =>
          edge.replacementLineId === input.sourceLineId &&
          (edge.predecessorItemId === input.itemId ||
            edge.successorItemId === input.itemId),
      )
    ) {
      throw new Error('계보 연결을 모두 해제한 뒤 다른 Line으로 옮겨 주세요.')
    }

    const newLineName = input.newLineName?.trim() || null
    const newLineStyleIdentity = input.newLineStyleIdentity?.trim() || null
    let targetLine = input.targetLineId
      ? snapshot.lines.find((line) => line.id === input.targetLineId)
      : undefined
    if (input.targetLineId) {
      if (!targetLine) throw new Error('옮길 Replacement Line을 찾지 못했습니다.')
      if (targetLine.id === sourceLine.id) {
        throw new Error('현재 Line과 다른 Line을 골라 주세요.')
      }
      if (targetLine.updatedAt !== input.expectedTargetUpdatedAt) {
        throw new Error('옮길 Line이 변경되었습니다. 다시 불러와 주세요.')
      }
    } else {
      if (!newLineName) throw new Error('새 Line 이름을 입력해 주세요.')
      targetLine = {
        id: crypto.randomUUID(),
        name: newLineName,
        styleIdentity: newLineStyleIdentity,
        colorCategory: null,
        reviewStatus: 'needs_review',
        lifecycleStatus: 'active',
        representativeLineId: null,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      }
      snapshot.lines.push(targetLine)
    }
    if (
      snapshot.memberships.some(
        (membership) =>
          membership.replacementLineId === targetLine.id &&
          membership.itemId === input.itemId,
      )
    ) {
      throw new Error('이 Item은 이미 옮길 Line에 속해 있습니다.')
    }

    const changedAt = new Date().toISOString()
    snapshot.memberships = snapshot.memberships.filter(
      (membership) =>
        membership.replacementLineId !== sourceLine.id ||
        membership.itemId !== input.itemId,
    )
    snapshot.memberships.push({
      replacementLineId: targetLine.id,
      itemId: input.itemId,
    })
    snapshot.lines = snapshot.lines.map((line) =>
      line.id === sourceLine.id || line.id === targetLine.id
        ? { ...line, reviewStatus: 'needs_review', updatedAt: changedAt }
        : line,
    )

    const starts = readDemoReplacementLineStarts().filter(
      (start) =>
        start.replacementLineId !== sourceLine.id || start.itemId !== input.itemId,
    )
    starts.push({
      replacementLineId: targetLine.id,
      itemId: input.itemId,
      designatedAt: changedAt,
    })
    window.localStorage.setItem(LINEAGE_START_STORAGE_KEY, JSON.stringify(starts))
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(
      snapshot.lines.find((line) => line.id === targetLine.id)!,
    )
  }

  async addItem(
    input: ReplacementLineItemAddInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const line = snapshot.lines.find((entry) => entry.id === input.lineId)
    if (!line) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (line.lifecycleStatus !== 'active') {
      throw new Error('사용 중인 Line에만 Item을 추가할 수 있습니다.')
    }
    if (line.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (!this.hasItem(input.itemId)) {
      throw new Error('추가할 Closet Item을 찾지 못했습니다.')
    }
    if (snapshot.memberships.some((entry) => entry.itemId === input.itemId)) {
      throw new Error('이 Item은 이미 다른 Replacement Line에 속해 있습니다.')
    }

    const changedAt = new Date().toISOString()
    snapshot.memberships.push({
      replacementLineId: line.id,
      itemId: input.itemId,
    })
    snapshot.lines = snapshot.lines.map((entry) =>
      entry.id === line.id
        ? { ...entry, reviewStatus: 'needs_review', updatedAt: changedAt }
        : entry,
    )
    const starts = readDemoReplacementLineStarts()
    starts.push({
      replacementLineId: line.id,
      itemId: input.itemId,
      designatedAt: changedAt,
    })
    window.localStorage.setItem(LINEAGE_START_STORAGE_KEY, JSON.stringify(starts))
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(snapshot.lines.find((entry) => entry.id === line.id)!)
  }

  async removeItem(
    input: ReplacementLineItemRemoveInput,
  ): Promise<ReplacementLineRecord[]> {
    const snapshot = readDemoReplacementLineSnapshot()
    const sourceLine = snapshot.lines.find(
      (entry) => entry.id === input.sourceLineId,
    )
    if (!sourceLine) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (sourceLine.lifecycleStatus !== 'active') {
      throw new Error('사용 중인 Line에서만 Item을 뺄 수 있습니다.')
    }
    if (sourceLine.updatedAt !== input.expectedSourceUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (
      !snapshot.memberships.some(
        (entry) =>
          entry.replacementLineId === sourceLine.id &&
          entry.itemId === input.itemId,
      )
    ) {
      throw new Error('이 Item은 현재 Replacement Line에 속해 있지 않습니다.')
    }
    if (
      readDemoReplacementLineEdges().some(
        (edge) =>
          edge.replacementLineId === sourceLine.id &&
          (edge.predecessorItemId === input.itemId ||
            edge.successorItemId === input.itemId),
      )
    ) {
      throw new Error('계보 연결을 모두 해제한 뒤 Line에서 빼 주세요.')
    }

    const changedAt = new Date().toISOString()
    snapshot.memberships = snapshot.memberships.filter(
      (entry) =>
        entry.replacementLineId !== sourceLine.id ||
        entry.itemId !== input.itemId,
    )
    snapshot.lines = snapshot.lines.map((entry) =>
      entry.id === sourceLine.id
        ? { ...entry, reviewStatus: 'needs_review', updatedAt: changedAt }
        : entry,
    )
    const starts = readDemoReplacementLineStarts().filter(
      (start) =>
        start.replacementLineId !== sourceLine.id || start.itemId !== input.itemId,
    )
    window.localStorage.setItem(LINEAGE_START_STORAGE_KEY, JSON.stringify(starts))
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(
      snapshot.lines.filter((entry) => entry.id === sourceLine.id),
    )
  }

  async mergeLines(
    input: ReplacementLineMergeInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const sourceLine = snapshot.lines.find((line) => line.id === input.sourceLineId)
    const targetLine = snapshot.lines.find((line) => line.id === input.targetLineId)
    if (!sourceLine || !targetLine) {
      throw new Error('병합할 Replacement Line을 찾지 못했습니다.')
    }
    if (sourceLine.id === targetLine.id) {
      throw new Error('현재 Line과 다른 대표 Line을 골라 주세요.')
    }
    if (sourceLine.lifecycleStatus !== 'active' || targetLine.lifecycleStatus !== 'active') {
      throw new Error('사용 중인 Line끼리만 병합할 수 있습니다.')
    }
    if (
      sourceLine.updatedAt !== input.expectedSourceUpdatedAt ||
      targetLine.updatedAt !== input.expectedTargetUpdatedAt
    ) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }

    const edges = readDemoReplacementLineEdges()
    const sourceEdges = edges.filter(
      (edge) => edge.replacementLineId === sourceLine.id,
    )
    const targetEdges = edges.filter(
      (edge) => edge.replacementLineId === targetLine.id,
    )
    if (
      sourceEdges.some((sourceEdge) =>
        targetEdges.some(
          (targetEdge) =>
            targetEdge.predecessorItemId === sourceEdge.predecessorItemId &&
            targetEdge.successorItemId === sourceEdge.successorItemId,
        ),
      )
    ) {
      throw new Error('두 Line에 같은 계보 연결이 있습니다. 먼저 연결을 정리해 주세요.')
    }
    const mergedEdges = edges.map((edge) =>
      edge.replacementLineId === sourceLine.id
        ? { ...edge, replacementLineId: targetLine.id }
        : edge,
    )
    if (hasLineageCycle(mergedEdges)) {
      throw new Error('두 Line을 합치면 계보에 cycle이 생깁니다.')
    }

    const changedAt = new Date().toISOString()
    const mergedMemberships = new Map(
      snapshot.memberships
        .filter((membership) => membership.replacementLineId !== sourceLine.id)
        .map((membership) => [
          `${membership.replacementLineId}:${membership.itemId}`,
          membership,
        ]),
    )
    for (const membership of snapshot.memberships) {
      if (membership.replacementLineId !== sourceLine.id) continue
      const movedMembership = {
        replacementLineId: targetLine.id,
        itemId: membership.itemId,
      }
      mergedMemberships.set(
        `${movedMembership.replacementLineId}:${movedMembership.itemId}`,
        movedMembership,
      )
    }
    snapshot.memberships = [...mergedMemberships.values()]

    const incomingTargetItemIds = new Set(
      mergedEdges
        .filter(
          (edge) =>
            edge.replacementLineId === targetLine.id && edge.status === 'confirmed',
        )
        .map((edge) => edge.successorItemId),
    )
    const mergedStarts = new Map<string, ReplacementLineStart>()
    for (const start of readDemoReplacementLineStarts()) {
      if (
        start.replacementLineId !== sourceLine.id &&
        start.replacementLineId !== targetLine.id
      ) {
        mergedStarts.set(`${start.replacementLineId}:${start.itemId}`, start)
        continue
      }
      if (incomingTargetItemIds.has(start.itemId)) continue
      const movedStart = { ...start, replacementLineId: targetLine.id }
      mergedStarts.set(`${targetLine.id}:${start.itemId}`, movedStart)
    }

    snapshot.lines = snapshot.lines.map((line) => {
      if (line.id === sourceLine.id) {
        return {
          ...line,
          lifecycleStatus: 'archived',
          representativeLineId: targetLine.id,
          archivedAt: changedAt,
          reviewStatus: 'needs_review',
          updatedAt: changedAt,
        }
      }
      if (line.id === targetLine.id) {
        return {
          ...line,
          reviewStatus: 'needs_review',
          updatedAt: changedAt,
        }
      }
      if (line.representativeLineId === sourceLine.id) {
        return { ...line, representativeLineId: targetLine.id, updatedAt: changedAt }
      }
      return line
    })
    window.localStorage.setItem(LINEAGE_EDGE_STORAGE_KEY, JSON.stringify(mergedEdges))
    window.localStorage.setItem(
      LINEAGE_START_STORAGE_KEY,
      JSON.stringify([...mergedStarts.values()]),
    )
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(snapshot.lines.find((line) => line.id === targetLine.id)!)
  }

  async setArchived(
    input: ReplacementLineArchiveInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const line = snapshot.lines.find((entry) => entry.id === input.lineId)
    if (!line) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (line.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (input.archived) {
      if (line.lifecycleStatus !== 'active') {
        throw new Error('이미 보관된 Line입니다.')
      }
      if (snapshot.lines.some((entry) => entry.representativeLineId === line.id)) {
        throw new Error('대표 Line은 다른 Line으로 병합해 주세요.')
      }
    } else {
      if (line.lifecycleStatus !== 'archived') {
        throw new Error('이미 사용 중인 Line입니다.')
      }
      if (line.representativeLineId) {
        throw new Error('병합된 Line은 직접 복원할 수 없습니다.')
      }
    }

    const changedAt = new Date().toISOString()
    const savedLine: ReplacementLineRecord = {
      ...line,
      lifecycleStatus: input.archived ? 'archived' : 'active',
      representativeLineId: null,
      archivedAt: input.archived ? changedAt : null,
      updatedAt: changedAt,
    }
    snapshot.lines = snapshot.lines.map((entry) =>
      entry.id === savedLine.id ? savedLine : entry,
    )
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(savedLine)
  }

  async setColorCategory(
    input: ReplacementLineColorUpdateInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const line = snapshot.lines.find((entry) => entry.id === input.lineId)
    if (!line) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (line.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }

    const savedLine: ReplacementLineRecord = {
      ...line,
      colorCategory: input.colorCategory,
      updatedAt: new Date().toISOString(),
    }
    snapshot.lines = snapshot.lines.map((entry) =>
      entry.id === savedLine.id ? savedLine : entry,
    )
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(savedLine)
  }

  async acknowledgeReview(
    input: ReplacementLineReviewInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const line = snapshot.lines.find((entry) => entry.id === input.lineId)
    if (!line) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (line.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (line.lifecycleStatus !== 'active') {
      throw new Error('사용 중인 Line만 재검토를 완료할 수 있습니다.')
    }
    if (
      readDemoReplacementLineEdges().some(
        (edge) =>
          edge.replacementLineId === line.id && edge.status === 'needs_review',
      )
    ) {
      throw new Error('재검토가 필요한 연결을 먼저 확인해 주세요.')
    }

    const savedLine: ReplacementLineRecord = {
      ...line,
      reviewStatus: 'ready',
      updatedAt: new Date().toISOString(),
    }
    snapshot.lines = snapshot.lines.map((entry) =>
      entry.id === savedLine.id ? savedLine : entry,
    )
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(savedLine)
  }

  async updateDetails(
    input: ReplacementLineDetailsUpdateInput,
  ): Promise<ReplacementLineRecord> {
    const snapshot = readDemoReplacementLineSnapshot()
    const line = snapshot.lines.find((entry) => entry.id === input.lineId)
    if (!line) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (line.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (line.lifecycleStatus !== 'active') {
      throw new Error('보관된 Line 정보는 수정할 수 없습니다.')
    }

    const name = input.name.trim()
    const styleIdentity = input.styleIdentity?.trim() || null
    if (!name) throw new Error('Line 이름을 입력해 주세요.')
    if (name.length > 200 || (styleIdentity?.length ?? 0) > 200) {
      throw new Error('Line 이름과 Style Identity는 200자 이하로 입력해 주세요.')
    }

    const savedLine: ReplacementLineRecord = {
      ...line,
      name,
      styleIdentity,
      updatedAt: new Date().toISOString(),
    }
    snapshot.lines = snapshot.lines.map((entry) =>
      entry.id === savedLine.id ? savedLine : entry,
    )
    writeDemoReplacementLineSnapshot(snapshot)
    return structuredClone(savedLine)
  }

  async deleteEmpty(
    input: ReplacementLineDeleteInput,
  ): Promise<boolean> {
    const snapshot = readDemoReplacementLineSnapshot()
    const line = snapshot.lines.find((entry) => entry.id === input.lineId)
    if (!line) throw new Error('Replacement Line을 찾지 못했습니다.')
    if (line.updatedAt !== input.expectedUpdatedAt) {
      throw new Error('Line이 변경되었습니다. 다시 불러와 주세요.')
    }
    if (line.lifecycleStatus !== 'active' || line.representativeLineId) {
      throw new Error('사용 중인 독립 Line만 삭제할 수 있습니다.')
    }
    if (
      snapshot.memberships.some(
        (membership) => membership.replacementLineId === line.id,
      )
    ) {
      throw new Error('Item이 남아 있는 Line은 삭제할 수 없습니다.')
    }
    if (
      readDemoReplacementLineEdges().some(
        (edge) => edge.replacementLineId === line.id,
      )
    ) {
      throw new Error('계보 연결이 남아 있는 Line은 삭제할 수 없습니다.')
    }
    if (
      readDemoReplacementLineStarts().some(
        (start) => start.replacementLineId === line.id,
      )
    ) {
      throw new Error('시작점이 남아 있는 Line은 삭제할 수 없습니다.')
    }
    if (
      snapshot.lines.some(
        (entry) => entry.representativeLineId === line.id,
      )
    ) {
      throw new Error('다른 Line이 대표 Line으로 참조하고 있어 삭제할 수 없습니다.')
    }

    snapshot.lines = snapshot.lines.filter((entry) => entry.id !== line.id)
    writeDemoReplacementLineSnapshot(snapshot)
    return true
  }
}
