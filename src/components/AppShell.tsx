import {
  ArrowLeft,
  BookOpen,
  Heart,
  Home,
  MoreHorizontal,
  Shirt,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { PropsWithChildren, ReactNode } from 'react'

const tabs = [
  { to: '/', label: 'HOME', icon: Home, end: true },
  { to: '/closet', label: 'CLOSET', icon: Shirt },
  { to: '/lookbook', label: 'LOOKBOOK', icon: BookOpen },
  { to: '/favorite', label: 'FAVORITE', icon: Heart },
  { to: '/more', label: 'MORE', icon: MoreHorizontal },
]

export function AppShell({
  title,
  eyebrow,
  children,
  back = false,
  action,
  hideNavigation = false,
}: PropsWithChildren<{
  title: string
  eyebrow?: string
  back?: boolean
  action?: ReactNode
  hideNavigation?: boolean
}>) {
  const navigate = useNavigate()

  return (
    <div className="app-frame">
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
            <h1>{title}</h1>
          </div>
        </div>
        {action && <div className="topbar__action">{action}</div>}
      </header>

      <main className={hideNavigation ? 'page page--no-nav' : 'page'}>{children}</main>

      {!hideNavigation && (
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`
              }
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
