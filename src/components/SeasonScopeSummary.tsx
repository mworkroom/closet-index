import { Link } from 'react-router-dom'
import { useSeasonScope } from '../context/SeasonScopeContext'
import { formatSeasonScope } from '../lib/seasons'

export function SeasonScopeSummary() {
  const { activeSeasons } = useSeasonScope()

  return (
    <div className="season-scope-summary" aria-label="현재 옷장 범위">
      <span>
        현재 옷장 <strong>{formatSeasonScope(activeSeasons)}</strong>
      </span>
      <Link to="/settings">변경</Link>
    </div>
  )
}
