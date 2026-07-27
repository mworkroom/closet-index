import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

describe('OutfitPositionEditor', () => {
  it('moves the selected item by 4px, resets, and saves only its position', async () => {
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

    await user.click(screen.getByRole('button', { name: /스커트/ }))
    await user.click(
      screen.getByRole('button', { name: '스커트 위로 4px 이동' }),
    )
    expect(screen.getByText('좌우 0px · 상하 -4px')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '이 위치 저장' }))
    expect(onSave).toHaveBeenCalledWith({
      outfitId: 'outfit',
      itemId: 'skirt',
      positionX: 0,
      positionY: -4,
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      '위치를 저장했습니다.',
    )

    await user.click(screen.getByRole('button', { name: '스커트 원위치' }))
    expect(screen.getByText('좌우 0px · 상하 0px')).toBeInTheDocument()
  })
})
