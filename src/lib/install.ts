import { useSyncExternalStore } from 'react'

/**
 * Installing the app. Where the browser offers it (Chrome on Android and
 * desktop), its install prompt — caught once, as the page loads, and kept for
 * a button to show. iOS has none: there it's Share → Add to Home Screen, by
 * hand.
 */
type InstallPrompt = Event & { prompt: () => Promise<void> }

let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

/** Call once, early (before the browser offers its prompt). */
export function catchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // (ours to show, from a button)
    deferred = e as InstallPrompt
    changed()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    changed()
  })
}

/** The browser's install prompt, if it has offered one. */
export function useInstallPrompt(): InstallPrompt | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => deferred,
  )
}

/** Running as the installed app (from the Home Screen), not in a browser tab. */
export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** An iPhone or iPad (an iPad says it's a Mac, but has touch). */
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** The code in an invite (sign-in) link, from whatever text it came in. */
export const inviteCodeOf = (text: string) =>
  text.match(/[0-9a-f]{64}/i)?.[0].toLowerCase() ?? null
