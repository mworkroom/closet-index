import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset, Item, Outfit } from '../lib/types'
import { OutfitPositionEditor } from './OutfitPositionEditor'

const image: ImageAsset = {
  id: 'image',
  storagePath: 'test.webp',
  url: 'data:image/webp;base64,test',
  widthPx: 100,
  heightPx: 100,
  expiresAt: null,
}

function item(id: string, name: string, category: string): Item {
  return {
    id,
    name,
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

afterEach(() => {
  cleanup()
})

describe('OutfitPositionEditor', () => {
  it('moves and resizes the selected item, then resets both values', async () => {
    const user = userEvent.setup()
    const scarf = item('scarf', '스카프', 'Acc-Neck')
    const skirt = item('skirt', '스커트', 'Bottom-Skirts')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: 'favorite',
      itemIds: [scarf.id, skirt.id],
    }
    const onSave = vi.fn(async () => undefined)
    render(
      <OutfitPositionEditor
        outfit={outfit}
        items={[scarf, skirt]}
        onSave={onSave}
      />,
    )

    const preview = screen.getByRole('img', {
      name: /조정 가능한 착장 미리보기/,
    })
    const controls = screen.getByText(/좌우 0px/)
    const itemSelector = screen.getByLabelText('조정할 아이템 선택')
    expect(
      preview.compareDocumentPosition(controls) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      controls.compareDocumentPosition(itemSelector) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /스커트/ }))
    await user.click(
      screen.getByRole('button', { name: '스커트 위로 4px 이동' }),
    )
    await user.click(screen.getByRole('button', { name: '스커트 5% 확대' }))
    expect(
      screen.getByText('좌우 0px · 상하 -4px · 크기 105%'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '이 조정 저장' }))
    expect(onSave).toHaveBeenCalledWith({
      outfitId: 'outfit',
      itemId: 'skirt',
      positionX: 0,
      positionY: -4,
      itemScale: 1.05,
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      '위치와 크기를 저장했습니다.',
    )

    await user.click(
      screen.getByRole('button', { name: '스커트 원위치와 원래 크기' }),
    )
    expect(
      screen.getByText('좌우 0px · 상하 0px · 크기 100%'),
    ).toBeInTheDocument()
  })

  it('keeps unsaved edits when an equivalent outfit object is rendered again', async () => {
    const user = userEvent.setup()
    const skirt = item('skirt', '스커트', 'Bottom-Skirts')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: 'favorite',
      itemIds: [skirt.id],
      itemPlacements: [
        {
          itemId: skirt.id,
          slot: null,
          positionX: 0,
          positionY: 0,
          itemScale: 1,
          zIndex: null,
        },
      ],
    }
    const onSave = vi.fn(async () => undefined)
    const { rerender } = render(
      <OutfitPositionEditor
        outfit={outfit}
        items={[skirt]}
        onSave={onSave}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '스커트 위로 4px 이동' }),
    )
    expect(screen.getByText(/상하 -4px/)).toBeInTheDocument()

    rerender(
      <OutfitPositionEditor
        outfit={{
          ...outfit,
          itemIds: [...outfit.itemIds],
          itemPlacements: outfit.itemPlacements?.map((placement) => ({
            ...placement,
          })),
        }}
        items={[skirt]}
        onSave={onSave}
      />,
    )

    expect(screen.getByText(/상하 -4px/)).toBeInTheDocument()
  })
})
