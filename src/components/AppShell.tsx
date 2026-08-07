import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Home,
  MoreHorizontal,
  Shirt,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { PropsWithChildren, ReactNode } from 'react'

const tabs = [
  { to: '/', label: 'HOME', icon: Home, end: true },
  { to: '/calendar', label: 'CALENDAR', icon: CalendarDays },
  { to: '/closet', label: 'CLOSET', icon: Shirt },
  { to: '/lookbook', label: 'LOOKBOOK', icon: BookOpen },
  {
    to: '/more',
    label: 'MORE',
    icon: MoreHorizontal,
    activePaths: ['/favorite', '/statistics', '/settings'],
  },
]

export function AppShell({
  title,
  eyebrow,
  children,
  back = false,
  action,
  subtitle,
  hideNavigation = false,
  hideTitle = false,
  fillViewport = false,
  wide = false,
}: PropsWithChildren<{
  title: string
  eyebrow?: string
  back?: boolean
  action?: ReactNode
  subtitle?: ReactNode
  hideNavigation?: boolean
  hideTitle?: boolean
  fillViewport?: boolean
  wide?: boolean
}>) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div
      className={[
        'app-frame',
        fillViewport ? 'app-frame--fill-viewport' : '',
        wide ? 'app-frame--wide' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="topbar">
        <div className="topbar__lead">
          {back && (
            <button
              className="icon-button"
              type="button"
              aria-label="뒤로 가기"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
          )}
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 className={hideTitle ? 'sr-only' : undefined}>{title}</h1>
            {subtitle ? <div className="topbar__subtitle">{subtitle}</div> : null}
          </div>
        </div>
        {action && <div className="topbar__action">{action}</div>}
      </header>

      <main
        className={[
          'page',
          hideNavigation ? 'page--no-nav' : '',
          fillViewport ? 'page--fill-viewport' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </main>

      {!hideNavigation && (
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {tabs.map(({ to, label, icon: Icon, end, activePaths }) => {
            const aliasActive = activePaths?.some((path) =>
              location.pathname.startsWith(path),
            )
            return (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-current={aliasActive ? 'page' : undefined}
              className={({ isActive }) =>
                `bottom-nav__item${isActive || aliasActive ? ' bottom-nav__item--active' : ''}`
              }
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}
