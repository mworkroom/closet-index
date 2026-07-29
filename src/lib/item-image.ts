import type { ItemImageUploadInput } from './types'

export const ITEM_IMAGE_TARGET_MAX_BYTES = 500 * 1024
export const ITEM_IMAGE_HARD_MAX_BYTES = 700 * 1024
export const ITEM_IMAGE_SOURCE_MAX_BYTES = 10 * 1024 * 1024

const allowedTypes = new Set(['image/png', 'image/webp'])
const encodingCandidates = [
  { maxDimension: 1600, quality: 0.9 },
  { maxDimension: 1600, quality: 0.8 },
  { maxDimension: 1400, quality: 0.74 },
  { maxDimension: 1200, quality: 0.68 },
  { maxDimension: 1000, quality: 0.6 },
  { maxDimension: 900, quality: 0.52 },
]

export interface AlphaBounds {
  left: number
  top: number
  right: number
  bottom: number
  hasTransparentPixel: boolean
}

export interface PreparedItemCutout extends ItemImageUploadInput {
  warning: string | null
}

export function inspectAlphaBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 10,
): AlphaBounds | null {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  let hasTransparentPixel = false

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3]
      if (alpha < 255) hasTransparentPixel = true
      if (alpha <= threshold) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < left || bottom < top) return null
  return { left, top, right, bottom, hasTransparentPixel }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지를 WebP로 변환하지 못했습니다.'))
          return
        }
        resolve(blob)
      },
      type,
      quality,
    )
  })
}

function outputSize(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
) {
  const sourceLongSide = Math.max(sourceWidth, sourceHeight)
  const marginAtSource = Math.max(2, Math.round(sourceLongSide * 0.025))
  const scale = Math.min(
    1,
    (maxDimension - marginAtSource * 2) / sourceLongSide,
  )
  const margin = Math.max(2, Math.round(marginAtSource * scale))
  return {
    width: Math.max(1, Math.round(sourceWidth * scale) + margin * 2),
    height: Math.max(1, Math.round(sourceHeight * scale) + margin * 2),
    margin,
  }
}

export async function prepareItemCutout(
  file: File,
): Promise<PreparedItemCutout> {
  if (!allowedTypes.has(file.type)) {
    throw new Error('투명 배경 PNG 또는 WebP 파일을 선택해 주세요.')
  }
  if (file.size < 1 || file.size > ITEM_IMAGE_SOURCE_MAX_BYTES) {
    throw new Error('입력 이미지는 10MB 이하여야 합니다.')
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('이 브라우저에서는 이미지 변환을 지원하지 않습니다.')
  }

  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  })
  try {
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = bitmap.width
    sourceCanvas.height = bitmap.height
    const sourceContext = sourceCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!sourceContext) {
      throw new Error('이미지 검사 화면을 만들 수 없습니다.')
    }
    sourceContext.drawImage(bitmap, 0, 0)
    const imageData = sourceContext.getImageData(
      0,
      0,
      bitmap.width,
      bitmap.height,
    )
    const bounds = inspectAlphaBounds(
      imageData.data,
      bitmap.width,
      bitmap.height,
    )
    if (!bounds) throw new Error('투명 영역뿐인 이미지는 사용할 수 없습니다.')
    if (!bounds.hasTransparentPixel) {
      throw new Error(
        '배경이 투명하지 않습니다. 누끼 PNG 또는 WebP를 선택해 주세요.',
      )
    }

    const sourceWidth = bounds.right - bounds.left + 1
    const sourceHeight = bounds.bottom - bounds.top + 1
    let selected:
      | { blob: Blob; widthPx: number; heightPx: number }
      | undefined

    for (const candidate of encodingCandidates) {
      const size = outputSize(
        sourceWidth,
        sourceHeight,
        candidate.maxDimension,
      )
      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = size.width
      outputCanvas.height = size.height
      const outputContext = outputCanvas.getContext('2d')
      if (!outputContext) {
        throw new Error('이미지 변환 화면을 만들 수 없습니다.')
      }
      outputContext.drawImage(
        sourceCanvas,
        bounds.left,
        bounds.top,
        sourceWidth,
        sourceHeight,
        size.margin,
        size.margin,
        size.width - size.margin * 2,
        size.height - size.margin * 2,
      )
      const blob = await canvasBlob(
        outputCanvas,
        'image/webp',
        candidate.quality,
      )
      if (blob.type !== 'image/webp') {
        throw new Error('이 브라우저에서는 WebP 변환을 지원하지 않습니다.')
      }
      selected = {
        blob,
        widthPx: size.width,
        heightPx: size.height,
      }
      if (blob.size <= ITEM_IMAGE_TARGET_MAX_BYTES) break
    }

    if (!selected || selected.blob.size > ITEM_IMAGE_HARD_MAX_BYTES) {
      throw new Error('자동 최적화 후에도 이미지가 700KB를 초과합니다.')
    }

    return {
      ...selected,
      bytes: selected.blob.size,
      warning:
        selected.blob.size > ITEM_IMAGE_TARGET_MAX_BYTES
          ? '500KB 목표를 초과하지만 700KB 제한 이내로 저장할 수 있습니다.'
          : null,
    }
  } finally {
    bitmap.close()
  }
}
