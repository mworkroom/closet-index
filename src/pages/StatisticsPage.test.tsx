import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { demoData } from '../data/demo-data'
import { DemoRepository } from '../data/demo-repository'
import { StatisticsPage } from './StatisticsPage'
import { StatisticsItemListPage } from './StatisticsItemListPage'

function renderPage(initialEntry = '/statistics') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DataProvider repository={new DemoRepository()}>
        <Routes>
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route
            path="/statistics/items"
            element={<StatisticsItemListPage />}
          />
          <Route path="/closet/:itemId" element={<p>Item 상세</p>} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('StatisticsPage Phase 4 item usage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows utilization, a four-item Most Worn preview, and no outfit ranking', async () => {
    renderPage()

    const utilization = await screen.findByRole('region', {
      name: '현재 보유 옷의 전체 기간 활용률',
    })
    expect(within(utilization).getByText('100%')).toBeInTheDocument()
    expect(within(utilization).getByText('6/6개')).toBeInTheDocument()

    const mostWorn = screen.getByRole('heading', { name: 'Most Worn' })
      .closest('section')!
    expect(within(mostWorn).getByText('화이트 스니커즈')).toBeInTheDocument()
    expect(within(mostWorn).getByText('블랙 팬츠')).toBeInTheDocument()
    expect(within(mostWorn).getByText('아이보리 니트')).toBeInTheDocument()
    expect(within(mostWorn).getByText('블루 가디건')).toBeInTheDocument()
    expect(within(mostWorn).queryByText('네이비 티셔츠')).not.toBeInTheDocument()
    expect(screen.queryByText('Outfit별 착용')).not.toBeInTheDocument()
  })

  it('opens the full item list with the same statistics conditions', async () => {
    const user = userEvent.setup()
    const scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined)
    renderPage()

    const mostWorn = (
      await screen.findByRole('heading', { name: 'Most Worn' })
    ).closest('section')!
    const fullListLink = within(mostWorn).getByRole('link', {
      name: 'Closet에서 전체 보기',
    })
    expect(fullListLink).toHaveAttribute(
      'href',
      '/statistics/items?result=most-worn&period=lifetime',
    )

    await user.click(fullListLink)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    expect(
      await screen.findByRole('heading', { name: 'Most Worn 전체' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: '적용된 통계 조건' }),
    ).toHaveTextContent('Lifetime · 모든 계절 · 모든 카테고리')
    expect(
      screen.getByRole('heading', { name: '아이템' }).nextElementSibling,
    ).toHaveTextContent('6개')
    expect(
      screen.getByRole('link', {
        name: '네이비 티셔츠 Item 상세 보기',
      }),
    ).toBeInTheDocument()
  })

  it('Retired 제외 선택을 전체 Item 보기까지 전달하고 Retired Item을 숨긴다', async () => {
    const user = userEvent.setup()
    const retiredOutfit = demoData.outfits.find(
      (outfit) => outfit.id === 'outfit-error',
    )
    if (!retiredOutfit) throw new Error('retired outfit fixture missing')
    window.localStorage.setItem(
      'closet-index-demo-data-v3',
      JSON.stringify({
        ...demoData,
        outfits: demoData.outfits.map((outfit) =>
          outfit.id === retiredOutfit.id
            ? { ...outfit, itemIds: ['item-loafers'] }
            : outfit,
        ),
        wearLogs: [
          ...demoData.wearLogs,
          {
            ...demoData.wearLogs[0],
            id: 'log-retired-item',
            outfitId: retiredOutfit.id,
            wornOn: '2026-07-20',
            submissionToken: 'demo-retired-item',
          },
        ],
      }),
    )
    renderPage()

    await screen.findByRole('heading', {
      name: '현재 보유 옷의 전체 기간 활용률',
    })
    const retiredFilter = screen.getByRole('checkbox', {
      name: 'Retired 제외',
    })
    expect(retiredFilter).not.toBeChecked()

    const mostWorn = screen.getByRole('heading', { name: 'Most Worn' })
      .closest('section')!
    expect(within(mostWorn).getByText('7개')).toBeInTheDocument()

    await user.click(retiredFilter)

    expect(retiredFilter).toBeChecked()
    expect(within(mostWorn).getByText('6개')).toBeInTheDocument()
    const fullListLink = within(mostWorn).getByRole('link', {
      name: 'Closet에서 전체 보기',
    })
    expect(fullListLink).toHaveAttribute(
      'href',
      '/statistics/items?result=most-worn&period=lifetime&excludeRetired=true',
    )

    await user.click(fullListLink)

    expect(
      screen.getByRole('region', { name: '적용된 통계 조건' }),
    ).toHaveTextContent('Lifetime · 모든 계절 · 모든 카테고리 · Retired 제외')
    expect(
      screen.queryByRole('link', {
        name: '브라운 로퍼 Item 상세 보기',
      }),
    ).not.toBeInTheDocument()
  })

  it('applies season and category filters independently to the statistics view', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', {
      name: '현재 보유 옷의 전체 기간 활용률',
    })

    await user.click(screen.getByRole('checkbox', { name: '여름' }))
    await user.click(screen.getByRole('checkbox', { name: 'Top' }))

    const utilization = screen.getByRole('region', {
      name: '현재 보유 옷의 전체 기간 활용률',
    })
    expect(within(utilization).getByText('1/1개')).toBeInTheDocument()
    expect(screen.getByText('네이비 티셔츠')).toBeInTheDocument()
    expect(screen.queryByText('화이트 스니커즈')).not.toBeInTheDocument()
  })

  it('labels a past year honestly and shows active items without records', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', {
      name: '현재 보유 옷의 전체 기간 활용률',
    })

    await user.selectOptions(screen.getByRole('combobox', { name: '통계 기간' }), '2025')

    const utilization = screen.getByRole('region', {
      name: '현재 보유 옷의 2025년 활용률',
    })
    expect(within(utilization).getByText('0%')).toBeInTheDocument()
    expect(within(utilization).getByText('0/3개')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '2025년 기록 없음' }),
    ).toBeInTheDocument()
  })

  it('restores its own filters from versioned local storage', async () => {
    window.localStorage.setItem(
      'closet-index:statistics-filters:v1',
      JSON.stringify({
        period: { kind: 'year', year: 2025 },
        seasons: ['Winter'],
        categories: ['top'],
      }),
    )
    renderPage()

    expect(await screen.findByRole('checkbox', { name: '겨울' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Top' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: '통계 기간' })).toHaveValue(
      '2025',
    )
  })

  it('restores the Statistics scroll position only on history navigation', async () => {
    window.sessionStorage.setItem(
      'closet-index:statistics-scroll:v1',
      '240',
    )
    const scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined)
    renderPage()

    await screen.findByRole('heading', {
      name: '현재 보유 옷의 전체 기간 활용률',
    })
    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith({ top: 240 }),
    )
    expect(
      window.sessionStorage.getItem(
        'closet-index:statistics-scroll:v1',
      ),
    ).toBeNull()
  })
})
