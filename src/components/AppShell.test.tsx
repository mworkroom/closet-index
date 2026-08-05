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
      ['StatisticsItem 활용률과 실제 착용 기록 확인', '/statistics'],
      [
        'Replacement Lines같은 역할을 이어 온 Item 계보와 검토',
        '/replacement-lines',
      ],
      ['Maintenance장기 미착용 Item 점검', '/maintenance'],
      ['Settings계정과 데이터 원본 상태', '/settings'],
    ])
    expect(within(menu!).queryByText('Calendar')).not.toBeInTheDocument()
  })
})
