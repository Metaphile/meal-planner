import { useEffect } from 'react'

/**
 * Keeps the screen from dimming and locking while the calling component is
 * mounted (a card in hand: you're cooking from it). Uses the Screen Wake Lock
 * API, which needs a secure context (https, or localhost) — elsewhere, or where
 * the browser hasn't got it, it quietly does nothing.
 *
 * The browser lets go of the lock whenever the page is hidden (another app,
 * the phone locked by its button), so it's asked for again on coming back.
 */
export function useWakeLock() {
  useEffect(() => {
    const wl = navigator.wakeLock
    if (!wl) return
    let lock: WakeLockSentinel | null = null
    let asking = false
    let done = false
    const take = () => {
      if (done || lock || asking || document.visibilityState !== 'visible')
        return
      asking = true
      wl.request('screen').then(
        (l) => {
          asking = false
          if (done) void l.release()
          else {
            lock = l
            l.addEventListener('release', () => {
              if (lock === l) lock = null
            })
          }
        },
        () => {
          asking = false
        }, // refused (e.g. low battery): the screen just behaves as usual
      )
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', take)
      void lock?.release()
      lock = null
    }
  }, [])
}
