import { BarChart3, ChevronRight, Heart, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'

const links = [
  {
    to: '/favorite',
    title: 'Favorite',
    description: 'Favorite 착장만 모아보기',
    icon: Heart,
  },
  {
    to: '/statistics',
    title: 'Statistics',
    description: 'Item 활용률과 실제 착용 기록 확인',
    icon: BarChart3,
  },
  {
    to: '/settings',
    title: 'Settings',
    description: '계정과 데이터 원본 상태',
    icon: Settings,
  },
]

export function MorePage() {
  return (
    <AppShell title="More" eyebrow="RECORDS & SETTINGS">
      <div className="menu-list">
        {links.map(({ to, title, description, icon: Icon }) => (
          <Link to={to} key={to}>
            <span className="menu-list__icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="menu-list__body">
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
