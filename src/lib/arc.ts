/**
 * One continuous vertical motion from `start` to `end` that passes through
 * `via` (where a rolodex card clears the cards in front of it and is handed
 * from the rolodex to the foreground, or back).
 *
 * - If `via` lies between start and end, the path is a single eased curve; the
 *   hand-off happens mid-flight at full speed, so there's no stop.
 * - If `via` is beyond both (the card must go up to clear, then come down),
 *   it's an arc: decelerate into the apex at `via`, then drift down and ease
 *   softly into `end` (no thud).
 *
 * Positions are screen-space y (px); times are ms.
 */
export interface Arc {
  duration: number
  /** When the path reaches `via`. */
  tHand: number
  /** True if the path goes past both ends to reach `via` (up, then down). */
  apex: boolean
  /** y at time t. */
  y: (t: number) => number
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))
export const easeInOutSine = (p: number) => (1 - Math.cos(Math.PI * p)) / 2

/** CSS-style cubic-bezier(x1, y1, x2, y2) easing as a function. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const bez = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    // Solve bez(t) = x by bisection (monotonic in t for x1, x2 in [0, 1]).
    let lo = 0
    let hi = 1
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (bez(mid, x1, x2) < x) lo = mid
      else hi = mid
    }
    return bez((lo + hi) / 2, y1, y2)
  }
}
// Coming down from the apex: leave it gently, then a long, soft landing.
const settleDown = cubicBezier(0.3, 0, 0.12, 1)
// One-way flights start from rest (so they can blend out of the wheel's spin)
// but get going quickly, then glide in.
const glide = cubicBezier(0.4, 0, 0.15, 1)

/** Time in [0, duration] at which y(t) reaches `target` (y is monotonic). */
function timeAt(y: (t: number) => number, duration: number, target: number) {
  const up = y(duration) < y(0)
  let lo = 0
  let hi = duration
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (up ? y(mid) > target : y(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function arcThrough(start: number, via: number, end: number): Arc {
  if ((via - start) * (end - via) >= 0) {
    const d = end - start
    const duration = clamp(340 + Math.abs(d) * 0.25, 400, 640)
    const y = (t: number) => start + d * glide(clamp(t / duration, 0, 1))
    return {
      duration,
      tHand: d === 0 ? 0 : timeAt(y, duration, via),
      apex: false,
      y,
    }
  }
  const d1 = Math.abs(via - start)
  const d2 = Math.abs(end - via)
  const t1 = clamp(160 + d1 * 0.15, 180, 320)
  // Long enough that the card eases into place rather than landing on it.
  const t2 = clamp(260 + d2 * 0.45, 320, 560)
  return {
    duration: t1 + t2,
    tHand: t1,
    apex: true,
    y: (t) =>
      t <= t1
        ? start + (via - start) * easeInOutSine(clamp(t / t1, 0, 1))
        : via + (end - via) * settleDown(clamp((t - t1) / t2, 0, 1)),
  }
}

/** Sample times across an arc (always including the hand-off instant). */
export function sampleTimes(arc: Arc, steps = 36): number[] {
  const ts = new Set<number>()
  // (exactly 0 and exactly `duration` at the ends — no float creep past them)
  for (let i = 0; i < steps; i++) ts.add((arc.duration * i) / steps)
  ts.add(arc.duration)
  ts.add(arc.tHand)
  return [...ts].sort((a, b) => a - b)
}
