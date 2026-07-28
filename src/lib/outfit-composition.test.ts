import { describe, expect, it } from 'vitest'
import { composeOutfitLayers } from './outfit-composition'
import type { ImageAsset, Item, Outfit } from './types'

const image: ImageAsset = {
  id: 'image',
  storagePath: 'test.webp',
  url: 'data:image/webp;base64,test',
  widthPx: 100,
  heightPx: 100,
  expiresAt: null,
}

function item(
  id: string,
  category: string,
  widthPx = 100,
  heightPx = 100,
): Item {
  return {
    id,
    name: id,
    category,
    semanticColor: null,
    displayHex: '#000000',
    seasons: [],
    retired: false,
    rainOk: false,
    longWalkOk: false,
    memo: null,
    acquiredOn: null,
    image: { ...image, widthPx, heightPx },
  }
}

describe('browser outfit composition v4', () => {
  it('keeps bag on top and innerwear between outer and bottom', () => {
    const items = [
      item('bag', 'Bags'),
      item('outer', 'Outer-Cardigan'),
      item('innerwear', 'Top-T-shirts-innerwear'),
      item('bottom', 'Bottom-Skirts'),
      item('shoes', 'Shoes'),
    ]
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: 'favorite',
      itemIds: items.map((entry) => entry.id),
    }

    expect(
      composeOutfitLayers(outfit, items).map((layer) => [
        layer.item.id,
        layer.zIndex,
      ]),
    ).toEqual([
      ['shoes', 20],
      ['bottom', 30],
      ['innerwear', 40],
      ['outer', 60],
      ['bag', 80],
    ])
  })

  it('moves Top-T-shirts to the right and bottom only when an outer exists', () => {
    const tee = item('tee', 'Top-T-shirts', 1108, 1213)
    const outer = item('outer', 'Outer-Jacket', 1028, 1147)
    const withOuter: Outfit = {
      id: 'with-outer',
      displayName: null,
      rating: null,
      itemIds: [tee.id, outer.id],
    }
    const withoutOuter: Outfit = {
      id: 'without-outer',
      displayName: null,
      rating: null,
      itemIds: [tee.id],
    }

    const sideTee = composeOutfitLayers(withOuter, [tee, outer]).find(
      (layer) => layer.item.id === tee.id,
    )
    const mainTee = composeOutfitLayers(withoutOuter, [tee]).find(
      (layer) => layer.item.id === tee.id,
    )

    expect(sideTee).toMatchObject({ zIndex: 0 })
    expect(mainTee).toMatchObject({ zIndex: 50 })
    expect(sideTee!.width).toBeLessThan(mainTee!.width)
    expect(mainTee!.height).toBeCloseTo(440)
  })

  it('normalizes portrait outerwear against the approved visible-height cap', () => {
    const cardigan = item('cardigan', 'Outer-Cardigan', 1600, 916)
    const jacket = item('jacket', 'Outer-Jacket', 1028, 1147)
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [cardigan.id, jacket.id],
    }

    const layers = composeOutfitLayers(outfit, [cardigan, jacket])
    const cardiganLayer = layers.find((layer) => layer.item.id === cardigan.id)!
    const jacketLayer = layers.find((layer) => layer.item.id === jacket.id)!

    expect(cardiganLayer.width).toBeCloseTo(620)
    expect(cardiganLayer.height).toBeCloseTo(354.95, 1)
    expect(jacketLayer.height).toBeCloseTo(500)
    expect(jacketLayer.width).toBeCloseTo(448.13, 1)
  })

  it('keeps a default gap between the hem and shoes without removing saved offsets', () => {
    const skirt = item('skirt', 'Bottom-Skirts', 621, 1219)
    const shoes = item('shoes', 'Shoes', 900, 1200)
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [skirt.id, shoes.id],
      itemPlacements: [
        {
          itemId: skirt.id,
          slot: null,
          positionX: 0,
          positionY: -8,
          itemScale: null,
          zIndex: null,
        },
      ],
    }

    const layers = composeOutfitLayers(outfit, [skirt, shoes])
    const skirtLayer = layers.find((layer) => layer.item.id === skirt.id)!
    const shoesLayer = layers.find((layer) => layer.item.id === shoes.id)!

    expect(shoesLayer.top - (skirtLayer.top + skirtLayer.height)).toBeCloseTo(24)
  })

  it('uses the tighter default hem gap and the reduced shoe baseline', () => {
    const skirt = item('skirt', 'Bottom-Skirts', 621, 1219)
    const shoes = item('shoes', 'Shoes')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [skirt.id, shoes.id],
    }

    const layers = composeOutfitLayers(outfit, [skirt, shoes])
    const skirtLayer = layers.find((layer) => layer.item.id === skirt.id)!
    const shoesLayer = layers.find((layer) => layer.item.id === shoes.id)!

    expect(shoesLayer.width).toBeCloseTo(148.43)
    expect(shoesLayer.height).toBeCloseTo(148.43)
    expect(shoesLayer.top + shoesLayer.height).toBeCloseTo(1123)
    expect(shoesLayer.top - (skirtLayer.top + skirtLayer.height)).toBeCloseTo(16)
  })

  it('moves the top-layer bag 40px toward the main column', () => {
    const bag = item('bag', 'Bags')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [bag.id],
    }

    const bagLayer = composeOutfitLayers(outfit, [bag])[0]
    expect(bagLayer.left).toBeCloseTo(579.6)
    expect(bagLayer.left + bagLayer.width / 2).toBeCloseTo(685)
    expect(bagLayer.zIndex).toBe(80)
  })

  it('applies saved 4px position offsets without changing size', () => {
    const skirt = item('skirt', 'Bottom-Skirts')
    const base: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [skirt.id],
    }
    const moved: Outfit = {
      ...base,
      itemPlacements: [
        {
          itemId: skirt.id,
          slot: null,
          positionX: 8,
          positionY: -12,
          itemScale: null,
          zIndex: null,
        },
      ],
    }

    const originalLayer = composeOutfitLayers(base, [skirt])[0]
    const movedLayer = composeOutfitLayers(moved, [skirt])[0]
    expect(movedLayer).toMatchObject({
      left: originalLayer.left + 8,
      top: originalLayer.top - 12,
      width: originalLayer.width,
      height: originalLayer.height,
    })
  })

  it('applies the saved item scale without changing the slot anchor', () => {
    const outer = item('outer', 'Outer-Cardigan', 100, 100)
    const base: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [outer.id],
    }
    const resized: Outfit = {
      ...base,
      itemPlacements: [
        {
          itemId: outer.id,
          slot: null,
          positionX: 0,
          positionY: 0,
          itemScale: 1.1,
          zIndex: null,
        },
      ],
    }

    const originalLayer = composeOutfitLayers(base, [outer])[0]
    const resizedLayer = composeOutfitLayers(resized, [outer])[0]
    expect(resizedLayer).toMatchObject({
      top: originalLayer.top,
      width: originalLayer.width * 1.1,
      height: originalLayer.height * 1.1,
    })
    expect(resizedLayer.left + resizedLayer.width / 2).toBeCloseTo(
      originalLayer.left + originalLayer.width / 2,
    )
  })
})
