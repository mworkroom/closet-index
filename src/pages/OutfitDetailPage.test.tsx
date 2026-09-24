import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { OutfitDetailPage } from './OutfitDetailPage'

function renderOutfitDetail(repository: DemoRepository, outfitId: string) {
  return render(
    <MemoryRouter initialEntries={[`/outfits/${outfitId}`]}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/outfits/:outfitId" element={<OutfitDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('OutfitDetailPage wear summary', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(cleanup)

  it('실제 OK 온도와 최초·마지막 착용일을 Item 상세와 같은 위치에 표시한다', async () => {
    renderOutfitDetail(new DemoRepository(), 'outfit-favorite')

    const summary = await screen.findByText('착용 온도')
    expect(summary.nextElementSibling).toHaveTextContent('18 ~ 20°C')
    expect(screen.getByText('상태').nextElementSibling).toHaveTextContent('착용 가능')

    const stats = screen.getByRole('region', { name: '착장 사용 정보' })
    expect(Array.from(stats.children).map((entry) => entry.textContent)).toEqual([
      '최초 착용일4/12/26',
      '마지막 착용5/3/26',
      '착용 횟수2회',
    ])
  })

  it('구성 Item이 Retired이면 착용 불가능으로, 기록이 없으면 근거 없음으로 표시한다', async () => {
    const repository = new DemoRepository()
    await repository.setItemRetired('item-knit', true)
    renderOutfitDetail(repository, 'outfit-unrated')

    const summary = await screen.findByText('착용 온도')
    expect(summary.nextElementSibling).toHaveTextContent('근거 없음')
    expect(screen.getByText('상태').nextElementSibling).toHaveTextContent('착용 불가능')

    const stats = screen.getByRole('region', { name: '착장 사용 정보' })
    expect(within(stats).getByText('최초 착용일').nextElementSibling).toHaveTextContent('기록 없음')
    expect(within(stats).getByText('마지막 착용').nextElementSibling).toHaveTextContent('기록 없음')
    expect(within(stats).getByText('착용 횟수').nextElementSibling).toHaveTextContent('0회')
  })
})
