/**
 * What's on screen, kept on the device as it changes — so leaving the app
 * (and iOS discarding it meanwhile), or a new version of the app being put
 * in place, comes back to it as it was.
 *
 * Each slice is kept with the version of its shape and when it was kept. A
 * slice that's stale, or in a shape this version of the app doesn't know
 * (kept by an older one), is dropped: it's only where things were, and
 * starting afresh is fine. (Unsaved edits aren't dropped like that: see
 * `loadKept`, and lib/draft.)
 */

const PREFIX = 'meals:'

export interface Slice<T> {
  key: string
  /** The shape's version: bumped whenever the shape changes. */
  version: number
  /** Kept no longer than this. */
  maxAgeMs: number
  /** The data, if it's what's expected (else null). */
  parse: (data: unknown) => T | null
}

interface Envelope {
  v: number
  at: number
  data: unknown
}

const HOUR = 60 * 60 * 1000
export const DAY = 24 * HOUR

function read(key: string): Envelope | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope
    return env && typeof env === 'object' && typeof env.v === 'number'
      ? env
      : null
  } catch {
    return null
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // (Storage unavailable: nothing was kept.)
  }
}

/** The slice as last kept — or null if there's none, it's stale, or it's
 *  not in a shape this version knows (then it's dropped). */
export function load<T>(s: Slice<T>): T | null {
  const env = read(s.key)
  if (!env) return null
  const value =
    env.v === s.version && Date.now() - env.at <= s.maxAgeMs
      ? s.parse(env.data)
      : null
  if (value === null) remove(s.key)
  return value
}

/**
 * As `load`, but a slice in a shape this version can't read is kept (not
 * dropped) and handed back as it is, to make what can of it: for what
 * mustn't be lost (an unsaved edit).
 */
export function loadKept<T>(
  s: Slice<T>,
): { value: T } | { unreadable: unknown } | null {
  const env = read(s.key)
  if (!env) return null
  if (Date.now() - env.at > s.maxAgeMs) {
    remove(s.key)
    return null
  }
  const value = env.v === s.version ? s.parse(env.data) : null
  return value !== null ? { value } : { unreadable: env.data }
}

/** Keep the slice (null: forget it). */
export function save<T>(s: Slice<T>, value: T | null) {
  if (value === null) return remove(s.key)
  try {
    const env: Envelope = { v: s.version, at: Date.now(), data: value }
    localStorage.setItem(PREFIX + s.key, JSON.stringify(env))
  } catch {
    // (Storage full or unavailable: carry on without it.)
  }
}

/** Forget every slice (signing out). */
export function clearAll() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // (Storage unavailable: nothing was kept.)
  }
}

/**
 * Run `fn` whenever the app is being left (another app, the phone locked,
 * the page going away): the last chance to keep what's on screen before
 * iOS may discard the app. Returns a function to stop.
 */
export function onLeave(fn: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') fn()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', fn)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', fn)
  }
}

// ── Parsing helpers: take what's expected, or nothing ──────────────────────

export const isObj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x)
export const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d)
export const num = (x: unknown) =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined
export const bool = (x: unknown) => x === true
export const strs = (x: unknown) =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []
