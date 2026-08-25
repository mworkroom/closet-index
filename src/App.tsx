import { lazy, Suspense, useMemo } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingState } from './components/States'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { SeasonScopeProvider } from './context/SeasonScopeContext'
import { DemoRepository } from './data/demo-repository'
import type { ClosetDataProviderRepository } from './data/repository'
import { SupabaseRepository } from './data/supabase-repository'
import { CLOSET_WORKSPACE_ID, supabase } from './lib/supabase'
import { AccessDeniedPage, LoginPage } from './pages/LoginPage'

const HomePage = lazy(() =>
  import('./pages/HomePage').then(({ HomePage }) => ({ default: HomePage })),
)
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then(({ CalendarPage }) => ({
    default: CalendarPage,
  })),
)
const ClosetPage = lazy(() =>
  import('./pages/ClosetPage').then(({ ClosetPage }) => ({
    default: ClosetPage,
  })),
)
const ItemDetailPage = lazy(() =>
  import('./pages/ItemDetailPage').then(({ ItemDetailPage }) => ({
    default: ItemDetailPage,
  })),
)
const ItemEditorPage = lazy(() =>
  import('./pages/ItemEditorPage').then(({ ItemEditorPage }) => ({
    default: ItemEditorPage,
  })),
)
const LookbookPage = lazy(() =>
  import('./pages/LookbookPage').then(({ LookbookPage }) => ({
    default: LookbookPage,
  })),
)
const MaintenancePage = lazy(() =>
  import('./pages/MaintenancePage').then(({ MaintenancePage }) => ({
    default: MaintenancePage,
  })),
)
const LaundryPage = lazy(() =>
  import('./pages/MaintenancePage').then(({ LaundryPage }) => ({
    default: LaundryPage,
  })),
)
const MorePage = lazy(() =>
  import('./pages/MorePage').then(({ MorePage }) => ({ default: MorePage })),
)
const PlaceHvacProfilesPage = lazy(() =>
  import('./pages/PlaceHvacProfilesPage').then(
    ({ PlaceHvacProfilesPage }) => ({ default: PlaceHvacProfilesPage }),
  ),
)
const ReplacementLinesPage = lazy(() =>
  import('./pages/ReplacementLinesPage').then(({ ReplacementLinesPage }) => ({
    default: ReplacementLinesPage,
  })),
)
const ReplacementLineagePage = lazy(() =>
  import('./pages/ReplacementLineagePage').then(({ ReplacementLineagePage }) => ({
    default: ReplacementLineagePage,
  })),
)
const OutfitDetailPage = lazy(() =>
  import('./pages/OutfitDetailPage').then(({ OutfitDetailPage }) => ({
    default: OutfitDetailPage,
  })),
)
const OutfitCreatorPage = lazy(() =>
  import('./pages/OutfitCreatorPage').then(({ OutfitCreatorPage }) => ({
    default: OutfitCreatorPage,
  })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then(({ SettingsPage }) => ({
    default: SettingsPage,
  })),
)
const StatisticsPage = lazy(() =>
  import('./pages/StatisticsPage').then(({ StatisticsPage }) => ({
    default: StatisticsPage,
  })),
)
const StatisticsItemListPage = lazy(() =>
  import('./pages/StatisticsItemListPage').then(({ StatisticsItemListPage }) => ({
    default: StatisticsItemListPage,
  })),
)
const WearLogPage = lazy(() =>
  import('./pages/WearLogPage').then(({ WearLogPage }) => ({
    default: WearLogPage,
  })),
)
const WearLogEditorPage = lazy(() =>
  import('./pages/WearLogEditorPage').then(({ WearLogEditorPage }) => ({
    default: WearLogEditorPage,
  })),
)

function RouteLoadingFallback() {
  return (
    <div className="app-frame">
      <main className="page">
        <LoadingState label="화면을 불러오는 중" />
      </main>
    </div>
  )
}

function AuthenticatedApp() {
  const auth = useAuth()
  const repository = useMemo<ClosetDataProviderRepository | null>(() => {
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
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/closet" element={<ClosetPage />} />
            <Route path="/closet/new" element={<ItemEditorPage />} />
            <Route path="/closet/:itemId/edit" element={<ItemEditorPage />} />
            <Route path="/closet/:itemId" element={<ItemDetailPage />} />
            <Route path="/lookbook" element={<LookbookPage />} />
            <Route path="/favorite" element={<LookbookPage favoriteOnly />} />
            <Route path="/outfits/new" element={<OutfitCreatorPage />} />
            <Route
              path="/outfits/:outfitId/edit"
              element={<OutfitCreatorPage />}
            />
            <Route path="/outfits/:outfitId" element={<OutfitDetailPage />} />
            <Route path="/wear/:outfitId" element={<WearLogPage />} />
            <Route path="/records/:logId/edit" element={<WearLogPage />} />
            <Route path="/tools/wear-log" element={<WearLogEditorPage />} />
            <Route
              path="/tools/place-hvac"
              element={<PlaceHvacProfilesPage />}
            />
            <Route path="/more" element={<MorePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/laundry" element={<LaundryPage />} />
            <Route
              path="/replacement-lines"
              element={<ReplacementLinesPage />}
            />
            <Route
              path="/replacement-lines/:lineId"
              element={<ReplacementLineagePage />}
            />
            <Route
              path="/statistics/replacement-lines"
              element={<Navigate to="/replacement-lines" replace />}
            />
            <Route
              path="/statistics/items"
              element={<StatisticsItemListPage />}
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
