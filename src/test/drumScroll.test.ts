import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDrumScroll } from '../lib/drumScroll'

afterEach(() => vi.unstubAllGlobals())

describe('the drum gliding to a place (animateTo)', () => {
  it("never steps back on its first frame — a frame's time is when it began, which can be before the glide was set going", () => {
    // Frames run by hand: each given the time it "began".
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const seen: number[] = []
    const drum = createDrumScroll(document.createElement('div'), {
      onChange: () => seen.push(drum.get()),
      dimension: () => 800,
    })
    drum.setMax(1000)
    drum.set(600)
    const began = performance.now() - 8 // (this frame began a moment ago)
    void drum.animateTo(400, 200)
    frames.shift()!(began)
    expect(drum.get()).toBeLessThanOrEqual(600) // (not past where it started)
    frames.shift()!(began + 100)
    expect(drum.get()).toBeLessThan(600)
    expect(drum.get()).toBeGreaterThan(400)
    drum.destroy()
  })
})
