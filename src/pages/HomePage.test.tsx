import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { HomePage } from './HomePage'

describe('HomePage condition choices', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
})
