import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { AppData } from '../lib/types'
import {
  getImageRefreshDelay,
  loadReadyImageAssets,
  SIGNED_IMAGE_URL_REFRESH_BUFFER_MS,
  SignedImageUrlCache,
  type SignedUrlBucket,
} from './image-assets'

function signedBucket() {
  return {
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({
        error: null,
        path,
        signedUrl: `https://project.supabase.co/storage/v1/object/sign/closet-images/${path}?token=test`,
      })),
      error: null,
    })),
  } satisfies SignedUrlBucket
}

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

function imageClient(
  itemResult: { data: unknown[] | null; error: unknown },
  bucket: SignedUrlBucket,
) {
  return {
    from: vi.fn(() => query(itemResult)),
    storage: { from: vi.fn(() => bucket) },
  } as unknown as SupabaseClient
}

describe('SignedImageUrlCache', () => {
  it('같은 경로를 중복 서명하지 않고 만료 5분 전에만 갱신한다', async () => {
    const bucket = signedBucket()
    const cache = new SignedImageUrlCache()

    await cache.resolve(bucket, ['one.webp', 'one.webp'], 0)
    await cache.resolve(bucket, ['one.webp'], 10 * 60 * 1000)
    await cache.resolve(bucket, ['one.webp'], 55 * 60 * 1000)

    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(2)
    expect(bucket.createSignedUrls).toHaveBeenNthCalledWith(1, ['one.webp'], 3600)
  })
})

describe('loadReadyImageAssets', () => {
  it('ready Item cutout만 조회하고 서명한다', async () => {
    const bucket = signedBucket()
    const client = imageClient(
      {
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
      },
      bucket,
    )

    const result = await loadReadyImageAssets(
      client,
      'workspace',
      new SignedImageUrlCache(),
    )

    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('closet_item_images')
    expect(result.itemImages.get('item-1')).toMatchObject({
      id: 'image-1',
      widthPx: 800,
      heightPx: 1200,
    })
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(
      ['workspace/items/item-1/cutout/image-1.webp'],
      3600,
    )
  })

  it('Storage 서명이 실패하면 예외 대신 빈 이미지 결과를 돌려준다', async () => {
    const bucket: SignedUrlBucket = {
      createSignedUrls: vi.fn(async () => ({
        data: null,
        error: new Error('signing failed'),
      })),
    }
    const client = imageClient(
      {
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
      },
      bucket,
    )

    await expect(
      loadReadyImageAssets(client, 'workspace', new SignedImageUrlCache()),
    ).resolves.toEqual({ itemImages: new Map() })
  })
})

describe('getImageRefreshDelay', () => {
  it('가장 먼저 만료되는 Item signed URL보다 5분 먼저 갱신한다', () => {
    const now = Date.parse('2026-07-27T00:00:00.000Z')
    const data = {
      items: [
        {
          image: {
            expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
          },
        },
      ],
      outfits: [],
    } as unknown as AppData

    expect(getImageRefreshDelay(data, now)).toBe(
      60 * 60 * 1000 - SIGNED_IMAGE_URL_REFRESH_BUFFER_MS,
    )
  })
})
