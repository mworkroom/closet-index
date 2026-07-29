import { useMemo } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { SeasonScopeProvider } from './context/SeasonScopeContext'
import { DemoRepository } from './data/demo-repository'
import type { ClosetRepository } from './data/repository'
import { SupabaseRepository } from './data/supabase-repository'
import { CLOSET_WORKSPACE_ID, supabase } from './lib/supabase'
import { CalendarPage } from './pages/CalendarPage'
import { ClosetPage } from './pages/ClosetPage'
import { HomePage } from './pages/HomePage'
import { ItemDetailPage } from './pages/ItemDetailPage'
import { ItemEditorPage } from './pages/ItemEditorPage'
import { AccessDeniedPage, LoginPage } from './pages/LoginPage'
import { LookbookPage } from './pages/LookbookPage'
import { MorePage } from './pages/MorePage'
import { OutfitDetailPage } from './pages/OutfitDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { WearLogPage } from './pages/WearLogPage'

function AuthenticatedApp() {
  const auth = useAuth()
  const repository = useMemo<ClosetRepository | null>(() => {
    if (auth.mode === 'demo') return new DemoRepository()
    if (auth.user && supabase) {
      return new SupabaseRepository(supabase, CLOSET_WORKSPACE_ID)
    }
    return null
  }, [auth.mode, auth.user])

  if (auth.loading) {
    return <LoginPage loading error={auth.error} onLogin={auth.login} />
  }
  if (auth.mode === 'supabase' && !auth.user) {
    return <LoginPage error={auth.error} onLogin={auth.login} />
  }
  if (!auth.allowed) {
    return <AccessDeniedPage onLogout={auth.logout} />
  }
  if (!repository) {
    return <LoginPage error="데이터 저장소를 준비하지 못했습니다." onLogin={auth.login} />
  }

  return (
    <SeasonScopeProvider>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/closet" element={<ClosetPage />} />
          <Route path="/closet/new" element={<ItemEditorPage />} />
          <Route path="/closet/:itemId/edit" element={<ItemEditorPage />} />
          <Route path="/closet/:itemId" element={<ItemDetailPage />} />
          <Route path="/lookbook" element={<LookbookPage />} />
          <Route path="/favorite" element={<LookbookPage favoriteOnly />} />
          <Route path="/outfits/:outfitId" element={<OutfitDetailPage />} />
          <Route path="/wear/:outfitId" element={<WearLogPage />} />
          <Route path="/records/:logId/edit" element={<WearLogPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DataProvider>
    </SeasonScopeProvider>
  )
}

export function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
