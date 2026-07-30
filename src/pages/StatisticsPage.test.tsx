import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { StatisticsPage } from './StatisticsPage'

describe('StatisticsPage category counts', () => {
  it('shows detailed category tags grouped by their upper category', async () => {
    render(
      <MemoryRouter>
        <DataProvider repository={new DemoRepository()}>
          <StatisticsPage />
        </DataProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '카테고리별 보유' }),
    ).toBeInTheDocument()

    const topGroup = screen.getByRole('region', { name: 'Top' })
    expect(within(topGroup).getByText('Top-Knitwear')).toBeInTheDocument()
    expect(within(topGroup).getByText('Top-T-shirts')).toBeInTheDocument()
    expect(within(topGroup).getByText('전체 2개 · 사용 중 2개')).toBeInTheDocument()

    const shoesGroup = screen.getByRole('region', { name: 'Shoes' })
    expect(within(shoesGroup).getAllByText('Shoes')).toHaveLength(2)
    expect(within(shoesGroup).getByText('전체 2개 · 사용 중 1개')).toBeInTheDocument()
  })
})
