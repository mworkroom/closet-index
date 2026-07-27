import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SEASON_SCOPE_STORAGE_KEY,
  SeasonScopeProvider,
  useSeasonScope,
} from './SeasonScopeContext'

function SeasonHarness() {
  const { activeSeasons, showAllSeasons, toggleSeason } = useSeasonScope()
  return (
    <>
      <output>{activeSeasons.join(',') || 'all'}</output>
      <button type="button" onClick={() => toggleSeason('Summer')}>
        여름
      </button>
      <button type="button" onClick={() => toggleSeason('Fall')}>
        가을
      </button>
      <button type="button" onClick={showAllSeasons}>
        전체
      </button>
    </>
  )
}

describe('SeasonScopeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('복수 계절 선택을 localStorage에 보존하고 전체 범위로 되돌린다', async () => {
    const user = userEvent.setup()
    render(
      <SeasonScopeProvider>
        <SeasonHarness />
      </SeasonScopeProvider>,
    )

    expect(screen.getByText('all')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '여름' }))
    await user.click(screen.getByRole('button', { name: '가을' }))
    expect(screen.getByText('Summer,Fall')).toBeInTheDocument()
    expect(
      JSON.parse(window.localStorage.getItem(SEASON_SCOPE_STORAGE_KEY) ?? ''),
    ).toEqual(['Summer', 'Fall'])

    await user.click(screen.getByRole('button', { name: '전체' }))
    expect(screen.getByText('all')).toBeInTheDocument()
  })

  it('저장된 선택을 첫 화면에서 복원한다', () => {
    window.localStorage.setItem(
      SEASON_SCOPE_STORAGE_KEY,
      JSON.stringify(['Fall', 'Summer']),
    )

    render(
      <SeasonScopeProvider>
        <SeasonHarness />
      </SeasonScopeProvider>,
    )

    expect(screen.getByText('Summer,Fall')).toBeInTheDocument()
  })
})
