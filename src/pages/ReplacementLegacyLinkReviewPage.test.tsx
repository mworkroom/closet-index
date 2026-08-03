import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { ReplacementLegacyLinkReviewPage } from './ReplacementLegacyLinkReviewPage'

describe('ReplacementLegacyLinkReviewPage', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(cleanup)

  it('saves only after preview confirmation and resumes from persisted progress', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const review = vi.spyOn(repository, 'reviewReplacementLegacyLink')
    const rendered = render(
      <MemoryRouter>
        <DataProvider repository={repository}>
          <ReplacementLegacyLinkReviewPage />
        </DataProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '다음 pair' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Item A: 블루 가디건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Item B: 아이보리 니트' })).toBeInTheDocument()
    expect(screen.getByText('Blue Layer · Soft Layer')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /A → B/ }))
    await user.type(
      screen.getByRole('textbox', { name: '선택 이유' }),
      '가디건 다음에 니트를 같은 역할로 선택함',
    )
    await user.click(screen.getByRole('button', { name: '선택 확인' }))

    expect(review).not.toHaveBeenCalled()
    const preview = screen.getByRole('region', { name: '저장 전 확인' })
    expect(preview).toHaveTextContent('블루 가디건 → 아이보리 니트')
    expect(preview).toHaveTextContent('가디건 다음에 니트를 같은 역할로 선택함')

    await user.click(within(preview).getByRole('button', { name: '이대로 저장' }))
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1))
    const progress = screen.getByRole('region', { name: '검토 진행' })
    expect(within(progress).getAllByText('1/2')).toHaveLength(2)
    expect(screen.getByRole('article', { name: 'Item A: 브라운 로퍼' })).toBeInTheDocument()

    rendered.unmount()
    render(
      <MemoryRouter>
        <DataProvider repository={new DemoRepository()}>
          <ReplacementLegacyLinkReviewPage />
        </DataProvider>
      </MemoryRouter>,
    )
    const resumedProgress = await screen.findByRole('region', {
      name: '검토 진행',
    })
    expect(within(resumedProgress).getAllByText('1/2')).toHaveLength(2)
    expect(screen.getByRole('article', { name: 'Item A: 브라운 로퍼' })).toBeInTheDocument()
  })

  it('reopens a completed review, previews the difference, and keeps it editable', async () => {
    window.localStorage.setItem(
      'closet-index-demo-legacy-link-reviews:v1',
      JSON.stringify({
        'legacy-layer': {
          reviewStatus: 'reviewed',
          reviewDecision: 'a_to_b',
          reviewReason: '처음에는 가디건 다음 니트로 판단',
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
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const review = vi.spyOn(repository, 'reviewReplacementLegacyLink')
    render(
      <MemoryRouter>
        <DataProvider repository={repository}>
          <ReplacementLegacyLinkReviewPage />
        </DataProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '검토한 관계' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: '블루 가디건, 아이보리 니트 다시 검토',
      }),
    )

    expect(
      screen.getByRole('heading', { name: '관계 다시 검토' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /A → B/ })).toBeChecked()
    const reason = screen.getByRole('textbox', { name: '선택 이유' })
    expect(reason).toHaveValue('처음에는 가디건 다음 니트로 판단')

    await user.click(screen.getByRole('radio', { name: /B → A/ }))
    await user.clear(reason)
    await user.type(reason, '실제로는 니트 다음에 가디건을 선택함')
    await user.click(screen.getByRole('button', { name: '변경 확인' }))

    const preview = screen.getByRole('region', { name: '변경 전 확인' })
    expect(preview).toHaveTextContent('현재 저장된 판단')
    expect(preview).toHaveTextContent('블루 가디건 → 아이보리 니트')
    expect(preview).toHaveTextContent('아이보리 니트 → 블루 가디건')
    expect(review).not.toHaveBeenCalled()

    await user.click(within(preview).getByRole('button', { name: '변경 저장' }))
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1))
    expect(review).toHaveBeenCalledWith('legacy-layer', {
      decision: 'b_to_a',
      reason: '실제로는 니트 다음에 가디건을 선택함',
      expectedUpdatedAt: '2026-08-03T00:10:00.000Z',
    })
    expect(
      screen.getByText('검토 결과를 변경했고 이전 판단은 이력에 보존했어요.'),
    ).toBeInTheDocument()
  })
})
