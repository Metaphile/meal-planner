/**
 * How the shopping list moves as the box is scrolled: in front of the box,
 * at a pace of its own — set by where it is on the screen, not by the box's
 * wheel. It comes up over the bottom edge faster than the finger, outpacing
 * the box behind it, and slows — on one smooth curve — as it nears the end
 * of its travel: the top of the drum (then on up with the finger, a long
 * list read) or, a short list, where it stops.
 *
 * (Beyond the end of its travel it goes at its pace there.)
 *
 * Positions are the list's top on screen (px from the top of the page);
 * scrolling is in screen px. The list's motion is fixed to one place: at
 * `anchor` scroll it's at `anchorY` (the turning's end, just below the top
 * of the back of the box).
 */
export interface ListPath {
  /** Peeking over the bottom edge: as low as it goes. */
  rest: number
  /** The end of its travel: the top of the drum (the header's foot) — or,
   *  a short list, where it stops (its end in view). */
  top: number
  /** Its pace there: the finger's (1) if it reads on up past it — a long
   *  list — or slower, where it stops. */
  topPace?: number
  anchor: number
  anchorY: number
}

/** Its pace (× the finger's): coming up over the bottom edge; at the top
 *  of the drum (reading on); arriving where a short list stops. */
export const PACE = { bottom: 2, top: 1, stop: 0.6 }

/** Its pace with its top at `y`: from the bottom's to the top's, eased at
 *  both ends (no sudden change of pace on the way). */
export function pace(p: ListPath, y: number): number {
  const end = p.topPace ?? PACE.top
  if (y <= p.top || p.rest <= p.top) return end
  const k = Math.min(1, (y - p.top) / (p.rest - p.top))
  return end + (PACE.bottom - end) * (1 - Math.cos(Math.PI * k)) / 2
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
