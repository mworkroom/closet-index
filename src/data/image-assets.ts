import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, ImageAsset } from '../lib/types'

export const CLOSET_IMAGE_BUCKET = 'closet-images'
export const SIGNED_IMAGE_URL_EXPIRES_IN_SECONDS = 60 * 60
export const SIGNED_IMAGE_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const SIGNED_IMAGE_URL_MIN_REFRESH_DELAY_MS = 60 * 1000

const SIGNED_URL_BATCH_SIZE = 100

interface ItemImageRow {
  id: string
  item_id: string
  storage_path: string
  width_px: number | null
  height_px: number | null
}

interface SignedUrlResult {
  error: string | null
  path: string | null
  signedUrl: string | null
}

export interface SignedUrlBucket {
  createSignedUrls(
    paths: string[],
    expiresIn: number,
  ): Promise<
    | { data: SignedUrlResult[]; error: null }
    | { data: null; error: unknown }
  >
}

interface CachedSignedUrl {
  url: string
  expiresAtMs: number
}

export interface ResolvedSignedUrl {
  url: string
  expiresAt: string
}

export interface ReadyImageAssets {
  itemImages: Map<string, ImageAsset>
}

function batches<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

export class SignedImageUrlCache {
  private readonly cache = new Map<string, CachedSignedUrl>()

  async resolve(
    bucket: SignedUrlBucket,
    paths: string[],
    nowMs = Date.now(),
  ): Promise<Map<string, ResolvedSignedUrl>> {
    const uniquePaths = [...new Set(paths.filter(Boolean))]
    const resolved = new Map<string, ResolvedSignedUrl>()
    const pathsToSign: string[] = []

    for (const path of uniquePaths) {
      const cached = this.cache.get(path)
      if (cached && cached.expiresAtMs > nowMs) {
        resolved.set(path, {
          url: cached.url,
          expiresAt: new Date(cached.expiresAtMs).toISOString(),
        })
      }
      if (
        !cached ||
        cached.expiresAtMs - nowMs <= SIGNED_IMAGE_URL_REFRESH_BUFFER_MS
      ) {
        pathsToSign.push(path)
      }
    }

    const responses = await Promise.all(
      batches(pathsToSign, SIGNED_URL_BATCH_SIZE).map(async (batch) => {
        try {
          return await bucket.createSignedUrls(
            batch,
            SIGNED_IMAGE_URL_EXPIRES_IN_SECONDS,
          )
        } catch {
          return { data: null, error: new Error('signed URL request failed') }
        }
      }),
    )
    const expiresAtMs =
      nowMs + SIGNED_IMAGE_URL_EXPIRES_IN_SECONDS * 1000

    for (const response of responses) {
      if (response.error || !response.data) continue

      for (const entry of response.data) {
        if (entry.error || !entry.path || !entry.signedUrl) continue
        const cached = { url: entry.signedUrl, expiresAtMs }
        this.cache.set(entry.path, cached)
        resolved.set(entry.path, {
          url: cached.url,
          expiresAt: new Date(cached.expiresAtMs).toISOString(),
        })
      }
    }

    return resolved
  }
}

export function emptyReadyImageAssets(): ReadyImageAssets {
  return {
    itemImages: new Map(),
  }
}

async function safeRows<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  try {
    const result = await query
    return result.error ? [] : (result.data ?? [])
  } catch {
    return []
  }
}

export async function loadReadyImageAssets(
  client: SupabaseClient,
  workspaceId: string,
  cache: SignedImageUrlCache,
): Promise<ReadyImageAssets> {
  const itemQuery = client
    .from('closet_item_images')
    .select('id,item_id,storage_path,width_px,height_px')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ready')
    .eq('variant', 'cutout')

  const itemRows = await safeRows<ItemImageRow>(itemQuery)
  const paths = itemRows.map((row) => row.storage_path)

  let signedUrls = new Map<string, ResolvedSignedUrl>()
  if (paths.length > 0) {
    try {
      signedUrls = await cache.resolve(
        client.storage.from(CLOSET_IMAGE_BUCKET),
        paths,
      )
    } catch {
      signedUrls = new Map()
    }
  }

  const itemImages = new Map<string, ImageAsset>()
  for (const row of itemRows) {
    const signed = signedUrls.get(row.storage_path)
    if (!signed) continue
    itemImages.set(row.item_id, {
      id: row.id,
      storagePath: row.storage_path,
      url: signed.url,
      widthPx: row.width_px,
      heightPx: row.height_px,
      expiresAt: signed.expiresAt,
    })
  }

  return { itemImages }
}

export function getImageRefreshDelay(
  data: AppData,
  nowMs = Date.now(),
): number | null {
  const expiryTimes = [
    ...data.items.map((item) => item.image?.expiresAt),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)

  if (expiryTimes.length === 0) return null

  const refreshAt =
    Math.min(...expiryTimes) - SIGNED_IMAGE_URL_REFRESH_BUFFER_MS
  return Math.max(
    refreshAt - nowMs,
    SIGNED_IMAGE_URL_MIN_REFRESH_DELAY_MS,
  )
}
