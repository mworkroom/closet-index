import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ReplacementLegacyLink,
  ReplacementLegacyLinkDecision,
  ReplacementLegacyLinkReviewInput,
  ReplacementLineSnapshot,
  ReplacementLineEdge,
  ReplacementLineEdgeConfirmationInput,
  ReplacementLineEdgeConnectionUpdateInput,
  ReplacementLineEdgeDetailsUpdateInput,
  ReplacementLineEdgeDisconnectInput,
  ReplacementLineEdgeDirectionUpdateInput,
  ReplacementLineManualEdgeInput,
  ReplacementLineStart,
} from '../../lib/types'

interface ReplacementLineRow {
  id: string
  name: string
  style_identity: string | null
}

interface ReplacementLineMembershipRow {
  replacement_line_id: string
  item_id: string
}

interface ReplacementLegacyLinkRow {
  id: string
  item_a_id: string
  item_b_id: string
  review_status: 'pending' | 'reviewed'
  review_decision: ReplacementLegacyLinkDecision | null
  review_reason: string | null
  reviewed_at: string | null
  updated_at: string
}

interface ReplacementLineEdgeRow {
  id: string
  replacement_line_id: string
  predecessor_item_id: string
  successor_item_id: string
  source_legacy_link_id: string | null
  source_kind: ReplacementLineEdge['sourceKind']
  branch_name: string | null
  decision_reason: string
  status: ReplacementLineEdge['status']
  confirmed_at: string
  updated_at: string
}

interface ReplacementLineStartRow {
  replacement_line_id: string
  item_id: string
  designated_at: string
}

function toLegacyLink(row: ReplacementLegacyLinkRow): ReplacementLegacyLink {
  return {
    id: row.id,
    itemAId: row.item_a_id,
    itemBId: row.item_b_id,
    reviewStatus: row.review_status,
    reviewDecision: row.review_decision,
    reviewReason: row.review_reason,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  }
}

function toLineEdge(row: ReplacementLineEdgeRow): ReplacementLineEdge {
  return {
    id: row.id,
    replacementLineId: row.replacement_line_id,
    predecessorItemId: row.predecessor_item_id,
    successorItemId: row.successor_item_id,
    sourceLegacyLinkId: row.source_legacy_link_id,
    sourceKind: row.source_kind,
    branchName: row.branch_name,
    decisionReason: row.decision_reason,
    status: row.status,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  }
}

export class SupabaseReplacementLineRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly workspaceId: string,
  ) {}

  async load(): Promise<ReplacementLineSnapshot> {
    const [linesResult, membershipsResult] = await Promise.all([
      this.client
        .from('closet_replacement_lines')
        .select('id,name,style_identity')
        .eq('workspace_id', this.workspaceId),
      this.client
        .from('closet_replacement_line_items')
        .select('replacement_line_id,item_id')
        .eq('workspace_id', this.workspaceId),
    ])

    if (linesResult.error) throw linesResult.error
    if (membershipsResult.error) throw membershipsResult.error

    return {
      lines: ((linesResult.data ?? []) as ReplacementLineRow[]).map((line) => ({
        id: line.id,
        name: line.name,
        styleIdentity: line.style_identity,
      })),
      memberships: (
        (membershipsResult.data ?? []) as ReplacementLineMembershipRow[]
      ).map((membership) => ({
        replacementLineId: membership.replacement_line_id,
        itemId: membership.item_id,
      })),
    }
  }

  async loadLegacyLinks(): Promise<ReplacementLegacyLink[]> {
    const result = await this.client
      .from('closet_replacement_legacy_links')
      .select(
        'id,item_a_id,item_b_id,review_status,review_decision,review_reason,reviewed_at,updated_at',
      )
      .eq('workspace_id', this.workspaceId)
      .order('review_status')
      .order('created_at')
      .order('id')

    if (result.error) throw result.error
    return ((result.data ?? []) as ReplacementLegacyLinkRow[]).map(toLegacyLink)
  }

  async reviewLegacyLink(
    linkId: string,
    input: ReplacementLegacyLinkReviewInput,
  ): Promise<ReplacementLegacyLink> {
    const { data, error } = await this.client.rpc(
      'revise_closet_replacement_legacy_link',
      {
        p_workspace_id: this.workspaceId,
        p_link_id: linkId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_decision: input.decision,
        p_reason: input.reason,
      },
    )
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | ReplacementLegacyLinkRow
      | null
    if (!row) throw new Error('저장된 Legacy Link를 확인하지 못했습니다.')
    return toLegacyLink(row)
  }

  async loadEdges(): Promise<ReplacementLineEdge[]> {
    const result = await this.client
      .from('closet_replacement_line_edges')
      .select(
        'id,replacement_line_id,predecessor_item_id,successor_item_id,source_legacy_link_id,source_kind,branch_name,decision_reason,status,confirmed_at,updated_at',
      )
      .eq('workspace_id', this.workspaceId)
      .order('confirmed_at')
      .order('id')

    if (result.error) throw result.error
    return ((result.data ?? []) as ReplacementLineEdgeRow[]).map(toLineEdge)
  }

  async confirmEdges(
    inputs: ReplacementLineEdgeConfirmationInput[],
  ): Promise<ReplacementLineEdge[]> {
    const { data, error } = await this.client.rpc(
      'confirm_closet_replacement_line_edges',
      {
        p_workspace_id: this.workspaceId,
        p_candidates: inputs.map((input) => ({
          replacement_line_id: input.replacementLineId,
          source_legacy_link_id: input.sourceLegacyLinkId,
          expected_legacy_updated_at: input.expectedLegacyUpdatedAt,
          branch_name: input.branchName,
          decision_reason: input.decisionReason,
        })),
      },
    )
    if (error) throw error
    return ((data ?? []) as ReplacementLineEdgeRow[]).map(toLineEdge)
  }

  async updateEdgeDetails(
    edgeId: string,
    input: ReplacementLineEdgeDetailsUpdateInput,
  ): Promise<ReplacementLineEdge> {
    const { data, error } = await this.client.rpc(
      'revise_closet_replacement_line_edge_details',
      {
        p_workspace_id: this.workspaceId,
        p_edge_id: edgeId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_branch_name: input.branchName,
        p_decision_reason: input.decisionReason,
      },
    )
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | ReplacementLineEdgeRow
      | null
    if (!row) throw new Error('수정된 계보 연결을 확인하지 못했습니다.')
    return toLineEdge(row)
  }

  async updateEdgeConnection(
    edgeId: string,
    input: ReplacementLineEdgeConnectionUpdateInput,
  ): Promise<ReplacementLineEdge> {
    const { data, error } = await this.client.rpc(
      'update_closet_replacement_line_edge_connection',
      {
        p_workspace_id: this.workspaceId,
        p_edge_id: edgeId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_predecessor_item_id: input.predecessorItemId,
        p_branch_name: input.branchName,
        p_decision_reason: input.decisionReason,
      },
    )
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | ReplacementLineEdgeRow
      | null
    if (!row) throw new Error('수정된 계보 연결을 확인하지 못했습니다.')
    return toLineEdge(row)
  }

  async disconnectEdge(
    edgeId: string,
    input: ReplacementLineEdgeDisconnectInput,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      'disconnect_closet_replacement_line_edge',
      {
        p_workspace_id: this.workspaceId,
        p_edge_id: edgeId,
        p_expected_updated_at: input.expectedUpdatedAt,
      },
    )
    if (error) throw error
    return Boolean(data)
  }

  async reverseEdge(
    edgeId: string,
    input: ReplacementLineEdgeDirectionUpdateInput,
  ): Promise<ReplacementLineEdge> {
    const { data, error } = await this.client.rpc(
      'reverse_closet_replacement_line_edge',
      {
        p_workspace_id: this.workspaceId,
        p_edge_id: edgeId,
        p_expected_updated_at: input.expectedUpdatedAt,
      },
    )
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | ReplacementLineEdgeRow
      | null
    if (!row) throw new Error('방향을 바꾼 계보 연결을 확인하지 못했습니다.')
    return toLineEdge(row)
  }

  async loadStarts(): Promise<ReplacementLineStart[]> {
    const result = await this.client
      .from('closet_replacement_line_starts')
      .select('replacement_line_id,item_id,designated_at')
      .eq('workspace_id', this.workspaceId)
      .order('designated_at')
      .order('item_id')

    if (result.error) throw result.error
    return ((result.data ?? []) as ReplacementLineStartRow[]).map((row) => ({
      replacementLineId: row.replacement_line_id,
      itemId: row.item_id,
      designatedAt: row.designated_at,
    }))
  }

  async setStart(
    replacementLineId: string,
    itemId: string,
    isStart: boolean,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      'set_closet_replacement_line_start',
      {
        p_workspace_id: this.workspaceId,
        p_replacement_line_id: replacementLineId,
        p_item_id: itemId,
        p_is_start: isStart,
      },
    )
    if (error) throw error
    return Boolean(data)
  }

  async createManualEdge(
    input: ReplacementLineManualEdgeInput,
  ): Promise<ReplacementLineEdge> {
    const { data, error } = await this.client.rpc(
      'create_closet_replacement_manual_edge',
      {
        p_workspace_id: this.workspaceId,
        p_replacement_line_id: input.replacementLineId,
        p_predecessor_item_id: input.predecessorItemId,
        p_successor_item_id: input.successorItemId,
        p_branch_name: input.branchName,
        p_decision_reason: input.decisionReason,
      },
    )
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as
      | ReplacementLineEdgeRow
      | null
    if (!row) throw new Error('추가한 계보 연결을 확인하지 못했습니다.')
    return toLineEdge(row)
  }
}
