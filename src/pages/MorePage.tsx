import {
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardCheck,
  GitBranch,
  Heart,
  Settings,
  Shirt,
} from 'lucide-react'
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
    to: '/replacement-lines',
    title: 'Replacement Lines',
    description: '같은 역할을 이어 온 Item 계보와 검토',
    icon: GitBranch,
  },
  {
    to: '/maintenance',
    title: 'Maintenance',
    description: '장기 미착용 점검과 교체 관리',
    icon: ClipboardCheck,
  },
  {
    to: '/laundry',
    title: 'Laundry',
    description: '손세탁과 드라이클리닝 관리',
    icon: Shirt,
  },
  {
    to: '/tools/place-hvac',
    title: 'Place Profile & HVAC',
    description: '고유 장소의 계절별 예상 냉난방 관리',
    icon: Building2,
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
