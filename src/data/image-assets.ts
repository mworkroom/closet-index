import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImageAsset } from '../lib/types'

export const CLOSET_IMAGE_BUCKET = 'closet-images'
const IMAGE_DOWNLOAD_BATCH_SIZE = 8

interface ItemImageRow {
  id: string
  item_id: string
  storage_path: string
  width_px: number | null
  height_px: number | null
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
): Promise<ReadyImageAssets> {
  const itemQuery = client
    .from('closet_item_images')
    .select('id,item_id,storage_path,width_px,height_px')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ready')
    .eq('variant', 'cutout')

  const itemRows = await safeRows<ItemImageRow>(itemQuery)
  const itemImages = new Map<string, ImageAsset>()
  for (const row of itemRows) {
    itemImages.set(row.item_id, {
      id: row.id,
      storagePath: row.storage_path,
      url: null,
      widthPx: row.width_px,
      heightPx: row.height_px,
      expiresAt: null,
    })
  }

  return { itemImages }
}

export async function downloadItemImageBlobs(
  client: SupabaseClient,
  storagePaths: string[],
): Promise<Map<string, Blob>> {
  const bucket = client.storage.from(CLOSET_IMAGE_BUCKET)
  const uniquePaths = [...new Set(storagePaths.filter(Boolean))]
  const downloaded = new Map<string, Blob>()

  for (const batch of batches(uniquePaths, IMAGE_DOWNLOAD_BATCH_SIZE)) {
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          const result = await bucket.download(path)
          return { path, ...result }
        } catch (error) {
          return { path, data: null, error }
        }
      }),
    )

    for (const result of results) {
      if (!result.error && result.data) downloaded.set(result.path, result.data)
    }
  }

  return downloaded
}
