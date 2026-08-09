import { describe, expect, it } from 'vitest'
import {
  composeOutfitLayers,
  getOutfitItemPlacementDefaults,
} from './outfit-composition'
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

describe('browser outfit composition v5', () => {
  it('uses the shared scarf position and sock placement defaults', () => {
    expect(
      getOutfitItemPlacementDefaults(item('scarf', 'Acc-Neck'), false),
    ).toMatchObject({
      positionY: 144,
      itemScale: 1,
    })
    expect(
      getOutfitItemPlacementDefaults(item('socks', 'Socks'), false),
    ).toMatchObject({
      positionY: 28,
      itemScale: 1.5,
    })
    expect(
      getOutfitItemPlacementDefaults(item('waist', 'Acc-Waist'), false),
    ).toEqual({
      positionX: -100,
      positionY: 0,
      itemScale: 0.7,
    })
  })

  it('uses approved coat and median adjusted vest scale defaults', () => {
    expect(
      getOutfitItemPlacementDefaults(item('coat', 'Outer-Coat'), false),
    ).toMatchObject({ itemScale: 1.5 })
    expect(
      getOutfitItemPlacementDefaults(item('vest', 'Outer-Vest'), false),
    ).toMatchObject({ itemScale: 0.75 })
    expect(
      getOutfitItemPlacementDefaults(
        item('made-vest', 'Outer-Vest-made'),
        false,
      ),
    ).toMatchObject({ itemScale: 0.75 })
  })

  it('uses the approved placement for every separated T-shirt', () => {
    const expected = {
      positionX: -100,
      positionY: 64,
      itemScale: 0.9,
    }

    expect(
      getOutfitItemPlacementDefaults(
        item('tee', 'Top-T-shirts'),
        true,
        'side',
      ),
    ).toEqual(expected)
    expect(
      getOutfitItemPlacementDefaults(
        item('innerwear', 'Top-T-shirts-innerwear'),
        true,
        'side',
      ),
    ).toEqual(expected)
  })

  it('keeps a manually adjusted separated T-shirt scale', () => {
    const tee = item('tee', 'Top-T-shirts', 1108, 1213)
    const outer = item('outer', 'Outer-Jacket', 1028, 1147)
    const outfit: Outfit = {
      id: 'manually-scaled-side-tee',
      displayName: null,
      rating: null,
      itemIds: [tee.id, outer.id],
      itemPlacements: [
        {
          itemId: tee.id,
          slot: 'top',
          positionX: -100,
          positionY: 64,
          itemScale: 1,
          zIndex: 0,
        },
      ],
    }

    const sideTee = composeOutfitLayers(outfit, [tee, outer]).find(
      (layer) => layer.item.id === tee.id,
    )!
    const defaultSideTee = composeOutfitLayers(
      { ...outfit, itemPlacements: undefined },
      [tee, outer],
    ).find((layer) => layer.item.id === tee.id)!

    expect(sideTee.width).toBeGreaterThan(defaultSideTee.width)
    expect(sideTee.width / defaultSideTee.width).toBeCloseTo(1 / 0.9)
  })

  it('places a waist accessory over the top and bottom without changing its ratio', () => {
    const waist = item('waist', 'Acc-Waist', 672, 704)
    const top = item('top', 'Top-T-shirts')
    const bottom = item('bottom', 'Bottom-Skirts')
    const outfit: Outfit = {
      id: 'waist-outfit',
      displayName: null,
      rating: null,
      itemIds: [top.id, bottom.id, waist.id],
      itemPlacements: [
        {
          itemId: waist.id,
          slot: null,
          positionX: -100,
          positionY: 16,
          itemScale: 0.7,
          zIndex: null,
        },
      ],
    }

    const layers = composeOutfitLayers(outfit, [top, bottom, waist])
    const waistLayer = layers.find((layer) => layer.item.id === waist.id)!

    expect(waistLayer).toMatchObject({
      left: 200,
      top: 516,
      width: 420,
      height: 440,
      zIndex: 55,
      objectFit: 'contain',
    })
    expect(layers.map((layer) => layer.item.id)).toEqual([
      'bottom',
      'top',
      'waist',
    ])
  })

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
    expect(mainTee!.height).toBeCloseTo(396)
    expect(mainTee!.top).toBeCloseTo(202)
  })

  it('lets one outfit override a T-shirt from automatic side placement to inside the outer', () => {
    const tee = item('tee', 'Top-T-shirts', 1108, 1213)
    const outer = item('outer', 'Outer-Jacket', 1028, 1147)
    const automatic: Outfit = {
      id: 'automatic',
      displayName: null,
      rating: null,
      itemIds: [tee.id, outer.id],
    }
    const inside: Outfit = {
      ...automatic,
      id: 'inside',
      itemPlacements: [
        {
          itemId: tee.id,
          slot: 'top',
          positionX: null,
          positionY: null,
          itemScale: null,
          zIndex: 50,
        },
      ],
    }

    const automaticTee = composeOutfitLayers(automatic, [tee, outer]).find(
      (layer) => layer.item.id === tee.id,
    )!
    const insideTee = composeOutfitLayers(inside, [tee, outer]).find(
      (layer) => layer.item.id === tee.id,
    )!

    expect(automaticTee.zIndex).toBe(0)
    expect(insideTee.zIndex).toBe(50)
    expect(insideTee.width).toBeGreaterThan(automaticTee.width)
    expect(insideTee.left).toBeLessThan(automaticTee.left)
  })

  it('lets one outfit separate innerwear to the side without changing its category', () => {
    const innerwear = item(
      'innerwear',
      'Top-T-shirts-innerwear',
      1108,
      1213,
    )
    const outer = item('outer', 'Outer-Jacket', 1028, 1147)
    const automatic: Outfit = {
      id: 'automatic',
      displayName: null,
      rating: null,
      itemIds: [innerwear.id, outer.id],
    }
    const side: Outfit = {
      ...automatic,
      id: 'side',
      itemPlacements: [
        {
          itemId: innerwear.id,
          slot: 'top',
          positionX: null,
          positionY: null,
          itemScale: null,
          zIndex: 0,
        },
      ],
    }

    const automaticInnerwear = composeOutfitLayers(automatic, [
      innerwear,
      outer,
    ]).find((layer) => layer.item.id === innerwear.id)!
    const sideInnerwear = composeOutfitLayers(side, [
      innerwear,
      outer,
    ]).find((layer) => layer.item.id === innerwear.id)!

    expect(automaticInnerwear.zIndex).toBe(40)
    expect(sideInnerwear.zIndex).toBe(0)
    expect(sideInnerwear.left).toBeGreaterThan(automaticInnerwear.left)
    expect(sideInnerwear.left).toBeCloseTo(504.45)
    expect(sideInnerwear.top).toBeCloseTo(234)
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

    expect(cardiganLayer.width).toBeCloseTo(558)
    expect(cardiganLayer.height).toBeCloseTo(319.45, 1)
    expect(cardiganLayer.top).toBeCloseTo(202)
    expect(jacketLayer.height).toBeCloseTo(450)
    expect(jacketLayer.width).toBeCloseTo(403.31, 1)
    expect(jacketLayer.top).toBeCloseTo(202)
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

    expect(shoesLayer.top - (skirtLayer.top + skirtLayer.height)).toBeCloseTo(4)
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

    expect(shoesLayer.width).toBeCloseTo(131.94)
    expect(shoesLayer.height).toBeCloseTo(131.94)
    expect(shoesLayer.top + shoesLayer.height).toBeCloseTo(1103)
    expect(shoesLayer.top - (skirtLayer.top + skirtLayer.height)).toBeCloseTo(-4)
  })

  it('uses the 100% and left-shifted bag baseline', () => {
    const bag = item('bag', 'Bags')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [bag.id],
    }

    const bagLayer = composeOutfitLayers(outfit, [bag])[0]
    expect(bagLayer.width).toBeCloseTo(210.8)
    expect(bagLayer.left).toBeCloseTo(499.6)
    expect(bagLayer.left + bagLayer.width / 2).toBeCloseTo(605)
    expect(bagLayer.zIndex).toBe(80)
  })

  it('places a second bag below, beside, and behind the primary bag', () => {
    const primary = item('primary-bag', 'Bags', 400, 500)
    const secondary = item('secondary-bag', 'Bags-made', 400, 500)
    const outfit: Outfit = {
      id: 'two-bags',
      displayName: null,
      rating: null,
      itemIds: [primary.id, secondary.id],
    }

    const layers = composeOutfitLayers(outfit, [primary, secondary])
    const primaryLayer = layers.find((layer) => layer.item.id === primary.id)!
    const secondaryLayer = layers.find(
      (layer) => layer.item.id === secondary.id,
    )!

    expect(secondaryLayer.top).toBeGreaterThan(primaryLayer.top)
    expect(secondaryLayer.left).toBeGreaterThan(primaryLayer.left)
    expect(secondaryLayer.width).toBeLessThan(primaryLayer.width)
    expect(secondaryLayer.zIndex).toBeLessThan(primaryLayer.zIndex)
    expect(layers.map((layer) => layer.item.id)).toEqual([
      secondary.id,
      primary.id,
    ])
  })

  it('keeps a saved secondary bag position while retaining its secondary slot', () => {
    const primary = item('primary-bag', 'Bags')
    const secondary = item('secondary-bag', 'Bags')
    const outfit: Outfit = {
      id: 'adjusted-two-bags',
      displayName: null,
      rating: null,
      itemIds: [primary.id, secondary.id],
      itemPlacements: [
        {
          itemId: secondary.id,
          slot: 'bag-secondary',
          positionX: 24,
          positionY: -12,
          itemScale: 1.1,
          zIndex: 72,
        },
      ],
    }

    const secondaryLayer = composeOutfitLayers(outfit, [primary, secondary]).find(
      (layer) => layer.item.id === secondary.id,
    )!
    expect(secondaryLayer.zIndex).toBe(72)
    expect(secondaryLayer.left).toBeGreaterThan(600)
    expect(secondaryLayer.top).toBeGreaterThan(500)
  })

  it('keeps the bottom unchanged when only the shoes are resized', () => {
    const skirt = item('skirt', 'Bottom-Skirts', 621, 1219)
    const shoes = item('shoes', 'Shoes')
    const base: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [skirt.id, shoes.id],
    }
    const resizedShoes: Outfit = {
      ...base,
      itemPlacements: [
        {
          itemId: shoes.id,
          slot: null,
          positionX: null,
          positionY: null,
          itemScale: 1.1,
          zIndex: null,
        },
      ],
    }

    const baseLayers = composeOutfitLayers(base, [skirt, shoes])
    const resizedLayers = composeOutfitLayers(resizedShoes, [skirt, shoes])
    const baseSkirt = baseLayers.find((layer) => layer.item.id === skirt.id)!
    const resizedSkirt = resizedLayers.find(
      (layer) => layer.item.id === skirt.id,
    )!
    const baseShoes = baseLayers.find((layer) => layer.item.id === shoes.id)!
    const resizedShoesLayer = resizedLayers.find(
      (layer) => layer.item.id === shoes.id,
    )!

    expect(resizedSkirt).toMatchObject({
      left: baseSkirt.left,
      top: baseSkirt.top,
      width: baseSkirt.width,
      height: baseSkirt.height,
    })
    expect(resizedShoesLayer.width).toBeGreaterThan(baseShoes.width)
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

  it('keeps an explicit saved placement above the learned category defaults', () => {
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
    expect(originalLayer).toMatchObject({
      top: 202,
      width: 450,
      height: 450,
    })
    expect(resizedLayer).toMatchObject({
      top: 150,
      width: 550,
      height: 550,
    })
    expect(resizedLayer.left + resizedLayer.width / 2).toBeCloseTo(
      originalLayer.left + originalLayer.width / 2,
    )
  })
})
