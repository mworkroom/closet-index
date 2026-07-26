import { AlertCircle, RotateCcw } from 'lucide-react'

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="state-card">
      <p className="state-card__title">{title}</p>
      {description && <p className="muted">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="state-card state-card--error" role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <p className="state-card__title">문제가 생겼어요</p>
      <p className="muted">{message}</p>
      {onRetry && (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          <RotateCcw size={17} aria-hidden="true" />
          다시 시도
        </button>
      )}
    </div>
  )
}
