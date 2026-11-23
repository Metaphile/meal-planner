/**
 * How the shopping list moves as the box is scrolled: in front of the box,
 * at a pace of its own — set by where it is on the screen, not by the box's
 * wheel. Slow leaving the bottom edge; fastest crossing the drum's centre
 * line (where its cards face you), outpacing the box turning behind it;
 * easing to the finger's pace as it nears the top of the drum; and with the
 * finger from there (a long list read on up).
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
  /** The drum's centre line. */
  centre: number
  /** The end of its travel: the top of the drum (the header's foot) — or,
   *  a short list, where it stops (its end in view). */
  top: number
  /** Its pace there: the finger's (1) if it reads on up past it — a long
   *  list — or, where it stops, as slow as it leaves the bottom. */
  topPace?: number
  anchor: number
  anchorY: number
}

/** Its pace (× the finger's): leaving the bottom, crossing the centre,
 *  nearing the top. */
export const PACE = { bottom: 0.6, centre: 1.8, top: 1 }

/** Its pace with its top at `y`. */
export function pace(p: ListPath, y: number): number {
  const ease = (from: number, to: number, k: number) =>
    from + (to - from) * (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, k)))) / 2
  if (y >= p.centre)
    return p.rest > p.centre
      ? ease(PACE.centre, PACE.bottom, (y - p.centre) / (p.rest - p.centre))
      : PACE.centre
  if (y >= p.top)
    return p.centre > p.top
      ? ease(PACE.centre, p.topPace ?? PACE.top, (p.centre - y) / (p.centre - p.top))
      : (p.topPace ?? PACE.top)
  return p.topPace ?? PACE.top
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
