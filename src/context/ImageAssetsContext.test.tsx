import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemVisual } from '../components/ItemVisual'
import type { ItemImageAssetRepository } from '../data/repository'
import type { Item } from '../lib/types'
import { ImageAssetsProvider } from './ImageAssetsContext'

const item: Item = {
  id: 'item-1',
  name: '테스트 아이템',
  category: 'Top-Shirts',
  semanticColor: 'Blue',
  displayHex: '#112233',
  seasons: ['Spring'],
  retired: false,
  rainOk: true,
  longWalkOk: true,
  memo: null,
  acquiredOn: '2026-01-01',
  currentQuantity: null,
  image: {
    id: 'image-1',
    storagePath: 'workspace/items/item-1/cutout/image-1.webp',
    url: null,
    widthPx: 800,
    heightPx: 1200,
    expiresAt: null,
  },
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('ImageAssetsProvider', () => {
  it('batches duplicate mounted paths into one authenticated download and shares one Blob URL', async () => {
    const downloadItemImages = vi.fn(async (paths: string[]) =>
      new Map(paths.map((path) => [path, new Blob(['image'])])),
    )
    const createObjectURL = vi.fn(() => 'blob:closet-item-1')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    const repository: ItemImageAssetRepository = { downloadItemImages }

    render(
      <ImageAssetsProvider repository={repository}>
        <ItemVisual item={item} />
        <ItemVisual item={item} />
      </ImageAssetsProvider>,
    )

    await waitFor(() =>
      expect(
        screen.getAllByRole('img').map((image) => image.getAttribute('src')),
      ).toEqual(['blob:closet-item-1', 'blob:closet-item-1']),
    )
    expect(downloadItemImages).toHaveBeenCalledTimes(1)
    expect(downloadItemImages).toHaveBeenCalledWith([item.image!.storagePath])
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })
})
