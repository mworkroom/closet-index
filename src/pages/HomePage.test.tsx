import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { HomePage } from './HomePage'

describe('HomePage condition choices', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('비와 오래 걷기는 해당 없음과 해당만 제공한다', async () => {
    render(
      <MemoryRouter>
        <DataProvider repository={new DemoRepository()}>
          <HomePage />
        </DataProvider>
      </MemoryRouter>,
    )

    await screen.findByText('오늘의 조건과 실제 착용 기록을 비교해 이미 검증한 착장을 찾습니다.')

    for (const name of ['비', '오래 걷기']) {
      const group = screen.getByRole('group', { name })
      const radios = within(group).getAllByRole('radio')

      expect(radios).toHaveLength(2)
      expect(within(group).getByRole('radio', { name: '해당 없음' })).toBeChecked()
      expect(within(group).getByRole('radio', { name: '해당' })).not.toBeChecked()
      expect(within(group).queryByRole('radio', { name: '미지정' })).not.toBeInTheDocument()
    }
  })

  it('예보를 명시적으로 적용하고 같은 탭에서 추천 입력을 복원한다', async () => {
    const user = userEvent.setup()
    const renderPage = () =>
      render(
        <MemoryRouter>
          <DataProvider repository={new DemoRepository()}>
            <HomePage />
          </DataProvider>
        </MemoryRouter>,
      )

    const first = renderPage()
    await screen.findByText('창4동')

    await user.click(screen.getByRole('button', { name: '날씨 불러오기' }))
    await screen.findByText('24°C')
    expect(
      screen.queryByRole('heading', { name: '추천 착장' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '이 날씨로 추천 보기' }),
    )

    expect(screen.getByRole('spinbutton', { name: /출발 온도/ })).toHaveValue(
      24,
    )
    expect(screen.getByRole('spinbutton', { name: /귀가 온도/ })).toHaveValue(
      20,
    )
    expect(await screen.findByRole('heading', { name: '추천 착장' })).toBeVisible()

    first.unmount()
    renderPage()

    expect(
      await screen.findByRole('spinbutton', { name: /출발 온도/ }),
    ).toHaveValue(24)
    expect(screen.getByRole('spinbutton', { name: /귀가 온도/ })).toHaveValue(
      20,
    )
    expect(await screen.findByRole('heading', { name: '추천 착장' })).toBeVisible()
  })
})
