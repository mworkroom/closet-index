import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  CLOSET_IMAGE_BUCKET,
  downloadItemImageBlobs,
  loadReadyImageAssets,
} from './image-assets'

function query(result: { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (
    resolve: (value: typeof result) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject)
  return builder
}

describe('loadReadyImageAssets', () => {
  it('loads ready cutout metadata without signing or downloading every image', async () => {
    const from = vi.fn(() =>
      query({
        data: [
          {
            id: 'image-1',
            item_id: 'item-1',
            storage_path: 'workspace/items/item-1/cutout/image-1.webp',
            width_px: 800,
            height_px: 1200,
          },
        ],
        error: null,
      }),
    )
    const storageFrom = vi.fn()
    const client = {
      from,
      storage: { from: storageFrom },
    } as unknown as SupabaseClient

    const result = await loadReadyImageAssets(client, 'workspace')

    expect(from).toHaveBeenCalledWith('closet_item_images')
    expect(result.itemImages.get('item-1')).toEqual({
      id: 'image-1',
      storagePath: 'workspace/items/item-1/cutout/image-1.webp',
      url: null,
      widthPx: 800,
      heightPx: 1200,
      expiresAt: null,
    })
    expect(storageFrom).not.toHaveBeenCalled()
  })
})

describe('downloadItemImageBlobs', () => {
  it('downloads each unique visible path once from the private bucket', async () => {
    const download = vi.fn(async (path: string) => ({
      data: new Blob([path], { type: 'image/webp' }),
      error: null,
    }))
    const storageFrom = vi.fn(() => ({ download }))
    const client = {
      storage: { from: storageFrom },
    } as unknown as SupabaseClient

    const result = await downloadItemImageBlobs(client, [
      'one.webp',
      'one.webp',
      'two.webp',
    ])

    expect(storageFrom).toHaveBeenCalledWith(CLOSET_IMAGE_BUCKET)
    expect(download).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledWith('one.webp')
    expect(download).toHaveBeenCalledWith('two.webp')
    expect([...result.keys()]).toEqual(['one.webp', 'two.webp'])
  })

  it('keeps successful visible images when another download fails', async () => {
    const download = vi.fn(async (path: string) =>
      path === 'bad.webp'
        ? { data: null, error: new Error('download failed') }
        : { data: new Blob([path]), error: null },
    )
    const client = {
      storage: { from: vi.fn(() => ({ download })) },
    } as unknown as SupabaseClient

    const result = await downloadItemImageBlobs(client, [
      'good.webp',
      'bad.webp',
    ])

    expect([...result.keys()]).toEqual(['good.webp'])
  })
})
