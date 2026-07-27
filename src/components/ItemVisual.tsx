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
  return (
    <div className={`item-visual ${className}`.trim()}>
      <AssetImage
        asset={item.image}
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
