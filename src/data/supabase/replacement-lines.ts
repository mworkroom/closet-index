import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ReplacementLegacyLink,
  ReplacementLegacyLinkDecision,
  ReplacementLegacyLinkReviewInput,
  ReplacementLineSnapshot,
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
        'id,item_a_id,item_b_id,review_status,review_decision,review_reason,reviewed_at',
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
      'review_closet_replacement_legacy_link',
      {
        p_workspace_id: this.workspaceId,
        p_link_id: linkId,
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
}
