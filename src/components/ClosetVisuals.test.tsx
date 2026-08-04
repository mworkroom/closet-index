import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { demoData } from '../data/demo-data'
import { ItemVisual } from './ItemVisual'
import { OutfitVisual } from './OutfitVisual'

afterEach(() => {
  cleanup()
})

describe('Phase 1B visual components', () => {
  it('Outfit을 현재 Item cutout의 lazy layer로 표시한다', () => {
    const outfit = demoData.outfits.find((entry) => entry.id === 'outfit-favorite')!

    render(<OutfitVisual outfit={outfit} items={demoData.items} />)

    const composition = screen.getByRole('img', {
      name: '블루 가디건 + 아이보리 니트 + 블랙 팬츠 외 1개 조정 가능한 착장 미리보기',
    })
    expect(within(composition).getByRole('presentation')).toHaveAttribute(
      'loading',
      'lazy',
    )
    expect(composition.closest('.outfit-visual')).toBeInTheDocument()
  })

  it('일부 cutout만 있으면 해당 이미지만 합성하고, 이미지가 전혀 없을 때만 색상 fallback을 표시한다', () => {
    const missing = demoData.outfits.find((entry) => entry.id === 'outfit-summer')!
    const noCutouts = demoData.outfits.find((entry) => entry.id === 'outfit-skirt')!
    const { rerender } = render(
      <OutfitVisual outfit={missing} items={demoData.items} />,
    )

    expect(
      screen.getByRole('img', {
        name: '가볍게 걷는 날 조정 가능한 착장 미리보기',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('가볍게 걷는 날 구성 아이템 색상'),
    ).not.toBeInTheDocument()

    rerender(<OutfitVisual outfit={noCutouts} items={demoData.items} />)

    expect(
      screen.getByLabelText(
        '아이보리 니트 + 차콜 스커트 + 화이트 스니커즈 구성 아이템 색상',
      ),
    ).toBeInTheDocument()
  })

  it('모든 Item cutout이 있으면 현재 배치 규칙으로 합성한다', () => {
    const outfit = demoData.outfits.find((entry) => entry.id === 'outfit-favorite')!
    const fallbackImage = demoData.items.find(
      (entry) => entry.id === 'item-cardigan',
    )!.image
    const items = demoData.items.map((item) =>
      outfit.itemIds.includes(item.id) ? { ...item, image: fallbackImage } : item,
    )

    render(<OutfitVisual outfit={outfit} items={items} />)

    expect(document.querySelector('.outfit-visual__layered')).toBeInTheDocument()
    expect(document.querySelector('.outfit-visual__image')).not.toBeInTheDocument()
  })

  it('Item cutout과 기존 색상 fallback을 같은 visual wrapper에 표시한다', () => {
    const imageItem = demoData.items.find((entry) => entry.id === 'item-cardigan')!
    const missingItem = demoData.items.find((entry) => entry.id === 'item-knit')!
    const { rerender } = render(
      <ItemVisual item={imageItem} className="item-visual--row" />,
    )

    expect(
      screen.getByRole('img', { name: '블루 가디건 아이템 이미지' }),
    ).toHaveAttribute('loading', 'lazy')

    rerender(<ItemVisual item={missingItem} className="item-visual--row" />)
    expect(screen.getByRole('img', { name: 'Ivory 색상' })).toBeInTheDocument()
    expect(document.querySelector('.item-visual--row')).toBeInTheDocument()
  })
})
