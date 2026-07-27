import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { demoData } from '../data/demo-data'
import { DemoRepository } from '../data/demo-repository'
import { formatMonthDayYear } from '../lib/date'
import { getItemStats, getOutfitStats, outfitLabel } from '../lib/outfits'
import { CalendarPage } from './CalendarPage'
import { ClosetPage } from './ClosetPage'
import { ItemDetailPage } from './ItemDetailPage'
import { LookbookPage } from './LookbookPage'
import { OutfitDetailPage } from './OutfitDetailPage'

function renderRoute(path: string, routePath: string, element: React.ReactNode) {
  const repository = new DemoRepository()
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('Phase 1B screen visuals', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('LOOKBOOK에서 이미지·fallback 카드를 3열 grid에 함께 표시한다', async () => {
    renderRoute('/lookbook', '/lookbook', <LookbookPage />)

    await screen.findByRole('link', { name: /가볍게 걷는 날/ })
    const grid = document.querySelector<HTMLElement>('.outfit-grid')
    expect(grid).toBeInTheDocument()
    expect(within(grid!).getAllByRole('link')).toHaveLength(5)
    const favoriteOutfit = demoData.outfits.find(
      (outfit) => outfit.id === 'outfit-favorite',
    )
    if (!favoriteOutfit) throw new Error('outfit fixture missing')
    const favoriteStats = getOutfitStats(
      favoriteOutfit.id,
      demoData.wearLogs,
    )
    const favoriteLink = within(grid!).getByRole('link', {
      name: `${outfitLabel(favoriteOutfit, demoData.items)} 착장 상세 보기`,
    })
    expect(within(favoriteLink).queryByRole('heading')).not.toBeInTheDocument()
    expect(
      within(favoriteLink).getByText(`착용 ${favoriteStats.wearCount}회`),
    ).toBeInTheDocument()
    expect(
      within(favoriteLink).getByText(
        favoriteStats.lastWornOn
          ? `최근 ${formatMonthDayYear(favoriteStats.lastWornOn)}`
          : '최근 기록 없음',
      ),
    ).toBeInTheDocument()
    expect(
      within(grid!).getByRole('img', {
        name: '블루 가디건 + 아이보리 니트 + 블랙 팬츠 외 1개 착장 미리보기',
      }),
    ).toBeInTheDocument()
    expect(
      within(grid!).getByLabelText('가볍게 걷는 날 구성 아이템 색상'),
    ).toBeInTheDocument()
  })

  it('CLOSET 행에서 cutout과 스와치 fallback을 함께 유지한다', async () => {
    renderRoute('/closet', '/closet', <ClosetPage />)

    const cardiganLink = await screen.findByRole('link', {
      name: /블루 가디건/,
    })
    const knitLink = screen.getByRole('link', { name: /아이보리 니트/ })
    const grid = document.querySelector<HTMLElement>('.item-grid')
    const cardigan = demoData.items.find((item) => item.id === 'item-cardigan')
    if (!cardigan) throw new Error('item fixture missing')
    const cardiganStats = getItemStats(
      cardigan.id,
      demoData.outfits,
      demoData.wearLogs,
    )

    expect(grid).toBeInTheDocument()
    expect(within(grid!).getAllByRole('link')).toHaveLength(
      demoData.items.filter((item) => !item.retired).length,
    )
    expect(within(cardiganLink).queryByText(cardigan.name)).not.toBeInTheDocument()
    expect(
      within(cardiganLink).getByText(`착용 ${cardiganStats.wearCount}회`),
    ).toBeInTheDocument()
    expect(
      within(cardiganLink).getByText(
        cardiganStats.lastWornOn
          ? `최근 ${formatMonthDayYear(cardiganStats.lastWornOn)}`
          : '최근 기록 없음',
      ),
    ).toBeInTheDocument()
    expect(
      within(cardiganLink).getByRole('img', {
        name: '블루 가디건 아이템 이미지',
      }),
    ).toBeInTheDocument()
    expect(
      within(knitLink).getByRole('img', { name: 'Ivory 색상' }),
    ).toBeInTheDocument()
  })

  it('Item 상세에서 큰 cutout과 기존 속성을 함께 표시한다', async () => {
    renderRoute(
      '/closet/item-cardigan',
      '/closet/:itemId',
      <ItemDetailPage />,
    )

    const image = await screen.findByRole('img', {
      name: '블루 가디건 아이템 이미지',
    })
    expect(image.closest('.item-visual--detail')).toBeInTheDocument()
    expect(screen.getByText('Outer-Cardigan')).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
  })

  it('Outfit 상세에서 preview hero와 구성 Item thumbnail을 표시한다', async () => {
    renderRoute(
      '/outfits/outfit-favorite',
      '/outfits/:outfitId',
      <OutfitDetailPage />,
    )

    const preview = await screen.findByRole('img', {
      name: '블루 가디건 + 아이보리 니트 + 블랙 팬츠 외 1개 착장 미리보기',
    })
    expect(preview.closest('.outfit-visual--hero')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '블루 가디건 아이템 이미지' }),
    ).toBeInTheDocument()

    const knitLink = screen.getByRole('link', { name: /아이보리 니트/ })
    expect(
      within(knitLink).getByRole('img', { name: 'Ivory 색상' }),
    ).toBeInTheDocument()
  })

  it('Calendar는 preview metadata가 있는 Outfit에만 thumbnail을 추가한다', async () => {
    const { unmount } = renderRoute(
      '/calendar?date=2026-05-03',
      '/calendar',
      <CalendarPage />,
    )

    await screen.findByText('CGV용산')
    expect(document.querySelectorAll('.record-card__preview')).toHaveLength(1)
    expect(
      screen.getByRole('img', {
        name: '블루 가디건 + 아이보리 니트 + 블랙 팬츠 외 1개 착장 미리보기',
      }),
    ).toBeInTheDocument()

    unmount()
    renderRoute(
      '/calendar?date=2026-06-18',
      '/calendar',
      <CalendarPage />,
    )

    await screen.findByText('가볍게 걷는 날')
    expect(document.querySelector('.record-card__preview')).not.toBeInTheDocument()
  })
})
