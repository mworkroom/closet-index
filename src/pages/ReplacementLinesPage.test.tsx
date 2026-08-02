import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { ReplacementLinesPage } from './ReplacementLinesPage'

afterEach(cleanup)

describe('ReplacementLinesPage', () => {
  it('lazy-loads the read-only Overview with groups and quality warnings', async () => {
    const repository = new DemoRepository()
    const loadReplacementLines = vi.spyOn(repository, 'loadReplacementLines')
    render(
      <MemoryRouter initialEntries={['/statistics/replacement-lines']}>
        <DataProvider repository={repository}>
          <Routes>
            <Route
              path="/statistics/replacement-lines"
              element={<ReplacementLinesPage />}
            />
            <Route path="/closet/:itemId" element={<p>Item 상세</p>} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument()
    expect(loadReplacementLines).toHaveBeenCalledTimes(1)
    expect(screen.getByText('5 Lines')).toBeInTheDocument()
    expect(screen.getByText('6개')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Daily Uniform' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Style Identity 미지정' }),
    ).toBeInTheDocument()
    expect(screen.getByText('빈 Line')).toBeInTheDocument()
    expect(screen.getAllByText('단일 Item Line').length).toBeGreaterThan(0)
    expect(screen.getAllByText('복수 Line 소속 Item').length).toBeGreaterThan(0)
  })

  it('shows available Legacy Links without inventing direction and opens the review queue', async () => {
    render(
      <MemoryRouter initialEntries={['/statistics/replacement-lines']}>
        <DataProvider repository={new DemoRepository()}>
          <ReplacementLinesPage />
        </DataProvider>
      </MemoryRouter>,
    )

    const legacySection = (
      await screen.findByRole('heading', { name: 'Legacy Link' })
    ).closest('section')!
    expect(within(legacySection).getByText('검토 0/2')).toBeInTheDocument()
    expect(within(legacySection).getByText('2 pairs')).toBeInTheDocument()
    expect(legacySection).toHaveTextContent('개별 pair는 화살표 없이 보존됩니다.')
    expect(
      within(legacySection).getByRole('link', {
        name: 'Legacy Link 검토 이어가기',
      }),
    ).toHaveAttribute('href', '/statistics/replacement-lines/review')
    expect(legacySection).not.toHaveTextContent('→')
  })
})
