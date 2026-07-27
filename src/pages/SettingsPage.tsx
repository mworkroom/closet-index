import { LogOut } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../context/AuthContext'
import { useSeasonScope } from '../context/SeasonScopeContext'
import {
  formatSeasonScope,
  SEASONS,
  seasonLabels,
} from '../lib/seasons'

export function SettingsPage() {
  const { mode, user, logout } = useAuth()
  const {
    activeSeasons,
    showAllSeasons,
    toggleSeason,
  } = useSeasonScope()
  const appVersion = import.meta.env.VITE_APP_VERSION ?? '0.1.0'
  const dataVersion =
    import.meta.env.VITE_DATA_VERSION ?? (mode === 'demo' ? 'demo-v1' : 'not-set')

  return (
    <AppShell title="Settings" eyebrow="ACCOUNT & DATA" back>
      <section className="section season-settings" aria-labelledby="season-settings-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT WARDROBE</p>
            <h2 id="season-settings-title">현재 옷장 범위</h2>
          </div>
        </div>
        <p className="muted season-settings__description">
          Closet과 Lookbook에서 둘러볼 계절을 선택해 주세요. 여러 계절을
          함께 선택할 수 있고, HOME 추천은 온도를 우선합니다.
        </p>
        <div className="season-settings__options">
          <button
            className="season-option"
            type="button"
            aria-pressed={activeSeasons.length === 0}
            onClick={showAllSeasons}
          >
            전체
          </button>
          {SEASONS.map((season) => (
            <button
              className="season-option"
              type="button"
              aria-pressed={activeSeasons.includes(season)}
              onClick={() => toggleSeason(season)}
              key={season}
            >
              {seasonLabels[season]}
            </button>
          ))}
        </div>
        <p className="season-settings__status" role="status">
          현재 적용: <strong>{formatSeasonScope(activeSeasons)}</strong>
        </p>
      </section>

      <section className="settings-card">
        <div>
          <span>로그인 계정</span>
          <strong>{mode === 'demo' ? '로컬 데모 모드' : user?.email ?? '확인 불가'}</strong>
        </div>
        <div>
          <span>앱 버전</span>
          <strong>{appVersion} · Phase 1B</strong>
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
