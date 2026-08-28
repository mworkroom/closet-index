import { cleanup, render, screen, within } from '@testing-library/react'
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
      screen.getByRole('link', { name: '새로 만들기' }),
    ).toHaveAttribute('href', '/outfits/new?source=outfit-favorite')
    expect(screen.getByRole('link', { name: '착장 수정' })).toHaveAttribute(
      'href',
      '/outfits/outfit-favorite/edit',
    )
    expect(screen.queryByText('MANAGE')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '착장 관리' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('저장 Preview')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Preview 만들기|다시 만들기/ }),
    ).not.toBeInTheDocument()
    const management = document.querySelector<HTMLElement>('.record-management')
    expect(management).toBeInTheDocument()
    expect(within(management!).getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByText('착용 기록 2개가 있어 삭제할 수 없습니다.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '보관' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '평가와 기존 착용 기록은 유지되며 언제든 복원할 수 있습니다.',
    )
    await user.click(screen.getByRole('button', { name: '보관 확인' }))

    expect(await screen.findByText('보관된 Outfit')).toBeInTheDocument()
    expect(screen.getByText('2개 기록')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '오늘 입기' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '복원' }))

    expect(await screen.findByRole('link', { name: '오늘 입기' })).toBeVisible()
    expect(setOutfitArchived).toHaveBeenNthCalledWith(1, 'outfit-favorite', true)
    expect(setOutfitArchived).toHaveBeenNthCalledWith(2, 'outfit-favorite', false)
    expect(
      (await repository.load()).wearLogs.filter(
        (log) => log.outfitId === 'outfit-favorite',
      ),
    ).toHaveLength(2)
  })

  it('착장 상세의 착용 이력에서 기록을 확인 후 삭제한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const deleteWearLog = vi.spyOn(repository, 'deleteWearLog')

    renderOutfitRoutes(repository, '/outfits/outfit-favorite')

    const date = await screen.findByText('2026-05-03')
    const historyCard = date.closest<HTMLElement>('.history-card')
    expect(historyCard).toBeInTheDocument()
    await user.click(within(historyCard!).getByRole('button', { name: '삭제' }))
    expect(within(historyCard!).getByRole('alert')).toHaveTextContent(
      '삭제 후 착용 횟수와 관련 통계가 다시 계산됩니다.',
    )
    await user.click(
      within(historyCard!).getByRole('button', { name: '삭제 확인' }),
    )

    expect(await screen.findByText('1개 기록')).toBeInTheDocument()
    expect(deleteWearLog).toHaveBeenCalledWith('log-2')
    expect(
      (await repository.load()).wearLogs.filter(
        (log) => log.outfitId === 'outfit-favorite',
      ),
    ).toHaveLength(1)
  })

  it('메모가 있는 착용 기록에만 메모를 표시한다', async () => {
    const repository = new DemoRepository()
    const data = await repository.load()
    const emptyMemoLog = data.wearLogs.find((log) => log.id === 'log-1')
    if (!emptyMemoLog) throw new Error('fixture missing')
    emptyMemoLog.memo = '   '
    vi.spyOn(repository, 'load').mockResolvedValue(data)

    renderOutfitRoutes(repository, '/outfits/outfit-favorite')

    const emptyMemoCard = (await screen.findByText('2026-04-12')).closest<HTMLElement>(
      '.history-card',
    )
    const filledMemoCard = screen
      .getByText('2026-05-03')
      .closest<HTMLElement>('.history-card')

    expect(emptyMemoCard).toBeInTheDocument()
    expect(filledMemoCard).toBeInTheDocument()
    expect(within(emptyMemoCard!).queryByText('메모')).not.toBeInTheDocument()
    expect(within(filledMemoCard!).getByText('메모')).toBeInTheDocument()
    expect(within(filledMemoCard!).getByText('전체적으로 만족')).toBeInTheDocument()
  })

  it('착용 기록이 없는 Outfit은 확인 뒤 영구 삭제한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    await repository.createOutfit({
      id: 'outfit-unworn',
      displayName: '미착용 착장',
      allowDuplicate: true,
      items: [
        {
          itemId: 'item-cardigan',
          slot: 'outer',
          sortOrder: 0,
          positionX: 0,
          positionY: 0,
          itemScale: 1,
          zIndex: 10,
        },
      ],
    })
    const deleteOutfit = vi.spyOn(repository, 'deleteOutfit')

    renderOutfitRoutes(repository, '/outfits/outfit-unworn')

    await user.click(await screen.findByRole('button', { name: '삭제' }))
    expect(screen.getByRole('alert')).toHaveTextContent('이 Outfit을 영구 삭제할까요?')
    await user.click(screen.getByRole('button', { name: '삭제 확인' }))

    expect(await screen.findByRole('heading', { name: '착장' })).toBeInTheDocument()
    expect(deleteOutfit).toHaveBeenCalledWith('outfit-unworn')
    expect((await repository.load()).outfits.some((outfit) => outfit.id === 'outfit-unworn')).toBe(false)
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
