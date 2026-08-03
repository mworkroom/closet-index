import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import type { ReplacementLineEdge } from '../lib/types'
import { ReplacementLineagePage } from './ReplacementLineagePage'

const savedEdge: ReplacementLineEdge = {
  id: 'edge-layer',
  replacementLineId: 'line-soft-layer',
  predecessorItemId: 'item-cardigan',
  successorItemId: 'item-knit',
  sourceLegacyLinkId: 'legacy-layer',
  branchName: null,
  decisionReason: '구매일이 아니라 확인한 대체 관계',
  status: 'confirmed',
  confirmedAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
}

describe('ReplacementLineagePage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(
      'closet-index-demo-lineage-edges:v1',
      JSON.stringify([savedEdge]),
    )
  })
  afterEach(cleanup)

  it('renders graph generations from confirmed direction and opens Item detail', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/replacement-lines/line-soft-layer']}>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
            <Route path="/closet/:itemId" element={<p>Item 상세 도착</p>} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Soft Layer' })).toBeInTheDocument()
    expect(screen.getByText('사용 중 2 · Retired 0')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'G0 · 시작 아이템' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'G1 · 시작 아이템에서 이어짐' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.getByText('선택 이유 · 구매일이 아니라 확인한 대체 관계')).toBeInTheDocument()

    await user.click(
      screen.getByRole('link', { name: '아이보리 니트 Item 상세 보기' }),
    )
    expect(screen.getByText('Item 상세 도착')).toBeInTheDocument()
  })
})
