/**
 * How the shopping list moves as the box is scrolled: in front of the box,
 * at a pace of its own — set by how far it's come up, not by the box's
 * wheel. It comes up over the bottom edge faster than the finger, outpacing
 * the box behind it, and settles toward the finger's pace (1:1) all the way
 * up — ever nearer it, never slower: by the top of the drum it's all but
 * there, and a long list reads on with the finger.
 *
 * Positions are the list's top on screen (px from the top of the page);
 * scrolling is in screen px. The list's motion is fixed to one place: at
 * `anchor` scroll it's at `anchorY` (the turning's end, just below the top
 * of the back of the box).
 */
export interface ListPath {
  /** Peeking over the bottom edge: as low as it goes. */
  rest: number
  /** The top of the drum (the header's foot): by here, it's within
   *  SETTLED of the finger's pace. */
  top: number
  anchor: number
  anchorY: number
}

/** Its pace (× the finger's) coming up over the bottom edge. */
export const PACE = { bottom: 1.5 }
/** How near the finger's pace it is by the top of the drum: e^-3, 5%. */
const SETTLED = 3

/** Its pace with its top at `y`: the bottom's, settling (exponentially)
 *  toward the finger's — 1 — as it comes up. */
export function pace(p: ListPath, y: number): number {
  const risen = Math.max(0, p.rest - y)
  const scale = Math.max(1, p.rest - p.top) / SETTLED
  return 1 + (PACE.bottom - 1) * Math.exp(-risen / scale)
}

/** The path, worked out once: how far it's scrolled (from the anchor) at
 *  each 1px of height, from `rest` up to `lowest`. */
export function listPath(p: ListPath, lowest: number) {
  // ys[i] = rest - i; s[i] = scrolled at ys[i], counted from rest.
  const n = Math.max(1, Math.ceil(p.rest - lowest))
  const beyond = pace(p, lowest - 1)
  const s = new Float64Array(n + 1)
  for (let i = 1; i <= n; i++) {
    // (The pace midway through each step.)
    s[i] = s[i - 1] + 1 / pace(p, p.rest - i + 0.5)
  }
  /** Scrolled from rest to `y`. */
  const scrolledTo = (y: number) => {
    const f = Math.max(0, p.rest - y)
    const i = Math.floor(f)
    // (Past the end of what's worked out: at the top's pace.)
    return i >= n ? s[n] + (f - n) / beyond : s[i] + (s[i + 1] - s[i]) * (f - i)
  }
  const base = scrolledTo(p.anchorY) - p.anchor // (scroll position of rest)
  return {
    /** The list's top with the box scrolled to `at`. */
    at(at: number): number {
      const want = at + base
      if (want <= 0) return p.rest
      if (want >= s[n]) return p.rest - n - (want - s[n]) * beyond
      // (Binary search for the step it's in.)
      let lo = 0
      let hi = n
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (s[mid] <= want) lo = mid
        else hi = mid
      }
      return p.rest - lo - (want - s[lo]) / (s[lo + 1] - s[lo])
    },
    /** How far the box is scrolled with the list's top at `y`. */
    scrollFor(y: number): number {
      return scrolledTo(y) - base
    },
  }
}
