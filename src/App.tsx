import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { useStore } from './store/store'
import { useAuth } from './auth/AuthProvider'

// Route-level code splitting keeps the initial bundle (and time-to-interactive)
// small — each tab's code loads on demand.
const RecipesPage = lazy(() => import('./routes/RecipesPage'))
const RecipeEditPage = lazy(() => import('./routes/RecipeEditPage'))
const MealPlanPage = lazy(() => import('./routes/MealPlanPage'))
const AccountPage = lazy(() => import('./routes/AccountPage'))
const AdminPage = lazy(() => import('./routes/AdminPage'))
const InvitePage = lazy(() => import('./routes/InvitePage'))

export default function App() {
  const { ready, user, isAdmin } = useAuth()
  const hydrated = useStore((s) => s.hydrated)
  const init = useStore((s) => s.init)

  // Hydrate the local store only once signed in.
  useEffect(() => {
    if (user) void init()
  }, [user, init])

  // Auth state not yet determined → hold a neutral splash.
  if (!ready) return <Splash />

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <main
        className="relative flex-1 overflow-hidden"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {user && !hydrated ? (
          <BootSkeleton />
        ) : (
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              {/* Always available so an invite link works while signed out. */}
              <Route path="/invite" element={<InvitePage />} />
              {user ? (
                <>
                  <Route path="/" element={<Navigate to="/plan" replace />} />
                  <Route path="/recipes" element={<RecipesPage />} />
                  <Route path="/recipes/new" element={<RecipeEditPage />} />
                  <Route path="/recipes/:id" element={<RecipeEditPage />} />
                  <Route path="/plan" element={<MealPlanPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route
                    path="/admin"
                    element={
                      isAdmin ? <AdminPage /> : <Navigate to="/account" replace />
                    }
                  />
                  {/* Old paths → plan. */}
                  <Route
                    path="/ingredients"
                    element={<Navigate to="/plan" replace />}
                  />
                  <Route
                    path="/meals/*"
                    element={<Navigate to="/plan" replace />}
                  />
                  <Route path="*" element={<Navigate to="/plan" replace />} />
                </>
              ) : (
                <Route path="*" element={<SignedOut />} />
              )}
            </Routes>
          </Suspense>
        )}
      </main>
      {user && <TabBar />}
    </div>
  )
}

function SignedOut() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Meal Planner</h1>
      <p className="max-w-xs text-sm text-muted">
        This is a private family app. Open the invite link a family admin shared
        with you to sign in on this device.
      </p>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-bg text-muted">
      <div className="animate-pulse text-sm">Meal Planner</div>
    </div>
  )
}

function BootSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <div className="animate-pulse text-sm">Loading your kitchen…</div>
    </div>
  )
}

function PageSpinner() {
  return (
    <div className="flex h-40 items-center justify-center text-muted">
      <div className="animate-pulse text-sm">…</div>
    </div>
  )
}
