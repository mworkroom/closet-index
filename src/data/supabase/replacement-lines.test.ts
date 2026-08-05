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
          color_category: null,
          review_status: 'ready',
          lifecycle_status: 'active',
          representative_line_id: null,
          archived_at: null,
          updated_at: '2026-08-03T00:00:00Z',
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
          colorCategory: null,
          reviewStatus: 'ready',
          lifecycleStatus: 'active',
          representativeLineId: null,
          archivedAt: null,
          updatedAt: '2026-08-03T00:00:00Z',
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

  it('keeps Line reads working during the short pre-color-migration deployment window', async () => {
    const lineEq = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '42703',
          message: 'column closet_replacement_lines.color_category does not exist',
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'line-a',
            name: 'Daily Tee',
            style_identity: 'Daily Uniform',
            review_status: 'ready',
            lifecycle_status: 'active',
            representative_line_id: null,
            archived_at: null,
            updated_at: '2026-08-03T00:00:00Z',
          },
        ],
        error: null,
      })
    const membershipEq = vi.fn(async () => ({ data: [], error: null }))
    const lineSelect = vi.fn(() => ({ eq: lineEq }))
    const client = {
      from: vi.fn((table: string) => ({
        select:
          table === 'closet_replacement_lines'
            ? lineSelect
            : vi.fn(() => ({ eq: membershipEq })),
      })),
    } as unknown as SupabaseClient

    const repository = new SupabaseReplacementLineRepository(
      client,
      'workspace-a',
    )

    await expect(repository.load()).resolves.toMatchObject({
      lines: [{ id: 'line-a', colorCategory: null }],
    })
    expect(lineSelect).toHaveBeenCalledTimes(2)
    expect(lineSelect).toHaveBeenNthCalledWith(
      2,
      'id,name,style_identity,review_status,lifecycle_status,representative_line_id,archived_at,updated_at',
    )
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
            updated_at: '2026-08-03T00:00:00Z',
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
        updated_at: '2026-08-03T00:01:00Z',
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
        updatedAt: '2026-08-03T00:00:00Z',
      },
    ])
    expect(builder.eq).toHaveBeenCalledWith('workspace_id', 'workspace-a')

    await expect(
      repository.reviewLegacyLink('link-a', {
        decision: 'a_to_b',
        reason: 'A 다음 B',
        expectedUpdatedAt: '2026-08-03T00:00:00Z',
      }),
    ).resolves.toMatchObject({
      id: 'link-a',
      reviewStatus: 'reviewed',
      reviewDecision: 'a_to_b',
    })
    expect(rpc).toHaveBeenCalledWith(
      'revise_closet_replacement_legacy_link',
      {
        p_workspace_id: 'workspace-a',
        p_link_id: 'link-a',
        p_expected_updated_at: '2026-08-03T00:00:00Z',
        p_decision: 'a_to_b',
        p_reason: 'A 다음 B',
      },
    )
  })

  it('loads edges by workspace and confirms a batch through one RPC call', async () => {
    const edgeRow = {
      id: 'edge-a',
      replacement_line_id: 'line-a',
      predecessor_item_id: 'item-a',
      successor_item_id: 'item-b',
      source_legacy_link_id: 'link-a',
      source_kind: 'legacy_link',
      branch_name: null,
      decision_reason: 'A 다음 B',
      status: 'confirmed',
      confirmed_at: '2026-08-03T01:00:00Z',
      updated_at: '2026-08-03T01:00:00Z',
    }
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.order = vi
      .fn()
      .mockReturnValueOnce(builder)
      .mockResolvedValueOnce({ data: [edgeRow], error: null })
    const rpc = vi.fn(async () => ({ data: [edgeRow], error: null }))
    const client = {
      from: vi.fn(() => builder),
      rpc,
    } as unknown as SupabaseClient
    const repository = new SupabaseReplacementLineRepository(client, 'workspace-a')

    await expect(repository.loadEdges()).resolves.toEqual([
      {
        id: 'edge-a',
        replacementLineId: 'line-a',
        predecessorItemId: 'item-a',
        successorItemId: 'item-b',
        sourceLegacyLinkId: 'link-a',
        sourceKind: 'legacy_link',
        branchName: null,
        decisionReason: 'A 다음 B',
        status: 'confirmed',
        confirmedAt: '2026-08-03T01:00:00Z',
        updatedAt: '2026-08-03T01:00:00Z',
      },
    ])
    expect(builder.eq).toHaveBeenCalledWith('workspace_id', 'workspace-a')

    await expect(
      repository.confirmEdges([
        {
          replacementLineId: 'line-a',
          sourceLegacyLinkId: 'link-a',
          expectedLegacyUpdatedAt: '2026-08-03T00:00:00Z',
          branchName: null,
          decisionReason: 'A 다음 B',
        },
      ]),
    ).resolves.toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('confirm_closet_replacement_line_edges', {
      p_workspace_id: 'workspace-a',
      p_candidates: [
        {
          replacement_line_id: 'line-a',
          source_legacy_link_id: 'link-a',
          expected_legacy_updated_at: '2026-08-03T00:00:00Z',
          branch_name: null,
          decision_reason: 'A 다음 B',
        },
      ],
    })

    await expect(
      repository.updateEdgeDetails('edge-a', {
        expectedUpdatedAt: '2026-08-03T01:00:00Z',
        branchName: '박시 핏 계열',
        decisionReason: '핏과 레이어드 균형이 더 좋음',
      }),
    ).resolves.toMatchObject({ id: 'edge-a' })
    expect(rpc).toHaveBeenCalledWith(
      'revise_closet_replacement_line_edge_details',
      {
        p_workspace_id: 'workspace-a',
        p_edge_id: 'edge-a',
        p_expected_updated_at: '2026-08-03T01:00:00Z',
        p_branch_name: '박시 핏 계열',
        p_decision_reason: '핏과 레이어드 균형이 더 좋음',
      },
    )

    await expect(
      repository.updateEdgeConnection('edge-a', {
        expectedUpdatedAt: '2026-08-03T01:00:00Z',
        predecessorItemId: 'item-c',
        branchName: '여름 계열',
        decisionReason: '계승 👑',
      }),
    ).resolves.toMatchObject({ id: 'edge-a' })
    expect(rpc).toHaveBeenCalledWith(
      'update_closet_replacement_line_edge_connection',
      {
        p_workspace_id: 'workspace-a',
        p_edge_id: 'edge-a',
        p_expected_updated_at: '2026-08-03T01:00:00Z',
        p_predecessor_item_id: 'item-c',
        p_branch_name: '여름 계열',
        p_decision_reason: '계승 👑',
      },
    )

    await expect(
      repository.disconnectEdge('edge-a', {
        expectedUpdatedAt: '2026-08-03T01:00:00Z',
      }),
    ).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'disconnect_closet_replacement_line_edge',
      {
        p_workspace_id: 'workspace-a',
        p_edge_id: 'edge-a',
        p_expected_updated_at: '2026-08-03T01:00:00Z',
      },
    )

    await expect(
      repository.reverseEdge('edge-a', {
        expectedUpdatedAt: '2026-08-03T01:00:00Z',
      }),
    ).resolves.toMatchObject({ id: 'edge-a' })
    expect(rpc).toHaveBeenCalledWith('reverse_closet_replacement_line_edge', {
      p_workspace_id: 'workspace-a',
      p_edge_id: 'edge-a',
      p_expected_updated_at: '2026-08-03T01:00:00Z',
    })

    await expect(
      repository.setStart('line-a', 'item-a', true),
    ).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('set_closet_replacement_line_start', {
      p_workspace_id: 'workspace-a',
      p_replacement_line_id: 'line-a',
      p_item_id: 'item-a',
      p_is_start: true,
    })

    await expect(
      repository.createManualEdge({
        replacementLineId: 'line-a',
        predecessorItemId: 'item-a',
        successorItemId: 'item-b',
        branchName: null,
        decisionReason: '단순 교체',
      }),
    ).resolves.toMatchObject({ id: 'edge-a' })
    expect(rpc).toHaveBeenCalledWith(
      'create_closet_replacement_manual_edge',
      {
        p_workspace_id: 'workspace-a',
        p_replacement_line_id: 'line-a',
        p_predecessor_item_id: 'item-a',
        p_successor_item_id: 'item-b',
        p_branch_name: null,
        p_decision_reason: '단순 교체',
      },
    )
  })

  it('moves an Item through the atomic Line management RPC', async () => {
    const movedRow = {
      id: 'line-new',
      name: 'Ivory Summer Cardigan',
      style_identity: 'Summer Layer',
      color_category: null,
      review_status: 'needs_review',
      lifecycle_status: 'active',
      representative_line_id: null,
      archived_at: null,
      updated_at: '2026-08-05T00:00:00Z',
    }
    const rpc = vi.fn(async () => ({ data: movedRow, error: null }))
    const repository = new SupabaseReplacementLineRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-a',
    )

    await expect(
      repository.moveItem({
        sourceLineId: 'line-a',
        itemId: 'item-a',
        targetLineId: null,
        newLineName: 'Ivory Summer Cardigan',
        newLineStyleIdentity: 'Summer Layer',
        expectedSourceUpdatedAt: '2026-08-04T00:00:00Z',
        expectedTargetUpdatedAt: null,
      }),
    ).resolves.toEqual({
      id: 'line-new',
      name: 'Ivory Summer Cardigan',
      styleIdentity: 'Summer Layer',
      colorCategory: null,
      reviewStatus: 'needs_review',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-05T00:00:00Z',
    })
    expect(rpc).toHaveBeenCalledWith('move_closet_replacement_line_item', {
      p_workspace_id: 'workspace-a',
      p_source_line_id: 'line-a',
      p_item_id: 'item-a',
      p_target_line_id: null,
      p_new_line_name: 'Ivory Summer Cardigan',
      p_new_line_style_identity: 'Summer Layer',
      p_expected_source_updated_at: '2026-08-04T00:00:00Z',
      p_expected_target_updated_at: null,
    })
  })

  it('merges and archives Lines only through lifecycle RPCs', async () => {
    const targetRow = {
      id: 'line-b',
      name: 'Ivory Layered',
      style_identity: 'Layered',
      review_status: 'needs_review',
      lifecycle_status: 'active',
      representative_line_id: null,
      archived_at: null,
      updated_at: '2026-08-05T01:00:00Z',
    }
    const archivedRow = {
      ...targetRow,
      lifecycle_status: 'archived',
      archived_at: '2026-08-05T02:00:00Z',
      updated_at: '2026-08-05T02:00:00Z',
    }
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: targetRow, error: null })
      .mockResolvedValueOnce({ data: archivedRow, error: null })
    const repository = new SupabaseReplacementLineRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-a',
    )

    await expect(
      repository.mergeLines({
        sourceLineId: 'line-a',
        targetLineId: 'line-b',
        expectedSourceUpdatedAt: '2026-08-05T00:00:00Z',
        expectedTargetUpdatedAt: '2026-08-05T00:00:00Z',
      }),
    ).resolves.toMatchObject({
      id: 'line-b',
      lifecycleStatus: 'active',
      reviewStatus: 'needs_review',
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'merge_closet_replacement_lines', {
      p_workspace_id: 'workspace-a',
      p_source_line_id: 'line-a',
      p_target_line_id: 'line-b',
      p_expected_source_updated_at: '2026-08-05T00:00:00Z',
      p_expected_target_updated_at: '2026-08-05T00:00:00Z',
    })

    await expect(
      repository.setArchived({
        lineId: 'line-b',
        archived: true,
        expectedUpdatedAt: '2026-08-05T01:00:00Z',
      }),
    ).resolves.toMatchObject({
      id: 'line-b',
      lifecycleStatus: 'archived',
      archivedAt: '2026-08-05T02:00:00Z',
    })
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'set_closet_replacement_line_archived',
      {
        p_workspace_id: 'workspace-a',
        p_line_id: 'line-b',
        p_archived: true,
        p_expected_updated_at: '2026-08-05T01:00:00Z',
      },
    )
  })

  it('sets a human-selected color category through an optimistic RPC', async () => {
    const savedRow = {
      id: 'line-a',
      name: 'Layered Top',
      style_identity: 'Layered',
      color_category: 'Ivory',
      review_status: 'ready',
      lifecycle_status: 'active',
      representative_line_id: null,
      archived_at: null,
      updated_at: '2026-08-05T03:00:00Z',
    }
    const rpc = vi.fn(async () => ({ data: savedRow, error: null }))
    const repository = new SupabaseReplacementLineRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-a',
    )

    await expect(
      repository.setColorCategory({
        lineId: 'line-a',
        colorCategory: 'Ivory',
        expectedUpdatedAt: '2026-08-05T02:00:00Z',
      }),
    ).resolves.toMatchObject({
      id: 'line-a',
      colorCategory: 'Ivory',
      updatedAt: '2026-08-05T03:00:00Z',
    })
    expect(rpc).toHaveBeenCalledWith(
      'set_closet_replacement_line_color_category',
      {
        p_workspace_id: 'workspace-a',
        p_line_id: 'line-a',
        p_expected_updated_at: '2026-08-05T02:00:00Z',
        p_color_category: 'Ivory',
      },
    )
  })

  it('completes review, updates details, and deletes an empty Line through explicit RPCs', async () => {
    const baseRow = {
      id: 'line-a',
      name: 'Brown Bottom',
      style_identity: null,
      color_category: 'Brown',
      review_status: 'needs_review',
      lifecycle_status: 'active',
      representative_line_id: null,
      archived_at: null,
      updated_at: '2026-08-05T03:00:00Z',
    }
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ...baseRow, review_status: 'ready', updated_at: '2026-08-05T04:00:00Z' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...baseRow,
          name: 'Brown Bottom Summer',
          style_identity: 'Summer Bottom',
          review_status: 'ready',
          updated_at: '2026-08-05T05:00:00Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
    const repository = new SupabaseReplacementLineRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-a',
    )

    await expect(
      repository.acknowledgeReview({
        lineId: 'line-a',
        expectedUpdatedAt: '2026-08-05T03:00:00Z',
      }),
    ).resolves.toMatchObject({ reviewStatus: 'ready' })
    await expect(
      repository.updateDetails({
        lineId: 'line-a',
        name: 'Brown Bottom Summer',
        styleIdentity: 'Summer Bottom',
        expectedUpdatedAt: '2026-08-05T04:00:00Z',
      }),
    ).resolves.toMatchObject({
      name: 'Brown Bottom Summer',
      styleIdentity: 'Summer Bottom',
    })
    await expect(
      repository.deleteEmpty({
        lineId: 'line-a',
        expectedUpdatedAt: '2026-08-05T05:00:00Z',
      }),
    ).resolves.toBe(true)

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'acknowledge_closet_replacement_line_review',
      {
        p_workspace_id: 'workspace-a',
        p_line_id: 'line-a',
        p_expected_updated_at: '2026-08-05T03:00:00Z',
      },
    )
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'update_closet_replacement_line_details',
      {
        p_workspace_id: 'workspace-a',
        p_line_id: 'line-a',
        p_expected_updated_at: '2026-08-05T04:00:00Z',
        p_name: 'Brown Bottom Summer',
        p_style_identity: 'Summer Bottom',
      },
    )
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      'delete_empty_closet_replacement_line',
      {
        p_workspace_id: 'workspace-a',
        p_line_id: 'line-a',
        p_expected_updated_at: '2026-08-05T05:00:00Z',
      },
    )
  })

  it('adds an unassigned Item and removes it from every Line through membership RPCs', async () => {
    const baseRow = {
      id: 'line-a',
      name: 'Brown Bottom',
      style_identity: null,
      color_category: 'Brown',
      review_status: 'needs_review',
      lifecycle_status: 'active',
      representative_line_id: null,
      archived_at: null,
      updated_at: '2026-08-05T06:00:00Z',
    }
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: baseRow, error: null })
      .mockResolvedValueOnce({
        data: [
          baseRow,
          { ...baseRow, id: 'line-legacy', name: 'Legacy Brown Bottom' },
        ],
        error: null,
      })
    const repository = new SupabaseReplacementLineRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-a',
    )

    await expect(
      repository.addItem({
        lineId: 'line-a',
        itemId: 'item-a',
        expectedUpdatedAt: '2026-08-05T05:00:00Z',
      }),
    ).resolves.toMatchObject({ id: 'line-a', reviewStatus: 'needs_review' })
    await expect(
      repository.removeItem({
        sourceLineId: 'line-a',
        itemId: 'item-a',
        expectedSourceUpdatedAt: '2026-08-05T06:00:00Z',
      }),
    ).resolves.toHaveLength(2)

    expect(rpc).toHaveBeenNthCalledWith(1, 'add_closet_replacement_line_item', {
      p_workspace_id: 'workspace-a',
      p_line_id: 'line-a',
      p_item_id: 'item-a',
      p_expected_updated_at: '2026-08-05T05:00:00Z',
    })
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'remove_closet_replacement_line_item',
      {
        p_workspace_id: 'workspace-a',
        p_source_line_id: 'line-a',
        p_item_id: 'item-a',
        p_expected_source_updated_at: '2026-08-05T06:00:00Z',
      },
    )
  })
})

describe('SupabaseReplacementLineRepository Line creation', () => {
  it('creates an empty Line through the authenticated workspace RPC', async () => {
    const savedRow = {
      id: 'line-new',
      name: 'Brown Bottom Spring',
      style_identity: 'Brown Bottom',
      color_category: 'Brown',
      review_status: 'ready',
      lifecycle_status: 'active',
      representative_line_id: null,
      archived_at: null,
      updated_at: '2026-08-05T06:00:00Z',
    }
    const rpc = vi.fn(async () => ({ data: savedRow, error: null }))
    const repository = new SupabaseReplacementLineRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-a',
    )

    await expect(
      repository.create({
        name: 'Brown Bottom Spring',
        styleIdentity: 'Brown Bottom',
        colorCategory: 'Brown',
      }),
    ).resolves.toEqual({
      id: 'line-new',
      name: 'Brown Bottom Spring',
      styleIdentity: 'Brown Bottom',
      colorCategory: 'Brown',
      reviewStatus: 'ready',
      lifecycleStatus: 'active',
      representativeLineId: null,
      archivedAt: null,
      updatedAt: '2026-08-05T06:00:00Z',
    })
    expect(rpc).toHaveBeenCalledWith('create_closet_replacement_line', {
      p_workspace_id: 'workspace-a',
      p_name: 'Brown Bottom Spring',
      p_style_identity: 'Brown Bottom',
      p_color_category: 'Brown',
    })
  })
})
