import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { useStore } from './store/store'

// Route-level code splitting keeps the initial bundle (and time-to-interactive)
// small — each tab's code loads on demand.
const RecipesPage = lazy(() => import('./routes/RecipesPage'))
const RecipeEditPage = lazy(() => import('./routes/RecipeEditPage'))
const MealsPage = lazy(() => import('./routes/MealsPage'))
const MealEditPage = lazy(() => import('./routes/MealEditPage'))
const MealPlanPage = lazy(() => import('./routes/MealPlanPage'))
const IngredientsPage = lazy(() => import('./routes/IngredientsPage'))

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <main
        className="relative flex-1 overflow-hidden"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {!hydrated ? (
          <BootSkeleton />
        ) : (
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route path="/" element={<Navigate to="/plan" replace />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/new" element={<RecipeEditPage />} />
              <Route path="/recipes/:id" element={<RecipeEditPage />} />
              <Route path="/meals" element={<MealsPage />} />
              <Route path="/meals/new" element={<MealEditPage />} />
              <Route path="/meals/:id" element={<MealEditPage />} />
              <Route path="/plan" element={<MealPlanPage />} />
              <Route path="/ingredients" element={<IngredientsPage />} />
              <Route path="*" element={<Navigate to="/plan" replace />} />
            </Routes>
          </Suspense>
        )}
      </main>
      <TabBar />
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
