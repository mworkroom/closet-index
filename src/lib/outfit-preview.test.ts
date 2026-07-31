import { describe, expect, it } from 'vitest'
import type { Item, Outfit } from './types'
import {
  getOutfitPreviewFingerprint,
  prepareOutfitPreview,
} from './outfit-preview'

const item: Item = {
  id: 'item-a',
  name: '테스트 상의',
  category: 'Top-T-shirts',
  semanticColor: 'Navy',
  displayHex: '#293A5B',
  seasons: ['Summer'],
  retired: false,
  rainOk: true,
  longWalkOk: true,
  memo: null,
  acquiredOn: null,
  image: {
    id: 'image-a',
    storagePath: 'workspace/items/item-a/cutout/image-a.webp',
    url: 'https://example.test/image-a.webp',
    widthPx: 600,
    heightPx: 800,
    expiresAt: null,
  },
}

const outfit: Outfit = {
  id: 'outfit-a',
  displayName: null,
  rating: null,
  itemIds: [item.id],
  itemPlacements: [
    {
      itemId: item.id,
      slot: 'top',
      positionX: 0,
      positionY: 52,
      itemScale: 0.9,
      zIndex: 50,
    },
  ],
}

describe('Outfit preview source fingerprint', () => {
  it('is stable for the same sources and changes with placement or cutout', async () => {
    const first = await getOutfitPreviewFingerprint(outfit, [item])
    const repeated = await getOutfitPreviewFingerprint(
      structuredClone(outfit),
      [structuredClone(item)],
    )
    const moved = structuredClone(outfit)
    moved.itemPlacements![0].positionY = 56
    const replaced = structuredClone(item)
    replaced.image!.id = 'image-b'

    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(repeated).toBe(first)
    await expect(getOutfitPreviewFingerprint(moved, [item])).resolves.not.toBe(
      first,
    )
    await expect(
      getOutfitPreviewFingerprint(outfit, [replaced]),
    ).resolves.not.toBe(first)
  })

  it('does not attempt browser composition when any cutout is missing', async () => {
    const missing = { ...item, image: null }
    await expect(prepareOutfitPreview(outfit, [missing])).rejects.toThrow(
      '모든 구성 Item에 누끼 이미지',
    )
  })
})
