import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseRepository } from './supabase-repository'

describe('SupabaseRepository Phase 3 writes', () => {
  it('creates an Item with the client UUID and direct fallback HEX', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['insert', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.single = vi.fn(async () => ({
      data: {
        id: 'item-new',
        name: '새 재킷',
        category: 'Outer-Jacket',
        semantic_color: 'Navy',
        seasons: ['Spring', 'Fall'],
        retired: false,
        rain_ok: true,
        long_walk_ok: true,
        memo: null,
        acquired_on: null,
        display_hex: '#293A5B',
        color_palette: null,
      },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    const item = await repository.createItem({
      id: 'item-new',
      name: ' 새 재킷 ',
      category: ' Outer-Jacket ',
      semanticColor: ' Navy ',
      paletteId: null,
      displayHex: '#293a5b',
      seasons: ['Spring', 'Fall'],
      rainOk: true,
      longWalkOk: true,
      memo: null,
      acquiredOn: null,
    })

    expect(builder.insert).toHaveBeenCalledWith({
      id: 'item-new',
      workspace_id: 'workspace',
      name: '새 재킷',
      category: 'Outer-Jacket',
      semantic_color: 'Navy',
      palette_id: null,
      display_hex: '#293A5B',
      seasons: ['Spring', 'Fall'],
      rain_ok: true,
      long_walk_ok: true,
      memo: null,
      acquired_on: null,
    })
    expect(item).toMatchObject({
      id: 'item-new',
      displayHex: '#293A5B',
      retired: false,
      image: null,
    })
  })

  it('creates Outfit and relations through one RPC payload', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: 'outfit-new',
        display_name: '새 착장',
        rating: null,
        archived_at: null,
      },
      error: null,
    }))
    const client = { rpc } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    const outfit = await repository.createOutfit({
      id: 'outfit-new',
      displayName: ' 새 착장 ',
      allowDuplicate: false,
      items: [
        {
          itemId: 'item-a',
          slot: 'top',
          sortOrder: 0,
          positionX: 0,
          positionY: -12,
          itemScale: 0.9,
          zIndex: 20,
        },
      ],
    })

    expect(rpc).toHaveBeenCalledWith('create_closet_outfit', {
      p_workspace_id: 'workspace',
      p_outfit_id: 'outfit-new',
      p_display_name: '새 착장',
      p_items: [
        {
          item_id: 'item-a',
          slot: 'top',
          sort_order: 0,
          position_x: 0,
          position_y: -12,
          item_scale: 0.9,
          z_index: 20,
        },
      ],
      p_allow_duplicate: false,
    })
    expect(outfit).toMatchObject({
      id: 'outfit-new',
      rating: null,
      archivedAt: null,
      itemIds: ['item-a'],
    })
  })

  it('asks the database for exact Item-set matches in the active workspace', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          id: 'outfit-existing',
          display_name: null,
          rating: 'ok',
          archived_at: null,
        },
      ],
      error: null,
    }))
    const client = { rpc } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    const matches = await repository.findMatchingOutfits(['item-b', 'item-a'])

    expect(rpc).toHaveBeenCalledWith('find_matching_closet_outfits', {
      p_workspace_id: 'workspace',
      p_item_ids: ['item-b', 'item-a'],
    })
    expect(matches).toEqual([
      {
        id: 'outfit-existing',
        displayName: null,
        rating: 'ok',
        archivedAt: null,
      },
    ])
  })

  it('changes only the lifecycle fields when retiring an Item', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['update', 'eq', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.maybeSingle = vi.fn(async () => ({
      data: { id: 'item-existing' },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    await repository.setItemRetired('item-existing', true)

    expect(client.from).toHaveBeenCalledWith('closet_items')
    expect(builder.update).toHaveBeenCalledWith({
      retired: true,
      updated_at: expect.any(String),
    })
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'id', 'item-existing')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'workspace_id', 'workspace')
  })

  it('archives an Outfit through the workspace-scoped lifecycle fields', async () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['update', 'eq', 'select']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.maybeSingle = vi.fn(async () => ({
      data: { id: 'outfit-existing' },
      error: null,
    }))
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    await repository.setOutfitArchived('outfit-existing', true)

    expect(client.from).toHaveBeenCalledWith('closet_outfits')
    expect(builder.update).toHaveBeenCalledWith({
      archived_at: expect.any(String),
      updated_at: expect.any(String),
    })
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'id', 'outfit-existing')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'workspace_id', 'workspace')
  })

  it('updates an existing Outfit and its relations through one RPC payload', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: 'outfit-existing',
        display_name: '수정 착장',
        rating: 'good',
        archived_at: null,
      },
      error: null,
    }))
    const repository = new SupabaseRepository({ rpc } as unknown as SupabaseClient, 'workspace')

    const outfit = await repository.updateOutfit('outfit-existing', {
      displayName: ' 수정 착장 ',
      allowDuplicate: false,
      items: [{
        itemId: 'item-coat', slot: 'outer', sortOrder: 0,
        positionX: 0, positionY: 0, itemScale: 1, zIndex: 50,
      }],
    })

    expect(rpc).toHaveBeenCalledWith('update_closet_outfit', {
      p_workspace_id: 'workspace',
      p_outfit_id: 'outfit-existing',
      p_display_name: '수정 착장',
      p_items: [{
        item_id: 'item-coat', slot: 'outer', sort_order: 0,
        position_x: 0, position_y: 0, item_scale: 1, z_index: 50,
      }],
      p_allow_duplicate: false,
    })
    expect(outfit).toMatchObject({
      id: 'outfit-existing', rating: 'good', itemIds: ['item-coat'],
    })
  })

  it('routes Item and Outfit deletion through authenticated cleanup functions', async () => {
    const invoke = vi.fn(async () => ({ data: { deleted: true }, error: null }))
    const client = { functions: { invoke } } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')

    await repository.deleteItem('item-existing')
    await repository.deleteOutfit('outfit-existing')

    expect(invoke).toHaveBeenNthCalledWith(1, 'closet-item-image', {
      body: {
        action: 'delete',
        workspaceId: 'workspace',
        itemId: 'item-existing',
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'closet-outfit-preview', {
      body: {
        action: 'delete',
        workspaceId: 'workspace',
        outfitId: 'outfit-existing',
      },
    })
  })

  it('uploads an optimized cutout with a signed ticket and finalizes it', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          imageId: 'image-new',
          storagePath: 'workspace/items/item/cutout/image-new.webp',
          token: 'signed-token',
          contentType: 'image/webp',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { imageId: 'image-new' }, error: null })
    const uploadToSignedUrl = vi.fn(async () => ({
      data: { path: 'workspace/items/item/cutout/image-new.webp' },
      error: null,
    }))
    const client = {
      functions: { invoke },
      storage: {
        from: vi.fn(() => ({ uploadToSignedUrl })),
      },
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')
    const blob = new Blob(['webp'], { type: 'image/webp' })

    await repository.replaceItemImage('item', {
      blob,
      widthPx: 800,
      heightPx: 1200,
      bytes: blob.size,
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'closet-item-image', {
      body: {
        action: 'begin',
        workspaceId: 'workspace',
        itemId: 'item',
        widthPx: 800,
        heightPx: 1200,
        bytes: blob.size,
      },
    })
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      'workspace/items/item/cutout/image-new.webp',
      'signed-token',
      blob,
      {
        contentType: 'image/webp',
        cacheControl: '31536000',
      },
    )
    expect(invoke).toHaveBeenNthCalledWith(2, 'closet-item-image', {
      body: {
        action: 'finalize',
        workspaceId: 'workspace',
        itemId: 'item',
        imageId: 'image-new',
      },
    })
  })

  it('uploads a versioned Outfit preview and finalizes it without upsert', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          previewId: 'preview-new',
          storagePath: 'workspace/outfits/outfit/preview/v2.webp',
          compositionVersion: 2,
          token: 'signed-token',
          contentType: 'image/webp',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { previewId: 'preview-new' }, error: null })
    const uploadToSignedUrl = vi.fn(async () => ({
      data: { path: 'workspace/outfits/outfit/preview/v2.webp' },
      error: null,
    }))
    const client = {
      functions: { invoke },
      storage: { from: vi.fn(() => ({ uploadToSignedUrl })) },
    } as unknown as SupabaseClient
    const repository = new SupabaseRepository(client, 'workspace')
    const blob = new Blob(['webp'], { type: 'image/webp' })
    const sourceFingerprint = 'a'.repeat(64)

    await repository.replaceOutfitPreview('outfit', {
      blob,
      widthPx: 900,
      heightPx: 1200,
      bytes: blob.size,
      sourceFingerprint,
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'closet-outfit-preview', {
      body: {
        action: 'begin',
        workspaceId: 'workspace',
        outfitId: 'outfit',
        widthPx: 900,
        heightPx: 1200,
        bytes: blob.size,
        sourceFingerprint,
      },
    })
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      'workspace/outfits/outfit/preview/v2.webp',
      'signed-token',
      blob,
      { contentType: 'image/webp', cacheControl: '31536000' },
    )
    expect(invoke).toHaveBeenNthCalledWith(2, 'closet-outfit-preview', {
      body: {
        action: 'finalize',
        workspaceId: 'workspace',
        outfitId: 'outfit',
        previewId: 'preview-new',
      },
    })
  })
})
