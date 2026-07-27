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
}

export function LayeredOutfitPreview({
  outfit,
  items,
  className = '',
}: LayeredOutfitPreviewProps) {
  const layers = composeOutfitLayers(outfit, items)
  const label = outfitLabel(outfit, items)

  return (
    <div
      className={`layered-outfit-preview ${className}`.trim()}
      role="img"
      aria-label={`${label} 조정 가능한 착장 미리보기`}
    >
      {layers.map((layer) => (
        <img
          key={layer.item.id}
          src={layer.item.image!.url}
          alt=""
          draggable={false}
          style={{
            left: `${(layer.left / OUTFIT_COMPOSITION_CANVAS.width) * 100}%`,
            top: `${(layer.top / OUTFIT_COMPOSITION_CANVAS.height) * 100}%`,
            width: `${(layer.width / OUTFIT_COMPOSITION_CANVAS.width) * 100}%`,
            height: `${(layer.height / OUTFIT_COMPOSITION_CANVAS.height) * 100}%`,
            zIndex: layer.zIndex,
            objectPosition: layer.objectPosition,
          }}
        />
      ))}
    </div>
  )
}
