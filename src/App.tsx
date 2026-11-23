import { Suspense, lazy, useEffect, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { GhostButton, PrimaryButton, TextInput } from './components/ui'
import { inviteCodeOf } from './lib/install'
import { useStore } from './store/store'
import { useAuth } from './auth/AuthProvider'
import { DAY, load, save, type Slice } from './lib/uiState'

// Route-level code splitting keeps the initial bundle (and time-to-interactive)
// small — each page's code loads on demand.
const RecipesPage = lazy(() => import('./routes/RecipesPage'))
const MealPlanPage = lazy(() => import('./routes/MealPlanPage'))
const AccountPage = lazy(() => import('./routes/AccountPage'))
const InvitePage = lazy(() => import('./routes/InvitePage'))

/** The pages (the recipe box — its shopping list at the back — Account,
 *  and the old meal plan). There's no tab bar: Account is reached from the
 *  box's corner. */
const TABS = ['/recipes', '/account', '/plan']
/** The page you were on, kept on the device: the app opened again from the
 *  Home Screen (it starts at /) — iOS having discarded it, or a new version
 *  put in place — goes back to it. */
const TAB: Slice<string> = {
  key: 'tab',
  version: 1,
  maxAgeMs: DAY,
  parse: (x) => (typeof x === 'string' && TABS.includes(x) ? x : null),
}
function KeepTab() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (TABS.includes(pathname)) save(TAB, pathname)
  }, [pathname])
  return null
}

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
    <div className="flex h-full flex-col bg-counter text-on-counter">
      <main
        className="relative flex-1 overflow-hidden"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {user && !hydrated ? (
          <BootSkeleton />
        ) : (
          <Suspense fallback={<PageSpinner />}>
            {user && <KeepTab />}
            <Routes>
              {/* Always available so an invite link works while signed out. */}
              <Route path="/invite" element={<InvitePage />} />
              {user ? (
                <>
                  <Route
                    path="/"
                    element={<Navigate to={load(TAB) ?? '/recipes'} replace />}
                  />
                  <Route path="/recipes" element={<RecipesPage />} />
                  {/* (Recipes are written and edited on their cards now.) */}
                  <Route
                    path="/recipes/*"
                    element={<Navigate to="/recipes" replace />}
                  />
                  {/* (Meals is off the tab bar: recipes are wanted on their
                      cards now. Still here at its address for the moment.) */}
                  <Route path="/plan" element={<MealPlanPage />} />
                  {/* (The shopping list is at the back of the box now.) */}
                  <Route
                    path="/ingredients"
                    element={<Navigate to="/recipes" replace />}
                  />
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
      {/* The top of the screen, kept clear (on an iPhone, from the Home
          Screen: under the blur iOS puts just below the status bar): the
          counter, solid, over everything — a card lifting out of the box
          mustn't show through it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-counter"
        style={{ height: 'var(--safe-top)' }}
      />
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
  const [error, setError] = useState<string | null>(null)
  // (The code in it — a link, or the code alone, or a message with a link.)
  const code = inviteCodeOf(link)
  const signInWith = (c: string | null) => {
    if (c) navigate({ pathname: '/invite', hash: c })
  }
  // One tap, from the clipboard (where Account → Add to Home Screen left
  // it). (Only on HTTPS; iOS asks first, with its own Paste button.)
  const canPaste = typeof navigator.clipboard?.readText === 'function'
  const paste = async () => {
    setError(null)
    try {
      const c = inviteCodeOf(await navigator.clipboard.readText())
      if (c) signInWith(c)
      else setError('There’s no sign-in link on the clipboard.')
    } catch {
      // (Not allowed: paste it in the field instead.)
    }
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="paper-serif text-title font-semibold">Meals</h1>
      <p className="max-w-xs text-sm text-on-counter-soft">
        This is a private app. To sign in, paste the invite link someone in
        your group shared with you — or your own sign-in link.
      </p>
      {canPaste && (
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <PrimaryButton onClick={() => void paste()}>
            Paste sign-in link
          </PrimaryButton>
          {error && <p className="text-sm text-on-counter-danger">{error}</p>}
        </div>
      )}
      <form
        className="flex w-full max-w-xs flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          signInWith(code)
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
        {canPaste ? (
          <GhostButton onClick={() => signInWith(code)}>Sign in</GhostButton>
        ) : (
          <PrimaryButton type="submit" disabled={!code}>
            Sign in
          </PrimaryButton>
        )}
      </form>
    </div>
  )
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-counter text-on-counter-soft">
      <div className="animate-pulse text-sm">Meals</div>
    </div>
  )
}

function BootSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-ink-soft">
      <div className="animate-pulse text-sm">Loading your kitchen…</div>
    </div>
  )
}

function PageSpinner() {
  return (
    <div className="flex h-40 items-center justify-center text-ink-soft">
      <div className="animate-pulse text-sm">…</div>
    </div>
  )
}
