import { BarChart3, CalendarDays, ChevronRight, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'

const links = [
  {
    to: '/calendar',
    title: 'Calendar',
    description: '날짜별 착용 기록 확인·수정',
    icon: CalendarDays,
  },
  {
    to: '/statistics',
    title: 'Statistics',
    description: 'Outfit과 Item 착용 집계',
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
