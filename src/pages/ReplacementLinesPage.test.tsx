import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { ReplacementLinesPage } from './ReplacementLinesPage'

afterEach(cleanup)

describe('ReplacementLinesPage', () => {
  it('opens with a compact color index instead of the full Line and Item list', async () => {
    const repository = new DemoRepository()
    const loadReplacementLines = vi.spyOn(repository, 'loadReplacementLines')
    render(
      <MemoryRouter initialEntries={['/replacement-lines']}>
        <DataProvider repository={repository}>
          <Routes>
            <Route
              path="/replacement-lines"
              element={<ReplacementLinesPage />}
            />
            <Route path="/replacement-lines/:lineId" element={<p>계보 화면</p>} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Color' })).toBeInTheDocument()
    expect(loadReplacementLines).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Black, 1개 Line 보기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Blue, 1개 Line 보기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Navy, 1개 Line 보기' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '색상 확인 필요, 2개 Line 보기' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Navy Tee')).not.toBeInTheDocument()
    expect(screen.queryByText('블루 가디건')).not.toBeInTheDocument()
  })

  it('creates a new empty Line from the page top and opens its Item management screen', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createReplacementLine = vi.spyOn(repository, 'createReplacementLine')
    render(
      <MemoryRouter initialEntries={['/replacement-lines']}>
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/replacement-lines" element={<ReplacementLinesPage />} />
            <Route
              path="/replacement-lines/:lineId"
              element={<p>새 Line 상세 화면</p>}
            />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '새 Line 추가' }))
    await user.type(screen.getByLabelText('Line 이름'), 'Brown Bottom Spring')
    await user.type(screen.getByLabelText('Style Identity (선택)'), 'Brown Bottom')
    await user.selectOptions(screen.getByLabelText('대표 색상 category'), 'Brown')
    await user.click(
      screen.getByRole('button', { name: 'Line 만들고 Item 추가하기' }),
    )

    expect(createReplacementLine).toHaveBeenCalledWith({
      name: 'Brown Bottom Spring',
      styleIdentity: 'Brown Bottom',
      colorCategory: 'Brown',
    })
    expect(await screen.findByText('새 Line 상세 화면')).toBeInTheDocument()

    const snapshot = await repository.loadReplacementLines()
    const created = snapshot.lines.find(
      (line) => line.name === 'Brown Bottom Spring',
    )!
    expect(created.colorCategory).toBe('Brown')
    expect(
      snapshot.memberships.filter(
        (membership) => membership.replacementLineId === created.id,
      ),
    ).toEqual([])
  })

  it('filters by color and opens the selected Line lineage directly', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route path="/replacement-lines" element={<ReplacementLinesPage />} />
            <Route path="/replacement-lines/:lineId" element={<p>계보 화면</p>} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await user.click(
      await screen.findByRole('link', { name: 'Navy, 1개 Line 보기' }),
    )

    expect(screen.getByRole('heading', { name: 'Navy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Navy Tee 계보 보기' })).toHaveAttribute(
      'href',
      '/replacement-lines/line-navy-tee',
    )
    expect(screen.queryByRole('link', { name: '계보 보기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Navy Tee 계보 보기' }))
    expect(screen.getByText('계보 화면')).toBeInTheDocument()
  })

  it('keeps the Legacy Link review queue inside the compact management section', async () => {
    render(
      <MemoryRouter initialEntries={['/replacement-lines']}>
        <DataProvider repository={new DemoRepository()}>
          <ReplacementLinesPage />
        </DataProvider>
      </MemoryRouter>,
    )

    const legacySection = (
      await screen.findByRole('heading', { name: 'Legacy Link' })
    ).closest('section')!
    expect(within(legacySection).getByText('검토 0/2')).toBeInTheDocument()
    expect(legacySection).toHaveTextContent(
      '확인한 방향과 선택 이유는 계보 데이터로 보존됩니다.',
    )
    expect(
      within(legacySection).getByRole('link', {
        name: 'Legacy Link 검토 이어가기',
      }),
    ).toHaveAttribute('href', '/replacement-lines/review')
  })

  it('removes archived Lines from Color and keeps them in the management list', async () => {
    const repository = new DemoRepository()
    const snapshot = await repository.loadReplacementLines()
    const line = snapshot.lines.find(
      (entry) => entry.id === 'line-future-dress',
    )!
    await repository.setReplacementLineArchived({
      lineId: line.id,
      archived: true,
      expectedUpdatedAt: line.updatedAt,
    })

    render(
      <MemoryRouter initialEntries={['/replacement-lines']}>
        <DataProvider repository={repository}>
          <ReplacementLinesPage />
        </DataProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Color' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Black, 1개 Line 보기' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '보관된 Line' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Future Black Dress 보관된 Line 보기' }),
    ).toHaveAttribute('href', '/replacement-lines/line-future-dress')
  })
})
