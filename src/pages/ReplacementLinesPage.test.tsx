import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { ReplacementLinesPage } from './ReplacementLinesPage'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('ReplacementLinesPage', () => {
  it('opens with a compact color index instead of the full Line and Item list', async () => {
    const repository = new DemoRepository()
    const loadReplacementLines = vi.spyOn(repository.replacementLines, 'load')
    const loadLegacyLinks = vi.spyOn(repository.replacementLines, 'loadLegacyLinks')
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
    expect(loadLegacyLinks).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Line 관리 현황' })).toBeInTheDocument()
    expect(screen.getByText('고유 Item')).toBeInTheDocument()
    expect(screen.getByText('Active / Retired')).toBeInTheDocument()
    expect(screen.queryByText('빈 Line')).not.toBeInTheDocument()
    expect(screen.queryByText('단일 Item')).not.toBeInTheDocument()
    expect(screen.queryByText('색상별로 이어 온 Item')).not.toBeInTheDocument()
    expect(screen.queryByText('Legacy Link')).not.toBeInTheDocument()
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
    const createReplacementLine = vi.spyOn(repository.replacementLines, 'create')
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

    const createButton = await screen.findByRole('button', { name: 'Add' })
    expect(createButton.closest('.topbar')).toHaveTextContent('Replacement Lines')
    createButton.focus()
    expect(createButton).toHaveFocus()
    await user.keyboard('{Enter}')
    const nameField = screen.getByLabelText('Line 이름')
    expect(nameField).toHaveFocus()
    await user.type(nameField, 'Brown Bottom Spring')
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

    const snapshot = await repository.replacementLines.load()
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
    const identityHeading = screen.getByRole('heading', {
      name: 'Daily Uniform',
      level: 3,
    })
    expect(identityHeading).toBeInTheDocument()
    expect(within(identityHeading.parentElement!).getByText('1 Lines')).toBeInTheDocument()
    const navyLine = screen.getByRole('link', { name: 'Navy Tee 계보 보기' })
    expect(navyLine).toHaveAttribute(
      'href',
      '/replacement-lines/line-navy-tee',
    )
    expect(within(navyLine).queryByText('Daily Uniform')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '계보 보기' })).not.toBeInTheDocument()

    await user.click(navyLine)
    expect(screen.getByText('계보 화면')).toBeInTheDocument()
  })

  it('replaces the single-Item warning with an accessible Line survival badge', async () => {
    const repository = new DemoRepository()
    await repository.setItemRetired('item-tee', true)
    const snapshot = await repository.replacementLines.load()
    snapshot.lines = snapshot.lines.map((line) =>
      line.id === 'line-navy-tee'
        ? { ...line, reviewStatus: 'needs_review' }
        : line,
    )
    window.localStorage.setItem(
      'closet-index-demo-replacement-lines:v1',
      JSON.stringify(snapshot),
    )

    render(
      <MemoryRouter initialEntries={['/replacement-lines?color=navy']}>
        <DataProvider repository={repository}>
          <ReplacementLinesPage />
        </DataProvider>
      </MemoryRouter>,
    )

    const lineCard = await screen.findByRole('link', {
      name: 'Navy Tee 계보 보기. 💀 멸종: 현재 사용할 대체 Item 없음',
    })
    expect(within(lineCard).getByText('💀 멸종')).toHaveAccessibleName(
      '💀 멸종: 현재 사용할 대체 Item 없음',
    )
    expect(within(lineCard).getByText('재검토 필요')).toBeInTheDocument()
    expect(within(lineCard).queryByText('단일 Item')).not.toBeInTheDocument()
  })

  it('keeps only archived Line tools inside the compact management section', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines']}>
        <DataProvider repository={new DemoRepository()}>
          <ReplacementLinesPage />
        </DataProvider>
      </MemoryRouter>,
    )

    const tools = await screen.findByText('관리 도구')
    expect(screen.queryByText('Legacy Link')).not.toBeInTheDocument()
    await user.click(tools.closest('summary')!)
    expect(screen.getByText('보관된 Line이 없습니다.')).toBeInTheDocument()
  })

  it('removes archived Lines from Color and keeps them in the management list', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const snapshot = await repository.replacementLines.load()
    const line = snapshot.lines.find(
      (entry) => entry.id === 'line-future-dress',
    )!
    await repository.replacementLines.setArchived({
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
    await user.click(screen.getByText('관리 도구').closest('summary')!)
    expect(screen.getByRole('heading', { name: '보관된 Line' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Future Black Dress 보관된 Line 보기' }),
    ).toHaveAttribute('href', '/replacement-lines/line-future-dress')
  })
})
