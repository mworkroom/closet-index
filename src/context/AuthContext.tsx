import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { User } from '@supabase/supabase-js'
import {
  checkAppAccess,
  isDemoMode,
  signInWithGoogle,
  signOut,
  supabase,
} from '../lib/supabase'

interface AuthState {
  mode: 'demo' | 'supabase'
  user: User | null
  loading: boolean
  allowed: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!isDemoMode)
  const [allowed, setAllowed] = useState(isDemoMode)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return

    let active = true
    const applyUser = async (nextUser: User | null) => {
      if (!active) return
      setUser(nextUser)
      setError(null)
      if (!nextUser) {
        setAllowed(false)
        setLoading(false)
        return
      }

      try {
        setAllowed(await checkAppAccess(nextUser))
      } catch (cause) {
        setAllowed(false)
        setError(cause instanceof Error ? cause.message : '계정 확인에 실패했습니다.')
      } finally {
        setLoading(false)
      }
    }

    void supabase.auth.getUser().then(({ data }) => applyUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      mode: isDemoMode ? 'demo' : 'supabase',
      user,
      loading,
      allowed,
      error,
      login: signInWithGoogle,
      logout: signOut,
    }),
    [allowed, error, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider가 필요합니다.')
  return value
}
