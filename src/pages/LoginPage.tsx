import { LogIn } from 'lucide-react'

export function LoginPage({
  loading = false,
  error,
  onLogin,
}: {
  loading?: boolean
  error?: string | null
  onLogin: () => Promise<void>
}) {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">PERSONAL LOOKBOOK</p>
        <h1>Closet Index</h1>
        <p className="muted">
          실제로 입어 본 기록을 바탕으로 오늘의 착장을 다시 찾습니다.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button--primary button--wide"
          type="button"
          disabled={loading}
          onClick={() => void onLogin()}
        >
          <LogIn size={18} aria-hidden="true" />
          {loading ? '계정 확인 중…' : 'Google로 로그인'}
        </button>
      </div>
    </main>
  )
}

export function AccessDeniedPage({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">ACCESS DENIED</p>
        <h1>허용되지 않은 계정입니다</h1>
        <p className="muted">
          옷장 데이터는 표시되지 않았습니다. 허용 목록에 등록된 계정으로 다시
          로그인해 주세요.
        </p>
        <button
          className="button button--secondary button--wide"
          type="button"
          onClick={() => void onLogout()}
        >
          다른 계정으로 로그인
        </button>
      </div>
    </main>
  )
}
