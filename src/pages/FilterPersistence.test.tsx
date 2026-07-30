import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { DemoRepository } from '../data/demo-repository'
import { ClosetPage } from './ClosetPage'
import { HomePage } from './HomePage'

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

function renderHome() {
  return render(
    <MemoryRouter>
      <DataProvider repository={new DemoRepository()}>
        <HomePage />
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('section filter persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('iPhone에서 화면이 다시 만들어져도 Closet 카테고리를 복원한다', async () => {
    const user = userEvent.setup()
    const first = renderCloset()
    const category = await screen.findByRole('combobox', { name: '카테고리' })

    await user.selectOptions(category, 'top')
    expect(category).toHaveValue('top')
    expect(
      await screen.findByRole('link', {
        name: '네이비 티셔츠 아이템 상세 보기',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: '아이보리 니트 아이템 상세 보기',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', {
        name: '블루 가디건 아이템 상세 보기',
      }),
    ).not.toBeInTheDocument()

    first.unmount()
    renderCloset()

    expect(
      await screen.findByRole('combobox', { name: '카테고리' }),
    ).toHaveValue('top')
  })

  it('이전 날짜의 HOME 조건은 복원하지 않는다', async () => {
    window.localStorage.setItem(
      'closet-index:home-weather:v3',
      JSON.stringify({
        savedOn: '2000-01-01',
        state: {
          tempOut: '13',
          submitted: {
            tempOut: 13,
            tempBack: null,
            rainCondition: 'no',
            longWalkCondition: 'no',
            placeId: null,
            transportModeId: null,
          },
        },
      }),
    )

    renderHome()

    expect(
      await screen.findByRole('spinbutton', { name: /출발 온도/ }),
    ).toHaveValue(20)
    expect(
      screen.queryByRole('heading', { name: '추천 착장' }),
    ).not.toBeInTheDocument()
  })
})
