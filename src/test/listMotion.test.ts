import { describe, expect, it } from 'vitest'
import { PACE, listPath, pace, type ListPath } from '../lib/listMotion'

const p: ListPath = { rest: 806, top: 60, anchor: 1000, anchorY: 450 }
const path = listPath(p, -2000)
const speed = (path: ReturnType<typeof listPath>, y: number) => {
  const at = path.scrollFor(y)
  return path.at(at) - path.at(at + 1)
}

describe("the shopping list's path", () => {
  it("slows as it rises: from the bottom's pace to the top's", () => {
    expect(pace(p, 806)).toBeCloseTo(PACE.bottom)
    expect(pace(p, 60)).toBeCloseTo(PACE.top)
    expect(pace(p, -500)).toBe(PACE.top)
    for (let y = 805; y > 60; y -= 5) expect(pace(p, y)).toBeLessThan(pace(p, y + 5))
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
    expect(speed(path, 800)).toBeGreaterThan(1.9)
    expect(speed(path, -1000)).toBeCloseTo(1, 5) // (a long list, read)
  })

  it('arrives gently, stopping short of the top', () => {
    const short = listPath({ ...p, top: 300, topPace: PACE.stop }, -500)
    expect(speed(short, 302)).toBeCloseTo(PACE.stop, 1)
  })

  it('knows how far to scroll to put it anywhere', () => {
    for (const y of [800, 650, 450, 100, -300, -2500]) {
      expect(path.at(path.scrollFor(y))).toBeCloseTo(y, 6)
    }
  })
})
