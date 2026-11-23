import { describe, expect, it } from 'vitest'
import { PACE, listPath, pace, type ListPath } from '../lib/listMotion'

const p: ListPath = { rest: 806, top: 60, anchor: 1000, anchorY: 450 }
const path = listPath(p, -2000)
const speed = (y: number) => {
  const at = path.scrollFor(y)
  return path.at(at) - path.at(at + 1)
}

describe("the shopping list's path", () => {
  it("settles toward the finger's pace: ever nearer, never slower", () => {
    expect(pace(p, 806)).toBeCloseTo(PACE.bottom)
    for (let y = 805; y > -2000; y -= 5) {
      expect(pace(p, y)).toBeLessThan(pace(p, y + 5))
      expect(pace(p, y)).toBeGreaterThan(1)
    }
    // (All but there by the top of the drum.)
    expect(pace(p, 60)).toBeLessThan(1.06)
  })

  it('is where it was fixed: at the anchor, just below the back of the box', () => {
    expect(path.at(1000)).toBeCloseTo(450, 5)
  })

  it('peeks till it rises, and only ever moves up as the box scrolls on', () => {
    expect(path.at(-5000)).toBe(806)
    let y = path.at(0)
    for (let at = 0; at <= 4000; at += 7) {
      const next = path.at(at)
      expect(next).toBeLessThanOrEqual(y + 1e-9)
      y = next
    }
  })

  it('comes up faster than the finger, and reads on with it', () => {
    expect(speed(800)).toBeGreaterThan(PACE.bottom - 0.05)
    expect(speed(-1000)).toBeCloseTo(1, 2) // (a long list, read)
  })

  it('knows how far to scroll to put it anywhere', () => {
    for (const y of [800, 650, 450, 100, -300, -2500]) {
      expect(path.at(path.scrollFor(y))).toBeCloseTo(y, 6)
    }
  })
})
