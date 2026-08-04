import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { demoData } from '../data/demo-data'
import { DemoRepository } from '../data/demo-repository'
import { ClosetPage } from './ClosetPage'
import { LookbookPage } from './LookbookPage'

function renderPage(page: React.ReactNode) {
  return render(
    <MemoryRouter>
      <SeasonScopeProvider>
        <DataProvider repository={new DemoRepository()}>{page}</DataProvider>
      </SeasonScopeProvider>
    </MemoryRouter>,
  )
}

describe('Closet과 Lookbook 점진 표시', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('Closet 아이템을 24개씩 보여주고 검색이 바뀌면 첫 묶음으로 돌아간다', async () => {
    const user = userEvent.setup()
    const baseItem = demoData.items.find((item) => !item.retired)
    if (!baseItem) throw new Error('item fixture missing')
    const extraItems = Array.from({ length: 50 }, (_, index) => ({
      ...baseItem,
      id: `pagination-item-${index}`,
      name: `페이지네이션 아이템 ${index}`,
      retired: false,
      acquiredOn: null,
      seasons: [],
    }))
    window.localStorage.setItem(
      'closet-index-demo-data-v3',
      JSON.stringify({ ...demoData, items: [...demoData.items, ...extraItems] }),
    )

    renderPage(<ClosetPage />)

    await screen.findByRole('button', { name: /더 보기 \(24\// })
    const grid = document.querySelector<HTMLElement>('.item-grid')
    expect(within(grid!).getAllByRole('link')).toHaveLength(24)

    await user.click(screen.getByRole('button', { name: /더 보기 \(24\// }))
    expect(within(grid!).getAllByRole('link')).toHaveLength(48)

    await user.type(
      screen.getByRole('searchbox', { name: '아이템 검색' }),
      '페이지네이션 아이템',
    )
    expect(within(grid!).getAllByRole('link')).toHaveLength(24)
    expect(screen.getByRole('button', { name: '더 보기 (24/50)' })).toBeVisible()
  })

  it('Lookbook 착장을 24개씩 보여주고 카드의 레이어 이미지를 지연 로딩한다', async () => {
    const user = userEvent.setup()
    const baseOutfit = demoData.outfits.find(
      (outfit) => !outfit.archivedAt && outfit.rating !== 'error',
    )
    if (!baseOutfit) throw new Error('outfit fixture missing')
    const extraOutfits = Array.from({ length: 50 }, (_, index) => ({
      ...baseOutfit,
      id: `pagination-outfit-${index}`,
      displayName: `페이지네이션 착장 ${index}`,
      rating: null,
      archivedAt: null,
    }))
    window.localStorage.setItem(
      'closet-index-demo-data-v3',
      JSON.stringify({
        ...demoData,
        outfits: [...demoData.outfits, ...extraOutfits],
      }),
    )

    renderPage(<LookbookPage />)

    await screen.findByRole('button', { name: /더 보기 \(24\// })
    const grid = document.querySelector<HTMLElement>('.outfit-grid')
    expect(within(grid!).getAllByRole('link')).toHaveLength(24)
    const layerImages = grid!.querySelectorAll('.layered-outfit-preview img')
    expect(layerImages.length).toBeGreaterThan(0)
    layerImages.forEach((image) => expect(image).toHaveAttribute('loading', 'lazy'))

    await user.click(screen.getByRole('button', { name: /더 보기 \(24\// }))
    expect(within(grid!).getAllByRole('link')).toHaveLength(48)

    await user.type(
      screen.getByRole('searchbox', { name: '착장 검색' }),
      '페이지네이션 착장',
    )
    expect(within(grid!).getAllByRole('link')).toHaveLength(24)
    expect(screen.getByRole('button', { name: '더 보기 (24/50)' })).toBeVisible()
  })
})
