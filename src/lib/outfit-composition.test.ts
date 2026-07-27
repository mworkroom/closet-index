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

function item(id: string, category: string): Item {
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
    image,
  }
}

describe('browser outfit composition v2', () => {
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
    const tee = item('tee', 'Top-T-shirts')
    const outer = item('outer', 'Outer-Jacket')
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

    expect(sideTee).toMatchObject({ zIndex: 0, left: 590.5, width: 279 })
    expect(mainTee).toMatchObject({ zIndex: 50, left: 116.5, width: 527 })
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
})
