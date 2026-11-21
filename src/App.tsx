import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { PrimaryButton, TextInput } from './components/ui'
import { TabBar } from './components/TabBar'
import { useStore } from './store/store'
import { useAuth } from './auth/AuthProvider'

// Route-level code splitting keeps the initial bundle (and time-to-interactive)
// small — each tab's code loads on demand.
const RecipesPage = lazy(() => import('./routes/RecipesPage'))
const MealPlanPage = lazy(() => import('./routes/MealPlanPage'))
const IngredientsPage = lazy(() => import('./routes/IngredientsPage'))
const AccountPage = lazy(() => import('./routes/AccountPage'))
const InvitePage = lazy(() => import('./routes/InvitePage'))

export default function App() {
  const { ready, user } = useAuth()
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
                  <Route path="/" element={<Navigate to="/recipes" replace />} />
                  <Route path="/recipes" element={<RecipesPage />} />
                  {/* (Recipes are written and edited on their cards now.) */}
                  <Route
                    path="/recipes/*"
                    element={<Navigate to="/recipes" replace />}
                  />
                  {/* (Meals is off the tab bar: recipes are wanted on their
                      cards now. Still here at its address for the moment.) */}
                  <Route path="/plan" element={<MealPlanPage />} />
                  <Route path="/ingredients" element={<IngredientsPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  {/* Old paths. (The group is managed on Account now.) */}
                  <Route
                    path="/admin"
                    element={<Navigate to="/account" replace />}
                  />
                  <Route
                    path="/recipes-v2"
                    element={<Navigate to="/recipes" replace />}
                  />
                  <Route
                    path="/meals/*"
                    element={<Navigate to="/plan" replace />}
                  />
                  <Route path="*" element={<Navigate to="/recipes" replace />} />
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

/**
 * Signed out: an invite link signs you in. Opened, it does so in the
 * browser it opens in; pasted here, in this app — on an iPhone, the app on
 * the Home Screen keeps its own sign-in, apart from Safari's, and links open
 * in Safari.
 */
function SignedOut() {
  const navigate = useNavigate()
  const [link, setLink] = useState('')
  // (The code after the "#"; or the code alone, pasted.)
  const code = (link.split('#').pop() ?? '').trim()
  const signIn = () => {
    if (code) navigate({ pathname: '/invite', hash: code })
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="paper-serif text-2xl font-semibold">Meals</h1>
      <p className="max-w-xs text-sm text-muted">
        This is a private app. To sign in, paste the invite link someone in
        your group shared with you.
      </p>
      <form
        className="flex w-full max-w-xs flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          signIn()
        }}
      >
        <TextInput
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Invite link"
          aria-label="Invite link"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <PrimaryButton type="submit" disabled={!code}>
          Sign in
        </PrimaryButton>
      </form>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-bg text-muted">
      <div className="animate-pulse text-sm">Meals</div>
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
