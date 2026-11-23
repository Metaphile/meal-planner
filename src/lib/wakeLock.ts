import { useEffect } from 'react'

/**
 * Keeps the screen from dimming and locking while a card is in hand (you're
 * cooking from it). Uses the Screen Wake Lock API, which needs a secure
 * context (https, or localhost: not the LAN dev server's plain http) —
 * elsewhere, or where the browser hasn't got it, it quietly does nothing.
 *
 * One lock for the app, held while anything wants it (see useWakeLock):
 * - asked for in the tap that takes a card out (wakeLockNow) — Safari is
 *   readier to grant it in a tap than a moment after — and again once the
 *   card's in hand;
 * - let go of by the browser whenever the page is hidden (another app, the
 *   phone locked by its button), so asked for again on coming back;
 * - and let go of, at times, by iOS on its own: asked for again then too,
 *   while the card's still in hand.
 */

let holders = 0
/** Asked for in a tap, ahead of the card that wants it: kept that long. */
let primedUntil = 0
let lock: WakeLockSentinel | null = null
let asking = false
let retry: ReturnType<typeof setTimeout> | null = null

const wanted = () => holders > 0 || Date.now() < primedUntil

function take() {
  const wl = typeof navigator === 'undefined' ? undefined : navigator.wakeLock
  if (!wl || !wanted() || lock || asking) return
  if (document.visibilityState !== 'visible') return
  asking = true
  wl.request('screen').then(
    (l) => {
      asking = false
      if (!wanted()) return void l.release()
      lock = l
      l.addEventListener('release', () => {
        if (lock !== l) return
        lock = null
        // (Let go of while still wanted, and still showing: iOS, on its own.
        // Asked for again, after a moment.)
        if (wanted() && document.visibilityState === 'visible') later()
      })
    },
    () => {
      asking = false // refused (e.g. low battery): the screen just behaves as usual
    },
  )
}

function later(ms = 1000) {
  if (retry) return
  retry = setTimeout(() => {
    retry = null
    take()
  }, ms)
}

function letGo() {
  if (wanted()) return
  if (retry) clearTimeout(retry)
  retry = null
  void lock?.release()
  lock = null
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', take)
  window.addEventListener('pageshow', take)
  window.addEventListener('focus', take)
}

/** Ask for the lock now — call it in the tap that takes a card out. (Held
 *  for a few seconds: the card in hand keeps it, with useWakeLock.) */
export function wakeLockNow() {
  primedUntil = Date.now() + 4000
  take()
  setTimeout(letGo, 4100) // (no card came: not kept)
}

/** Hold the screen awake while the calling component is mounted. */
export function useWakeLock() {
  useEffect(() => {
    holders++
    take()
    return () => {
      holders--
      letGo()
    }
  }, [])
}
