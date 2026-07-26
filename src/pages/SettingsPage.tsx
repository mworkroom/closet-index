import { LogOut } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../context/AuthContext'

export function SettingsPage() {
  const { mode, user, logout } = useAuth()
  const appVersion = import.meta.env.VITE_APP_VERSION ?? '0.1.0'
  const dataVersion =
    import.meta.env.VITE_DATA_VERSION ?? (mode === 'demo' ? 'demo-v1' : 'not-set')

  return (
    <AppShell title="Settings" eyebrow="ACCOUNT & DATA" back>
      <section className="settings-card">
        <div>
          <span>로그인 계정</span>
          <strong>{mode === 'demo' ? '로컬 데모 모드' : user?.email ?? '확인 불가'}</strong>
        </div>
        <div>
          <span>앱 버전</span>
          <strong>{appVersion} · Phase 1A</strong>
        </div>
        <div>
          <span>데이터 버전</span>
          <strong>{dataVersion} · phase-1-schema-v1</strong>
        </div>
        <div>
          <span>현재 데이터 원본</span>
          <strong>
            {mode === 'demo'
              ? '브라우저 데모 데이터'
              : 'Supabase · 전환 전 시험 데이터'}
          </strong>
        </div>
      </section>

      <p className="scope-note">
        정식 전환 전까지 실제 기록의 원본은 Notion입니다. 데모 데이터와 Technical
        Alpha의 Supabase 기록은 검증용입니다.
      </p>

      {mode === 'supabase' ? (
        <button
          className="button button--secondary button--wide"
          type="button"
          onClick={() => void logout()}
        >
          <LogOut size={18} aria-hidden="true" />
          로그아웃
        </button>
      ) : (
        <p className="muted center-text">데모 모드에는 로그인 세션이 없습니다.</p>
      )}
    </AppShell>
  )
}
