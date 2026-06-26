import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { pb } from './pb'
import type { Capability } from './capabilities'

export interface AuthUser {
  id: string
  name: string
  role: 'admin' | 'member'
  capabilities: string[]
  email?: string
}

interface AuthContextValue {
  user: AuthUser | null
  /** True once the initial session check has completed. */
  ready: boolean
  isAdmin: boolean
  hasCapability: (cap: Capability) => boolean
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
    role: r.role === 'admin' ? 'admin' : 'member',
    capabilities: Array.isArray(r.capabilities)
      ? (r.capabilities as string[])
      : [],
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
    })
    // Validate / refresh an existing session on boot.
    ;(async () => {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh()
        } catch {
          pb.authStore.clear() // expired/revoked → signed out
        }
      }
      setReady(true)
    })()
    return () => unsub()
  }, [])

  const value: AuthContextValue = {
    user,
    ready,
    isAdmin: user?.role === 'admin',
    // Admins implicitly hold every capability (mirrors the server rules).
    hasCapability: (cap) =>
      !!user && (user.role === 'admin' || user.capabilities.includes(cap)),
    signOut: () => pb.authStore.clear(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
