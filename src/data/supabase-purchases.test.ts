import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabase-repository'

const row = {
  id: 'event-1',
  item_id: 'item-1',
  purchased_on: '2026-08-06',
  quantity: 2,
  created_at: '2026-08-06T00:00:00Z',
  updated_at: '2026-08-06T00:00:00Z',
}

describe('SupabaseRepository P6-2 purchases', () => {
  it('재구매 기록과 저장 후 현재 수량을 원자 RPC에 함께 전달한다', async () => {
    const rpc = vi.fn(async () => ({ data: row, error: null }))
    const repository = new SupabaseRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-1',
    )

    const created = await repository.purchases.create({
      id: 'event-1',
      itemId: 'item-1',
      purchasedOn: '2026-08-06',
      quantity: 2,
      currentQuantity: 4,
    })

    expect(rpc).toHaveBeenCalledWith('create_closet_purchase_event', {
      p_workspace_id: 'workspace-1',
      p_event_id: 'event-1',
      p_item_id: 'item-1',
      p_purchased_on: '2026-08-06',
      p_quantity: 2,
      p_current_quantity: 4,
    })
    expect(created).toEqual({
      id: 'event-1',
      itemId: 'item-1',
      purchasedOn: '2026-08-06',
      quantity: 2,
      createdAt: '2026-08-06T00:00:00Z',
      updatedAt: '2026-08-06T00:00:00Z',
    })
  })

  it('일반 Item 재구매는 현재 수량 미변경을 null로 RPC에 전달한다', async () => {
    const rpc = vi.fn(async () => ({ data: row, error: null }))
    const repository = new SupabaseRepository(
      { rpc } as unknown as SupabaseClient,
      'workspace-1',
    )

    await repository.purchases.create({
      id: 'event-1',
      itemId: 'item-1',
      purchasedOn: '2026-08-06',
      quantity: 2,
      currentQuantity: null,
    })

    expect(rpc).toHaveBeenCalledWith(
      'create_closet_purchase_event',
      expect.objectContaining({ p_current_quantity: null }),
    )
  })

  it('Item별 이력을 최신 날짜·생성 시각·ID 순으로 조회한다', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['select', 'eq', 'order']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.then = vi.fn((resolve) =>
      resolve({ data: [row], error: null }),
    )
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace-1')

    const events = await repository.purchases.load('item-1')

    expect(client.from).toHaveBeenCalledWith('closet_purchase_events')
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'workspace_id', 'workspace-1')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'item_id', 'item-1')
    expect(builder.order).toHaveBeenNthCalledWith(1, 'purchased_on', {
      ascending: false,
    })
    expect(builder.order).toHaveBeenNthCalledWith(2, 'created_at', {
      ascending: false,
    })
    expect(builder.order).toHaveBeenNthCalledWith(3, 'id', {
      ascending: false,
    })
    expect(events).toHaveLength(1)
  })

  it('현재 화면 Item의 구매 사건을 한 query로 일괄 조회한다', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['select', 'eq', 'in', 'order']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.then = vi.fn((resolve) => resolve({ data: [row], error: null }))
    const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace-1')

    await repository.purchases.loadForItems(['item-1', 'item-2'])

    expect(builder.in).toHaveBeenCalledWith('item_id', ['item-1', 'item-2'])
  })

  it('수동 수량 snapshot만 활성 workspace의 Item에 저장한다', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['update', 'eq', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.maybeSingle = vi.fn(async () => ({
      data: { current_quantity: 0 },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace-1')

    const saved = await repository.purchases.setCurrentQuantity({
      itemId: 'item-1',
      currentQuantity: 0,
    })

    expect(client.from).toHaveBeenCalledWith('closet_items')
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ current_quantity: 0 }),
    )
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'workspace_id', 'workspace-1')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'id', 'item-1')
    expect(saved).toBe(0)
  })
})
