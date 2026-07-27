import compositionConfig from '../data/outfit-composition.v4.json'
import type { Item, Outfit, OutfitItemPlacement } from './types'

type Slot = (typeof compositionConfig.slots)[keyof typeof compositionConfig.slots]
type CategoryRule = (typeof compositionConfig.categoryRules)[number]

const slotAliases: Record<string, keyof typeof compositionConfig.slots> = {
  outer: 'main-upper',
  top: 'main-upper',
  inner: 'main-innerwear',
  bottom: 'main-bottom',
  dress: 'main-dress',
  shoes: 'main-shoes',
  bag: 'side-bag',
  socks: 'main-socks',
  accessory: 'main-neck',
}

export interface OutfitCompositionLayer {
  item: Item
  left: number
  top: number
  width: number
  height: number
  zIndex: number
  objectPosition: string
}

function matchesCategory(rule: CategoryRule, category: string) {
  return rule.match === 'exact'
    ? category === rule.value
    : category.startsWith(rule.value)
}

function conditionalNumber(
  rule: CategoryRule,
  key: 'zIndex' | 'visualScale' | 'visualHeight',
  hasOuter: boolean,
) {
  const values = rule as unknown as Record<string, unknown>
  const conditionalKey = `${key}${hasOuter ? 'WhenOuter' : 'WithoutOuter'}`
  const conditionalValue = values[conditionalKey]
  if (typeof conditionalValue === 'number') return conditionalValue
  const value = values[key]
  return typeof value === 'number' ? value : undefined
}

function resolveRule(item: Item, hasOuter: boolean) {
  const rule = compositionConfig.categoryRules.find((candidate) =>
    matchesCategory(candidate, item.category),
  )
  if (!rule) return null

  const conditionalSlot = hasOuter ? 'slotWhenOuter' : 'slotWithoutOuter'
  const slot =
    ('slot' in rule ? rule.slot : undefined) ??
    (conditionalSlot in rule
      ? (rule[conditionalSlot] as keyof typeof compositionConfig.slots)
      : undefined)

  if (!slot) return null
  return {
    slot,
    zIndex: conditionalNumber(rule, 'zIndex', hasOuter) ?? 0,
    visualScale: conditionalNumber(rule, 'visualScale', hasOuter) ?? 1,
    visualHeight: conditionalNumber(rule, 'visualHeight', hasOuter),
  }
}

function placementFor(outfit: Outfit, itemId: string): OutfitItemPlacement | null {
  return (
    outfit.itemPlacements?.find((placement) => placement.itemId === itemId) ??
    null
  )
}

function positionForSlot(slot: Slot, width: number, height: number) {
  const left = slot.x + (slot.width - width) / 2
  if (slot.anchor === 'bottom') {
    return {
      left,
      top: slot.y + slot.height - height,
      objectPosition: 'center bottom',
    }
  }
  if (slot.anchor === 'center') {
    return {
      left,
      top: slot.y + (slot.height - height) / 2,
      objectPosition: 'center center',
    }
  }
  return { left, top: slot.y, objectPosition: 'center top' }
}

function fitInside(
  sourceWidth: number | null,
  sourceHeight: number | null,
  targetWidth: number,
  targetHeight: number,
) {
  if (
    !sourceWidth ||
    !sourceHeight ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return { width: targetWidth, height: targetHeight }
  }

  const scale = Math.min(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  )
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  }
}

interface ResolvedLayer extends OutfitCompositionLayer {
  slotName: keyof typeof compositionConfig.slots
  positionX: number
  positionY: number
}

function applyHemToShoesGap(layers: ResolvedLayer[]) {
  const gap = compositionConfig.relationships.hemToShoesGap
  const shoes = layers.find((layer) => layer.slotName === 'main-shoes')
  if (!shoes) return

  const maximumHemBottom = shoes.top - gap
  for (const layer of layers) {
    if (
      layer.slotName !== 'main-bottom' &&
      layer.slotName !== 'main-dress'
    ) {
      continue
    }
    const hemBottom = layer.top + layer.height
    if (hemBottom > maximumHemBottom) {
      layer.top -= hemBottom - maximumHemBottom
    }
  }
}

export function composeOutfitLayers(
  outfit: Outfit,
  items: Item[],
): OutfitCompositionLayer[] {
  const compositionItems = outfit.itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item?.image))
  const hasOuter = compositionItems.some((item) =>
    item.category.startsWith('Outer'),
  )

  const layers = compositionItems
    .map((item) => {
      const rule = resolveRule(item, hasOuter)
      if (!rule) return null

      const placement = placementFor(outfit, item.id)
      const slotName = (
        (placement?.slot && slotAliases[placement.slot]) ?? rule.slot
      ) as keyof typeof compositionConfig.slots
      const slot = compositionConfig.slots[slotName]
      const itemScale = placement?.itemScale ?? 1
      const targetWidth =
        compositionConfig.itemTemplate.width * rule.visualScale * itemScale
      const targetHeight =
        (rule.visualHeight ??
          compositionConfig.itemTemplate.height * rule.visualScale) *
        itemScale
      const { width, height } = fitInside(
        item.image?.widthPx ?? null,
        item.image?.heightPx ?? null,
        targetWidth,
        targetHeight,
      )
      const position = positionForSlot(slot, width, height)

      return {
        item,
        left: position.left,
        top: position.top,
        width,
        height,
        zIndex: placement?.zIndex ?? rule.zIndex,
        objectPosition: position.objectPosition,
        slotName,
        positionX: placement?.positionX ?? 0,
        positionY: placement?.positionY ?? 0,
      }
    })
    .filter((layer): layer is ResolvedLayer => Boolean(layer))

  applyHemToShoesGap(layers)

  return layers
    .map(({ slotName: _slotName, positionX, positionY, ...layer }) => ({
      ...layer,
      left: layer.left + positionX,
      top: layer.top + positionY,
    }))
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex || left.item.id.localeCompare(right.item.id),
    )
}

export const OUTFIT_COMPOSITION_CANVAS = compositionConfig.canvas
