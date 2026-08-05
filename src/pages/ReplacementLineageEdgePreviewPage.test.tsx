import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { ReplacementLineageEdgePreviewPage } from './ReplacementLineageEdgePreviewPage'

describe('ReplacementLineageEdgePreviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(
      'closet-index-demo-legacy-link-reviews:v1',
      JSON.stringify({
        'legacy-layer': {
          reviewStatus: 'reviewed',
          reviewDecision: 'a_to_b',
          reviewReason: '부드러운 레이어 역할을 이어감',
          reviewedAt: '2026-08-03T00:10:00.000Z',
          updatedAt: '2026-08-03T00:10:00.000Z',
        },
        'legacy-shoes': {
          reviewStatus: 'reviewed',
          reviewDecision: 'parallel',
          reviewReason: '둘 다 계속 신는 역할',
          reviewedAt: '2026-08-03T00:20:00.000Z',
          updatedAt: '2026-08-03T00:20:00.000Z',
        },
      }),
    )
  })
  afterEach(cleanup)

  it('opens a final batch preview and saves its directional edges together', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    render(
      <MemoryRouter>
        <DataProvider repository={repository}>
          <ReplacementLineageEdgePreviewPage />
        </DataProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '후보 분류' }),
    ).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: '후보 분류' })
    expect(within(summary).getByText('방향 후보')).toBeInTheDocument()
    expect(within(summary).getAllByText('1개')).toHaveLength(3)
    expect(screen.getByRole('heading', { name: '저장 전 구조 점검' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Soft Layer' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Blue Layer' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '최종 저장 미리보기' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Soft Layer' }))
    await user.click(screen.getByRole('button', { name: '최종 저장 미리보기' }))
    expect(screen.getByRole('heading', { name: '1개 edge를 한 번에 저장' })).toBeInTheDocument()
    expect(screen.getByText('한 후보라도 최신 검토 결과와 다르거나 DB 계약을 통과하지 못하면 전체 저장이 rollback됩니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '1개 edge 확정 저장' }))
    expect(await screen.findByText('1개 edge가 이미 저장돼 있어요')).toBeInTheDocument()
    await expect(repository.replacementLines.loadEdges()).resolves.toHaveLength(1)
  })
})
