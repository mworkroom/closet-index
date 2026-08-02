import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MorePage } from '../pages/MorePage'
import { AppShell } from './AppShell'

afterEach(() => cleanup())

describe('Phase 3.5 navigation', () => {
  it('orders the five primary tabs and treats Favorite as a More page', () => {
    render(
      <MemoryRouter initialEntries={['/favorite']}>
        <AppShell title="Favorite">content</AppShell>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['HOME', '/'],
      ['CALENDAR', '/calendar'],
      ['CLOSET', '/closet'],
      ['LOOKBOOK', '/lookbook'],
      ['MORE', '/more'],
    ])
    expect(within(navigation).getByRole('link', { name: 'MORE' })).toHaveClass(
      'bottom-nav__item--active',
    )
  })

  it('places Favorite first inside More and removes Calendar from the list', () => {
    render(
      <MemoryRouter initialEntries={['/more']}>
        <MorePage />
      </MemoryRouter>,
    )

    const menu = document.querySelector<HTMLElement>('.menu-list')
    expect(menu).toBeInTheDocument()
    expect(
      within(menu!)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['FavoriteFavorite 착장만 모아보기', '/favorite'],
      ['Statistics착용 기록과 상세 카테고리별 보유 집계', '/statistics'],
      ['Settings계정과 데이터 원본 상태', '/settings'],
    ])
    expect(within(menu!).queryByText('Calendar')).not.toBeInTheDocument()
  })
})
