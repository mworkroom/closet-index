import type { Item, Outfit, OutfitPreviewUploadInput } from './types'
import {
  composeOutfitLayers,
  OUTFIT_COMPOSITION_CANVAS,
  OUTFIT_COMPOSITION_VERSION,
} from './outfit-composition'

export const OUTFIT_PREVIEW_MAX_BYTES = 700 * 1024
export const OUTFIT_PREVIEW_BACKGROUND = '#f3f2ef'

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== 'image/webp') {
          reject(new Error('착장 미리보기를 WebP로 변환하지 못했습니다.'))
          return
        }
        resolve(blob)
      },
      'image/webp',
      quality,
    )
  })
}

function fingerprintPayload(outfit: Outfit, items: Item[]) {
  return {
    compositionVersion: OUTFIT_COMPOSITION_VERSION,
    outfitId: outfit.id,
    items: outfit.itemIds.map((itemId) => {
      const item = items.find((entry) => entry.id === itemId)
      const placement = outfit.itemPlacements?.find(
        (entry) => entry.itemId === itemId,
      )
      return {
        itemId,
        category: item?.category ?? null,
        imageId: item?.image?.id ?? null,
        imageWidth: item?.image?.widthPx ?? null,
        imageHeight: item?.image?.heightPx ?? null,
        slot: placement?.slot ?? null,
        positionX: placement?.positionX ?? null,
        positionY: placement?.positionY ?? null,
        itemScale: placement?.itemScale ?? null,
        zIndex: placement?.zIndex ?? null,
      }
    }),
  }
}

export async function getOutfitPreviewFingerprint(
  outfit: Outfit,
  items: Item[],
): Promise<string> {
  const payload = new TextEncoder().encode(
    JSON.stringify(fingerprintPayload(outfit, items)),
  )
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function loadBitmap(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('착장에 필요한 누끼 이미지를 불러오지 못했습니다.')
  }
  return createImageBitmap(await response.blob())
}

export async function prepareOutfitPreview(
  outfit: Outfit,
  items: Item[],
): Promise<OutfitPreviewUploadInput> {
  const resolvedItems = outfit.itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item))
  if (
    resolvedItems.length !== outfit.itemIds.length ||
    resolvedItems.some((item) => !item.image)
  ) {
    throw new Error('모든 구성 Item에 누끼 이미지가 있어야 preview를 만들 수 있습니다.')
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('이 브라우저에서는 착장 preview 생성을 지원하지 않습니다.')
  }

  const layers = composeOutfitLayers(outfit, items)
  const bitmaps = await Promise.all(
    layers.map((layer) => loadBitmap(layer.item.image!.url)),
  )
  try {
    const canvas = document.createElement('canvas')
    canvas.width = OUTFIT_COMPOSITION_CANVAS.width
    canvas.height = OUTFIT_COMPOSITION_CANVAS.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('착장 preview 화면을 만들 수 없습니다.')

    context.fillStyle = OUTFIT_PREVIEW_BACKGROUND
    context.fillRect(0, 0, canvas.width, canvas.height)
    layers.forEach((layer, index) => {
      context.drawImage(
        bitmaps[index],
        layer.left,
        layer.top,
        layer.width,
        layer.height,
      )
    })

    let blob: Blob | null = null
    for (const quality of [0.9, 0.82, 0.74, 0.66]) {
      blob = await canvasBlob(canvas, quality)
      if (blob.size <= OUTFIT_PREVIEW_MAX_BYTES) break
    }
    if (!blob || blob.size > OUTFIT_PREVIEW_MAX_BYTES) {
      throw new Error('최적화 후에도 착장 preview가 700KB를 초과합니다.')
    }

    return {
      blob,
      widthPx: canvas.width,
      heightPx: canvas.height,
      bytes: blob.size,
      sourceFingerprint: await getOutfitPreviewFingerprint(outfit, items),
    }
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close())
  }
}
