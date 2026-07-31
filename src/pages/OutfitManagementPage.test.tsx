import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { DemoRepository } from '../data/demo-repository'
import { LookbookPage } from './LookbookPage'
import { OutfitCreatorPage } from './OutfitCreatorPage'
import { OutfitDetailPage } from './OutfitDetailPage'

function renderOutfitRoutes(repository: DemoRepository, initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SeasonScopeProvider>
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/lookbook" element={<LookbookPage />} />
            <Route path="/outfits/new" element={<OutfitCreatorPage />} />
            <Route path="/outfits/:outfitId" element={<OutfitDetailPage />} />
          </Routes>
        </DataProvider>
      </SeasonScopeProvider>
    </MemoryRouter>,
  )
}

describe('Outfit clone and archive management', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('상세에서 보관·복원해도 기존 착용 기록을 유지한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const setOutfitArchived = vi.spyOn(repository, 'setOutfitArchived')

    renderOutfitRoutes(repository, '/outfits/outfit-favorite')

    expect(await screen.findByText('2개 기록')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '이 착장으로 새로 만들기' }),
    ).toHaveAttribute('href', '/outfits/new?source=outfit-favorite')
    await user.click(screen.getByRole('button', { name: '보관하기' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '평가와 기존 착용 기록은 삭제하지 않으며 언제든 복원할 수 있습니다.',
    )
    await user.click(screen.getByRole('button', { name: '보관 확인' }))

    expect(await screen.findByText('보관된 Outfit')).toBeInTheDocument()
    expect(screen.getByText('2개 기록')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '오늘 입기' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '복원하기' }))

    expect(await screen.findByRole('link', { name: '오늘 입기' })).toBeVisible()
    expect(setOutfitArchived).toHaveBeenNthCalledWith(1, 'outfit-favorite', true)
    expect(setOutfitArchived).toHaveBeenNthCalledWith(2, 'outfit-favorite', false)
    expect(
      (await repository.load()).wearLogs.filter(
        (log) => log.outfitId === 'outfit-favorite',
      ),
    ).toHaveLength(2)
  })

  it('보관 Outfit을 기본 Lookbook에서 숨기고 명시적 필터에서 복원 경로를 제공한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    await repository.setOutfitArchived('outfit-favorite', true)

    renderOutfitRoutes(repository, '/lookbook')

    await screen.findByRole('heading', { name: '착장' })
    expect(
      screen.queryByRole('link', { name: /보관된 블루 가디건/ }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('checkbox', { name: 'Error·Retired·보관 포함' }),
    )

    expect(
      await screen.findByRole('link', { name: /보관된 블루 가디건/ }),
    ).toBeVisible()
  })
})
