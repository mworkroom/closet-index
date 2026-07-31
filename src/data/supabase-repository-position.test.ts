import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabase-repository'

describe('SupabaseRepository outfit item placement updates', () => {
  it('updates display mode, position, and scale within the scoped relation key', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['update', 'eq', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.maybeSingle = vi.fn(async () => ({
      data: {
        outfit_id: 'outfit',
        item_id: 'item',
        slot: 'top',
        position_x: 8,
        position_y: -12,
        scale: 1.05,
        z_index: 0,
      },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    await repository.updateOutfitItemPlacement({
      outfitId: 'outfit',
      itemId: 'item',
      slot: 'top',
      positionX: 8,
      positionY: -12,
      itemScale: 1.05,
      zIndex: 0,
    })

    expect(client.from).toHaveBeenCalledWith('closet_outfit_items')
    expect(builder.update).toHaveBeenCalledWith({
      slot: 'top',
      position_x: 8,
      position_y: -12,
      scale: 1.05,
      z_index: 0,
    })
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'workspace_id', 'workspace')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'outfit_id', 'outfit')
    expect(builder.eq).toHaveBeenNthCalledWith(3, 'item_id', 'item')
  })
})
