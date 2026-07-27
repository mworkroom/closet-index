import type { Item, Outfit } from '../lib/types'
import { outfitLabel } from '../lib/outfits'
import { AssetImage } from './AssetImage'
import { LayeredOutfitPreview } from './LayeredOutfitPreview'
import { Swatch } from './Swatch'

interface OutfitVisualProps {
  outfit: Outfit
  items: Item[]
  className?: string
  maxSwatches?: number
  swatchSize?: 'small' | 'medium' | 'large'
}

export function OutfitVisual({
  outfit,
  items,
  className = '',
  maxSwatches = 5,
  swatchSize = 'large',
}: OutfitVisualProps) {
  const label = outfitLabel(outfit, items)
  const resolvedItems = outfit.itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
  const compositionItems = resolvedItems
    .slice(0, maxSwatches)
  const hasCompleteCutoutSet =
    outfit.itemIds.length > 0 &&
    resolvedItems.length === outfit.itemIds.length &&
    resolvedItems.every((item) => Boolean(item.image))

  return (
    <div className={`outfit-visual ${className}`.trim()}>
      {hasCompleteCutoutSet ? (
        <LayeredOutfitPreview
          outfit={outfit}
          items={items}
          className="outfit-visual__layered"
        />
      ) : (
        <AssetImage
          asset={outfit.preview}
          alt={`${label} 착장 미리보기`}
          className="outfit-visual__image"
          fallback={
            <div
              className="outfit-visual__fallback"
              aria-label={`${label} 구성 아이템 색상`}
            >
              {compositionItems.map((item) => (
                <Swatch
                  key={item.id}
                  color={item.displayHex}
                  label={item.semanticColor ?? item.name}
                  size={swatchSize}
                />
              ))}
            </div>
          }
        />
      )}
    </div>
  )
}
