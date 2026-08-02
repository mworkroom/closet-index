import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseReplacementLineRepository } from './replacement-lines'

describe('SupabaseReplacementLineRepository', () => {
  it('loads only the active workspace through two read-only SELECT queries', async () => {
    const lineEq = vi.fn(async () => ({
      data: [
        {
          id: 'line-a',
          name: 'Daily Tee',
          style_identity: 'Daily Uniform',
        },
      ],
      error: null,
    }))
    const membershipEq = vi.fn(async () => ({
      data: [{ replacement_line_id: 'line-a', item_id: 'item-a' }],
      error: null,
    }))
    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq:
            table === 'closet_replacement_lines'
              ? lineEq
              : membershipEq,
        })),
      })),
    } as unknown as SupabaseClient

    const repository = new SupabaseReplacementLineRepository(
      client,
      'workspace-a',
    )

    await expect(repository.load()).resolves.toEqual({
      lines: [
        {
          id: 'line-a',
          name: 'Daily Tee',
          styleIdentity: 'Daily Uniform',
        },
      ],
      memberships: [{ replacementLineId: 'line-a', itemId: 'item-a' }],
    })
    expect(client.from).toHaveBeenNthCalledWith(1, 'closet_replacement_lines')
    expect(client.from).toHaveBeenNthCalledWith(
      2,
      'closet_replacement_line_items',
    )
    expect(lineEq).toHaveBeenCalledWith('workspace_id', 'workspace-a')
    expect(membershipEq).toHaveBeenCalledWith('workspace_id', 'workspace-a')
  })

  it('loads workspace-scoped Legacy Links and confirms reviews only through RPC', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.order = vi
      .fn()
      .mockReturnValueOnce(builder)
      .mockReturnValueOnce(builder)
      .mockResolvedValueOnce({
        data: [
          {
            id: 'link-a',
            item_a_id: 'item-a',
            item_b_id: 'item-b',
            review_status: 'pending',
            review_decision: null,
            review_reason: null,
            reviewed_at: null,
          },
        ],
        error: null,
      })
    const rpc = vi.fn(async () => ({
      data: {
        id: 'link-a',
        item_a_id: 'item-a',
        item_b_id: 'item-b',
        review_status: 'reviewed',
        review_decision: 'a_to_b',
        review_reason: 'A 다음 B',
        reviewed_at: '2026-08-03T00:00:00Z',
      },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
      rpc,
    } as unknown as SupabaseClient
    const repository = new SupabaseReplacementLineRepository(
      client,
      'workspace-a',
    )

    await expect(repository.loadLegacyLinks()).resolves.toEqual([
      {
        id: 'link-a',
        itemAId: 'item-a',
        itemBId: 'item-b',
        reviewStatus: 'pending',
        reviewDecision: null,
        reviewReason: null,
        reviewedAt: null,
      },
    ])
    expect(builder.eq).toHaveBeenCalledWith('workspace_id', 'workspace-a')

    await expect(
      repository.reviewLegacyLink('link-a', {
        decision: 'a_to_b',
        reason: 'A 다음 B',
      }),
    ).resolves.toMatchObject({
      id: 'link-a',
      reviewStatus: 'reviewed',
      reviewDecision: 'a_to_b',
    })
    expect(rpc).toHaveBeenCalledWith(
      'review_closet_replacement_legacy_link',
      {
        p_workspace_id: 'workspace-a',
        p_link_id: 'link-a',
        p_decision: 'a_to_b',
        p_reason: 'A 다음 B',
      },
    )
  })
})
