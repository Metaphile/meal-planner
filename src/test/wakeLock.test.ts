import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

/** A fake Screen Wake Lock: grants every request; each lock can be let go
 *  of (by the page, or "by iOS"). */
function fakeWakeLock() {
  const locks: Array<{ released: boolean; drop: () => void }> = []
  const api = {
    request: vi.fn(async () => {
      const listeners: Array<() => void> = []
      const lock = {
        released: false,
        addEventListener: (_: string, f: () => void) => listeners.push(f),
        release: async () => {
          lock.released = true
          listeners.forEach((f) => f())
        },
        drop: () => void lock.release(),
      }
      locks.push(lock)
      return lock
    }),
  }
  return { api, locks }
}

let wl: ReturnType<typeof fakeWakeLock>
let mod: typeof import('../lib/wakeLock')
const held = () => wl.locks.filter((l) => !l.released).length

// (Each test well after the last: an earlier test's tap long since over —
// its copy of the module still listens for the page coming back.)
let clock = Date.now()
beforeEach(async () => {
  vi.useFakeTimers()
  clock += 1e7
  vi.setSystemTime(clock)
  vi.resetModules()
  wl = fakeWakeLock()
  Object.defineProperty(navigator, 'wakeLock', { value: wl.api, configurable: true })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  mod = await import('../lib/wakeLock')
})
afterEach(() => {
  cleanup() // (each test's cards put away)
  vi.useRealTimers()
})

describe('keeping the screen awake', () => {
  it('asks in the tap, and holds it while the card is in hand', async () => {
    mod.wakeLockNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(held()).toBe(1)
    const card = renderHook(() => mod.useWakeLock())
    await vi.advanceTimersByTimeAsync(10000) // (long past the tap's few seconds)
    expect(held()).toBe(1)
    expect(wl.api.request).toHaveBeenCalledTimes(1) // (the same lock)
    card.unmount()
    await vi.advanceTimersByTimeAsync(0)
    expect(held()).toBe(0)
  })

  it('lets it go if no card came of the tap', async () => {
    mod.wakeLockNow()
    await vi.advanceTimersByTimeAsync(5000)
    expect(held()).toBe(0)
  })

  it('asks again when iOS lets go of it, the card still in hand', async () => {
    renderHook(() => mod.useWakeLock())
    await vi.advanceTimersByTimeAsync(0)
    wl.locks[0].drop()
    expect(held()).toBe(0)
    await vi.advanceTimersByTimeAsync(1500)
    expect(held()).toBe(1)
  })

  it('asks again on coming back to the app', async () => {
    renderHook(() => mod.useWakeLock())
    await vi.advanceTimersByTimeAsync(0)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    wl.locks[0].drop() // (the browser lets go: hidden)
    await vi.advanceTimersByTimeAsync(2000)
    expect(held()).toBe(0) // (not while hidden)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(held()).toBe(1)
  })
})
