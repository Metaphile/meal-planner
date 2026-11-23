import { describe, expect, it } from 'vitest'
import { PACE, listPath, pace, type ListPath } from '../lib/listMotion'

const p: ListPath = { rest: 806, centre: 490, top: 60, anchor: 1000, anchorY: 450 }
const path = listPath(p, -2000)

describe("the shopping list's path", () => {
  it('paces itself by where it is', () => {
    expect(pace(p, 806)).toBeCloseTo(PACE.bottom)
    expect(pace(p, 490)).toBeCloseTo(PACE.centre)
    expect(pace(p, 60)).toBeCloseTo(PACE.top)
    expect(pace(p, -500)).toBe(PACE.top)
    // (Faster nearer the centre, from either side.)
    expect(pace(p, 600)).toBeGreaterThan(pace(p, 700))
    expect(pace(p, 300)).toBeGreaterThan(pace(p, 150))
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

  it('moves at its pace: slow from the bottom, fast at the centre, 1:1 at the top', () => {
    const speed = (y: number) => {
      const at = path.scrollFor(y)
      return path.at(at) - path.at(at + 1)
    }
    expect(speed(800)).toBeCloseTo(PACE.bottom, 1)
    expect(speed(490)).toBeCloseTo(PACE.centre, 1)
    expect(speed(-1000)).toBeCloseTo(1, 5) // (reading a long list)
  })

  it('knows how far to scroll to put it anywhere', () => {
    for (const y of [800, 650, 450, 100, -300, -2500]) {
      expect(path.at(path.scrollFor(y))).toBeCloseTo(y, 6)
    }
  })

  it('arrives as gently as it leaves, stopping short of the top', () => {
    const short = listPath({ ...p, top: 300, topPace: PACE.bottom }, -500)
    const at = short.scrollFor(302)
    expect(short.at(at) - short.at(at + 1)).toBeCloseTo(PACE.bottom, 1)
  })
})
