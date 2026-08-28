import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { demoData } from '../data/demo-data'
import { DemoRepository } from '../data/demo-repository'
import { ClosetPage } from './ClosetPage'

function renderCloset() {
  return render(
    <MemoryRouter>
      <SeasonScopeProvider>
        <DataProvider repository={new DemoRepository()}>
          <ClosetPage />
        </DataProvider>
      </SeasonScopeProvider>
    </MemoryRouter>,
  )
}

describe('Closet 오늘 온도 필터', () => {
  beforeEach(() => {
    window.localStorage.clear()
    const data = structuredClone(demoData)
    const template = data.items.find((item) => item.id === 'item-belt')
    const summer = data.outfits.find((outfit) => outfit.id === 'outfit-summer')
    if (!template || !summer) throw new Error('fixture missing')

    data.items.push(
      { ...template, id: 'item-bag', name: '여름 가방', category: 'Bags' },
      { ...template, id: 'item-socks', name: '여름 양말', category: 'Socks' },
    )
    summer.itemIds.push('item-bag', 'item-socks')
    window.localStorage.setItem(
      'closet-index-demo-data-v3',
      JSON.stringify(data),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('모든 카테고리의 온도 근거를 표시하고 오늘 온도·카테고리·검색어를 함께 적용한다', async () => {
    const user = userEvent.setup()
    const first = renderCloset()

    const bag = await screen.findByRole('link', {
      name: '여름 가방 아이템 상세 보기',
    })
    expect(within(bag).getByText('24~28°C · OK 관측 1개')).toBeInTheDocument()
    const unknown = screen.getByRole('link', {
      name: /버건디 벨트 아이템 상세 보기/,
    })
    expect(within(unknown).getByText('온도 근거 없음')).toBeInTheDocument()

    const temperature = screen.getByRole('spinbutton', { name: '오늘 온도' })
    await user.type(temperature, '26')

    expect(
      screen.getByRole('link', { name: /여름 가방.*24~28°C/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /여름 양말.*24~28°C/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /블루 가디건/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /버건디 벨트/ }),
    ).not.toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: '카테고리' }),
      'top',
    )
    await user.type(
      screen.getByRole('searchbox', { name: '아이템 검색' }),
      'T-shirts',
    )

    const grid = document.querySelector<HTMLElement>('.item-grid')
    expect(grid).toBeInTheDocument()
    expect(within(grid!).getAllByRole('link')).toHaveLength(1)
    expect(
      within(grid!).getByRole('link', { name: /네이비 티셔츠.*24~28°C/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      '26°C 근거 1개 · 온도 근거 없음 0개 · 다른 온도 근거 0개',
    )

    first.unmount()
    renderCloset()
    expect(
      await screen.findByRole('spinbutton', { name: '오늘 온도' }),
    ).toHaveValue(26)
  })
})
