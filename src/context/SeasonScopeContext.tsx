import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  normalizeSeasonScope,
  SEASONS,
  type Season,
} from '../lib/seasons'

export const SEASON_SCOPE_STORAGE_KEY = 'closet-index-season-scope-v1'

interface SeasonScopeState {
  activeSeasons: Season[]
  setActiveSeasons: (seasons: Season[]) => void
  toggleSeason: (season: Season) => void
  showAllSeasons: () => void
}

const SeasonScopeContext = createContext<SeasonScopeState | null>(null)

function loadStoredSeasonScope() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(SEASON_SCOPE_STORAGE_KEY)
    return stored ? normalizeSeasonScope(JSON.parse(stored)) : []
  } catch {
    return []
  }
}

export function SeasonScopeProvider({ children }: PropsWithChildren) {
  const [activeSeasons, setActiveSeasonsState] = useState<Season[]>(
    loadStoredSeasonScope,
  )

  useEffect(() => {
    window.localStorage.setItem(
      SEASON_SCOPE_STORAGE_KEY,
      JSON.stringify(activeSeasons),
    )
  }, [activeSeasons])

  const setActiveSeasons = useCallback((seasons: Season[]) => {
    setActiveSeasonsState(normalizeSeasonScope(seasons))
  }, [])

  const toggleSeason = useCallback((season: Season) => {
    setActiveSeasonsState((current) => {
      const selected = new Set(current)
      if (selected.has(season)) selected.delete(season)
      else selected.add(season)
      return SEASONS.filter((value) => selected.has(value))
    })
  }, [])

  const showAllSeasons = useCallback(() => {
    setActiveSeasonsState([])
  }, [])

  const value = useMemo<SeasonScopeState>(
    () => ({
      activeSeasons,
      setActiveSeasons,
      toggleSeason,
      showAllSeasons,
    }),
    [activeSeasons, setActiveSeasons, showAllSeasons, toggleSeason],
  )

  return (
    <SeasonScopeContext.Provider value={value}>
      {children}
    </SeasonScopeContext.Provider>
  )
}

export function useSeasonScope() {
  const value = useContext(SeasonScopeContext)
  if (!value) throw new Error('SeasonScopeProvider가 필요합니다.')
  return value
}
