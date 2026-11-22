import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { pb } from './pb'
import { clearAll } from '../lib/uiState'

/** A group member's access: a writer changes things (recipes, what's
 *  wanted, the ingredients on hand, add-ons) and manages the group; a reader
 *  looks (and keeps favorites, and their own name). */
export type Access = 'writer' | 'reader'

export interface AuthUser {
  id: string
  name: string
  role: Access
  email?: string
}

interface AuthContextValue {
  user: AuthUser | null
  /** True once the initial session check has completed. */
  ready: boolean
  /** May change things (and manage the group). Mirrors the server's rules,
   *  which are what really decide. */
  canWrite: boolean
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function toUser(record: unknown): AuthUser | null {
  if (!record || typeof record !== 'object') return null
  const r = record as Record<string, unknown>
  if (!r.id) return null
  return {
    id: String(r.id),
    name: typeof r.name === 'string' ? r.name : '',
    role: r.role === 'writer' ? 'writer' : 'reader',
    email: typeof r.email === 'string' ? r.email : undefined,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    pb.authStore.isValid ? toUser(pb.authStore.record) : null,
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Mirror the SDK's auth store (persisted in localStorage) into React.
    const unsub = pb.authStore.onChange(() => {
      setUser(pb.authStore.isValid ? toUser(pb.authStore.record) : null)
      // Signed out: what was on screen (and any unsaved edit) isn't kept for
      // whoever signs in next.
      if (!pb.authStore.isValid) clearAll()
    })
    // Validate / refresh an existing session on boot.
    ;(async () => {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh()
        } catch (e) {
          // Signed out only if the server says the session is no good
          // (expired, revoked, or the account's gone) — not when it can't be
          // reached (offline, or the server restarting): the app works
          // offline on what it has.
          const status = (e as { status?: number }).status
          if (status === 401 || status === 403 || status === 404)
            pb.authStore.clear()
        }
      }
      setReady(true)
    })()
    return () => unsub()
  }, [])

  const value: AuthContextValue = {
    user,
    ready,
    canWrite: user?.role === 'writer',
    signOut: () => pb.authStore.clear(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
