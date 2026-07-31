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

    await user.click(screen.getByRole('button', { name: '이 설정 저장' }))
    expect(onSave).toHaveBeenCalledWith({
      outfitId: 'outfit',
      itemId: 'skirt',
      slot: null,
      positionX: 0,
      positionY: -4,
      itemScale: 1.05,
      zIndex: null,
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      '표시 방식과 위치를 저장했습니다.',
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

  it('shows learned defaults for untouched items and resets back to them', async () => {
    const user = userEvent.setup()
    const outer = item('outer', '재킷', 'Outer-Jacket')
    const shoes = item('shoes', '신발', 'Shoes')
    const bag = item('bag', '가방', 'Bags')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [outer.id, shoes.id, bag.id],
      itemPlacements: [
        {
          itemId: outer.id,
          slot: null,
          positionX: null,
          positionY: null,
          itemScale: null,
          zIndex: null,
        },
        {
          itemId: shoes.id,
          slot: null,
          positionX: null,
          positionY: null,
          itemScale: null,
          zIndex: null,
        },
        {
          itemId: bag.id,
          slot: null,
          positionX: null,
          positionY: null,
          itemScale: null,
          zIndex: null,
        },
      ],
    }

    render(
      <OutfitPositionEditor
        outfit={outfit}
        items={[outer, shoes, bag]}
        onSave={vi.fn(async () => undefined)}
      />,
    )

    expect(
      screen.getByText('좌우 0px · 상하 52px · 크기 90%'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /신발/ }))
    expect(
      screen.getByText('좌우 0px · 상하 -20px · 크기 80%'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /가방/ }))
    expect(
      screen.getByText('좌우 -80px · 상하 0px · 크기 100%'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '가방 오른쪽으로 4px 이동' }),
    )
    await user.click(screen.getByRole('button', { name: '가방 5% 축소' }))
    expect(
      screen.getByText('좌우 -76px · 상하 0px · 크기 95%'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '가방 원위치와 원래 크기' }),
    )
    expect(
      screen.getByText('좌우 -80px · 상하 0px · 크기 100%'),
    ).toBeInTheDocument()
  })

  it('keeps explicit saved zero and 100% values instead of learned defaults', () => {
    const outer = item('outer', '재킷', 'Outer-Jacket')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [outer.id],
      itemPlacements: [
        {
          itemId: outer.id,
          slot: null,
          positionX: 0,
          positionY: 0,
          itemScale: 1,
          zIndex: null,
        },
      ],
    }

    render(
      <OutfitPositionEditor
        outfit={outfit}
        items={[outer]}
        onSave={vi.fn(async () => undefined)}
      />,
    )

    expect(
      screen.getByText('좌우 0px · 상하 0px · 크기 100%'),
    ).toBeInTheDocument()
  })

  it('previews and saves a T-shirt inside the outer or separated to the side', async () => {
    const user = userEvent.setup()
    const tee = item('tee', '티셔츠', 'Top-T-shirts')
    const outer = item('outer', '재킷', 'Outer-Jacket')
    const outfit: Outfit = {
      id: 'outfit',
      displayName: null,
      rating: null,
      itemIds: [tee.id, outer.id],
    }
    const onSave = vi.fn(async () => undefined)

    render(
      <OutfitPositionEditor
        outfit={outfit}
        items={[tee, outer]}
        onSave={onSave}
      />,
    )

    const preview = screen.getByRole('img', {
      name: /조정 가능한 착장 미리보기/,
    })
    const automatic = screen.getByRole('radio', { name: '자동' })
    const inside = screen.getByRole('radio', { name: '아우터 안' })
    const side = screen.getByRole('radio', { name: '옆에 분리' })
    const moveUp = screen.getByRole('button', {
      name: '티셔츠 위로 4px 이동',
    })
    expect(
      moveUp.compareDocumentPosition(automatic) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(automatic).toBeChecked()
    const automaticWidth = Number.parseFloat(
      preview.querySelectorAll('img')[0].style.width,
    )

    await user.click(inside)
    expect(inside).toBeChecked()
    expect(
      screen.getByText('좌우 0px · 상하 52px · 크기 90%'),
    ).toBeInTheDocument()
    const insideWidth = Number.parseFloat(
      preview.querySelectorAll('img')[0].style.width,
    )
    expect(insideWidth).toBeGreaterThan(automaticWidth)

    await user.click(screen.getByRole('button', { name: '이 설정 저장' }))
    expect(onSave).toHaveBeenLastCalledWith({
      outfitId: 'outfit',
      itemId: 'tee',
      slot: 'top',
      positionX: 0,
      positionY: 52,
      itemScale: 0.9,
      zIndex: 50,
    })

    await user.click(side)
    expect(side).toBeChecked()
    expect(
      screen.getByText('좌우 0px · 상하 0px · 크기 100%'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '이 설정 저장' }))
    expect(onSave).toHaveBeenLastCalledWith({
      outfitId: 'outfit',
      itemId: 'tee',
      slot: 'top',
      positionX: 0,
      positionY: 0,
      itemScale: 1,
      zIndex: 0,
    })
  })
})
