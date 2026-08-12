import { useRef } from 'react'
import { useLazyImageAssets } from '../context/ImageAssetsContext'
import type { Item, Outfit } from '../lib/types'
import {
  composeOutfitLayers,
  OUTFIT_COMPOSITION_CANVAS,
} from '../lib/outfit-composition'
import { outfitLabel } from '../lib/outfits'

interface LayeredOutfitPreviewProps {
  outfit: Outfit
  items: Item[]
  className?: string
  loading?: 'eager' | 'lazy'
}

export function LayeredOutfitPreview({
  outfit,
  items,
  className = '',
  loading = 'eager',
}: LayeredOutfitPreviewProps) {
  const layers = composeOutfitLayers(outfit, items)
  const label = outfitLabel(outfit, items)
  const previewRef = useRef<HTMLDivElement>(null)
  const resolvedImages = useLazyImageAssets(
    layers.map((layer) => layer.item.image),
    previewRef,
    loading,
  )

  return (
    <div
      ref={previewRef}
      className={`layered-outfit-preview ${className}`.trim()}
      role="img"
      aria-label={`${label} 조정 가능한 착장 미리보기`}
    >
      {layers.map((layer) => {
        const source = resolvedImages.get(layer.item.image!.storagePath)?.url
        return source ? (
          <img
            key={layer.item.id}
            src={source}
            alt=""
            loading={loading}
            draggable={false}
            style={{
              left: `${(layer.left / OUTFIT_COMPOSITION_CANVAS.width) * 100}%`,
              top: `${(layer.top / OUTFIT_COMPOSITION_CANVAS.height) * 100}%`,
              width: `${(layer.width / OUTFIT_COMPOSITION_CANVAS.width) * 100}%`,
              height: `${(layer.height / OUTFIT_COMPOSITION_CANVAS.height) * 100}%`,
              zIndex: layer.zIndex,
              objectPosition: layer.objectPosition,
              objectFit: layer.objectFit,
            }}
          />
        ) : null
      })}
    </div>
  )
}
