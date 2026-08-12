import { useRef } from 'react'
import { useLazyImageAssets } from '../context/ImageAssetsContext'
import type { Item } from '../lib/types'
import { AssetImage } from './AssetImage'
import { Swatch } from './Swatch'

export function ItemVisual({
  item,
  className = '',
}: {
  item: Item
  className?: string
}) {
  const visualRef = useRef<HTMLDivElement>(null)
  const resolvedImages = useLazyImageAssets([item.image], visualRef)
  const resolvedImage = item.image
    ? resolvedImages.get(item.image.storagePath) ?? null
    : null

  return (
    <div ref={visualRef} className={`item-visual ${className}`.trim()}>
      <AssetImage
        asset={resolvedImage}
        alt={`${item.name} 아이템 이미지`}
        className="item-visual__image"
        fallback={
          <div className="item-visual__fallback">
            <Swatch
              color={item.displayHex}
              label={item.semanticColor ?? item.name}
              size="large"
            />
          </div>
        }
      />
    </div>
  )
}
