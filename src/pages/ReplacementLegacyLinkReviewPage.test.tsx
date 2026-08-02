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
    expect(screen.getByText('Soft Layer')).toBeInTheDocument()

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
})
