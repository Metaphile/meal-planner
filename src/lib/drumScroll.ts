/**
 * Scrolling for the rolodex drum: iOS-style physics for touch, the browser's
 * own scrolling for the mouse wheel and trackpad.
 *
 * Touch (and pen, and mouse drags) is driven by hand, so it feels like iOS
 * and even a box too short to turn still gives a little. Position runs from
 * 0 to `max`. Dragging follows the finger one-to-one; past either end it
 * meets rubber-band resistance, and holds there while the finger does.
 * Letting go carries the drum on with momentum that decays at iOS's rate; if
 * that carries it past an end — or you let go out there — a critically
 * damped spring brings it back to rest at the end, with no wobble. A tap
 * that stops a moving drum only stops it (no click).
 *
 * The wheel and trackpad scroll `el` natively (only the browser knows when a
 * trackpad's fingers are down, so only it can rubber-band like macOS): the
 * scroll offset is the position. Touch writes its position back into the
 * scroll offset, so either can pick up where the other left off; a stretch
 * past an end lives only in the position.
 *
 * Nothing here touches React: `onChange` fires on every change and the
 * caller paints.
 */

export interface DrumScroll {
  /** Current position (outside [0, max] while stretched past an end). */
  get(): number
  /** Jump to a position, stopping any motion. */
  set(pos: number): void
  /** Move to a position, stopping any motion — one of many in a row
   *  (following something else frame by frame): painted once per frame,
   *  and the native scroll offset left alone (writing it forces a layout,
   *  every time). `set` once at the end, to bring that into step. */
  move(pos: number): void
  /** Glide to a position (eased); resolves when done or interrupted. */
  animateTo(pos: number, ms: number): Promise<void>
  /** The far end. If the drum is now past it, it springs back. */
  setMax(max: number): void
  destroy(): void
}

// iOS UIScrollView's normal deceleration: velocity × 0.998 per ms.
const DECELERATION = 0.998
// Spring back from past an end: critically damped, settles in ~1/3 s.
const OMEGA = 0.015 // per ms
// How far a drag must go before it's a drag (not a tap).
const SLOP = 6
// Rubber-band stiffness (iOS uses 0.55 of the view's size).
const RUBBER = 0.55
// Below this speed (px/ms) motion is over.
const REST_V = 0.01

/** Stretch past an end: `x` px of pull shows as this much (never more than d). */
const rubber = (x: number, d: number) => (1 - 1 / ((x * RUBBER) / d + 1)) * d
const unrubber = (y: number, d: number) =>
  (d * (1 / (1 - Math.min(y, d * 0.999) / d) - 1)) / RUBBER

export function createDrumScroll(
  el: HTMLElement,
  {
    onChange,
    dimension,
  }: {
    /** The position changed. `now`: paint in this frame (we're in an
     *  animation frame already); otherwise schedule it (input events can
     *  come faster than frames). */
    onChange: (now: boolean) => void
    /** The view's size (scales the rubber band). */
    dimension: () => number
  },
): DrumScroll {
  let pos = 0
  let max = 0
  let v = 0 // px/ms, in position units
  let mode: 'idle' | 'drag' | 'momentum' | 'spring' | 'tween' = 'idle'
  let raf = 0
  let last = 0
  let tween: {
    from: number
    to: number
    t0: number
    ms: number
    done: () => void
  } | null = null
  let suppressClicksUntil = 0
  let springEnd = 0 // the end a spring is pulling toward
  let written = -1 // the scroll offset we last set ourselves

  const emit = (p: number, now = true) => {
    pos = p
    onChange(now)
  }

  // Bring the native scroll offset into step (within the ends; a stretch
  // past them is ours alone) — only once the drum is at rest: writing it
  // every frame (and reading it back) forced a layout per frame on iPhone.
  const syncNative = () => {
    const st = Math.min(max, Math.max(0, pos))
    if (Math.abs(st - written) < 0.5) return
    written = st
    el.scrollTop = st
  }
  const rest = () => {
    mode = 'idle'
    syncNative()
  }

  // The wheel or trackpad scrolled it (not us): that's the position now.
  const onScroll = () => {
    const st = el.scrollTop
    if (Math.abs(st - written) < 1) return // our own write echoing back
    written = -1
    if (mode === 'drag') return
    if (mode !== 'idle') stop()
    pos = st
    onChange(false)
  }
  // The wheel taking over from touch motion: put the native offset where the
  // drum is first, so the wheel carries on from there.
  const onWheel = () => {
    if (mode === 'drag') return
    if (mode !== 'idle') stop()
    syncNative()
  }

  // Position <-> "raw" finger travel (identical inside the ends; stretched
  // past them).
  const toRaw = (p: number) => {
    const d = dimension()
    if (p < 0) return -unrubber(-p, d)
    if (p > max) return max + unrubber(p - max, d)
    return p
  }
  const fromRaw = (r: number) => {
    const d = dimension()
    if (r < 0) return -rubber(-r, d)
    if (r > max) return max + rubber(r - max, d)
    return r
  }
  const outside = () => pos < 0 || pos > max

  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (tween) {
      tween.done()
      tween = null
    }
    mode = 'idle'
    v = 0
  }

  const run = (m: 'momentum' | 'spring' | 'tween') => {
    // The spring pulls toward the nearer end (the one it's past, or on).
    if (m === 'spring') springEnd = pos < max / 2 ? 0 : max
    mode = m
    cancelAnimationFrame(raf)
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function tick(now: number) {
    raf = 0
    const dt = Math.min(48, Math.max(0, now - last))
    last = now
    let p = pos
    if (mode === 'tween' && tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms)
      p = tween.from + (tween.to - tween.from) * (1 - (1 - k) ** 3)
      if (k >= 1) {
        const done = tween.done
        tween = null
        emit(p)
        rest()
        done()
        return
      }
    } else {
      // Integrate in 1 ms steps (stable for the spring, exact enough for
      // the decay).
      for (let i = 0; i < dt; i++) {
        if (mode === 'momentum') {
          v *= DECELERATION
          p += v
          if (p < 0 || p > max) {
            // Ran past an end: the spring takes over, keeping the speed.
            mode = 'spring'
            springEnd = p < 0 ? 0 : max
          }
        } else if (mode === 'spring') {
          const x = p - springEnd
          v += -OMEGA * OMEGA * x - 2 * OMEGA * v
          p += v
        }
      }
      if (mode === 'momentum' && Math.abs(v) < REST_V) {
        mode = 'idle'
      } else if (
        mode === 'spring' &&
        Math.abs(p - springEnd) < 0.4 &&
        Math.abs(v) < REST_V
      ) {
        p = springEnd
        mode = 'idle'
      }
    }
    emit(p)
    if (mode !== 'idle') raf = requestAnimationFrame(tick)
    else syncNative() // come to rest
  }

  // ---- Touch / pen / mouse drag -------------------------------------------
  let pointerId = -1
  let y0 = 0
  let x0 = 0
  let raw0 = 0
  let dragging = false
  let caught = false // a tap that stopped a moving drum
  let samples: [number, number][] = []

  const onPointerDown = (e: PointerEvent) => {
    if (pointerId !== -1) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // (A line's grip — on the shopping list: the drag is the line's.)
    if ((e.target as Element | null)?.closest?.('[data-drag-handle]')) return
    caught = mode === 'momentum' || mode === 'spring' || mode === 'tween'
    const wasSpring = mode === 'spring'
    stop()
    // Caught mid-bounce: hold it where it is (it springs back on release).
    if (wasSpring || outside()) emit(pos)
    pointerId = e.pointerId
    y0 = e.clientY
    x0 = e.clientX
    raw0 = toRaw(pos)
    dragging = false
    samples = [[e.timeStamp, e.clientY]]
  }

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    const dy = e.clientY - y0
    if (!dragging) {
      if (Math.abs(dy) < SLOP && Math.abs(e.clientX - x0) < SLOP) return
      dragging = true
      mode = 'drag'
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already gone */
      }
    }
    e.preventDefault() // no text selection while dragging with a mouse
    samples.push([e.timeStamp, e.clientY])
    if (samples.length > 8) samples.shift()
    emit(fromRaw(raw0 - dy), false)
  }

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    pointerId = -1
    if (dragging || caught) suppressClicksUntil = performance.now() + 400
    if (!dragging) {
      if (outside()) run('spring')
      return
    }
    dragging = false
    // Release velocity from the last ~100 ms of movement.
    const t1 = e.timeStamp
    const recent = samples.filter(([t]) => t1 - t < 100)
    let vel = 0
    if (recent.length >= 2) {
      const [ta, ya] = recent[0]
      const [tb, yb] = recent[recent.length - 1]
      if (tb > ta) vel = -(yb - ya) / (tb - ta)
    }
    // A finger held still before lifting doesn't fling.
    if (t1 - samples[samples.length - 1][0] > 60) vel = 0
    v = Math.max(-8, Math.min(8, vel))
    if (outside()) run('spring')
    else if (Math.abs(v) > 0.05) run('momentum')
    else rest()
  }

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    pointerId = -1
    dragging = false
    if (outside()) run('spring')
    else rest()
  }

  // A tap that ended a drag, or stopped the drum, isn't a click on a card.
  const onClickCapture = (e: MouseEvent) => {
    if (performance.now() < suppressClicksUntil) {
      e.preventDefault()
      e.stopPropagation()
      suppressClicksUntil = 0
    }
  }

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerCancel)
  el.addEventListener('click', onClickCapture, true)
  el.addEventListener('scroll', onScroll, { passive: true })
  el.addEventListener('wheel', onWheel, { passive: true })

  return {
    get: () => pos,
    set(p) {
      stop()
      emit(p)
      syncNative()
    },
    move(p) {
      stop()
      emit(p, false)
    },
    animateTo(to, ms) {
      stop()
      if (Math.abs(to - pos) < 0.5) {
        emit(to)
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        tween = { from: pos, to, t0: performance.now(), ms, done: resolve }
        run('tween')
      })
    },
    setMax(m) {
      max = Math.max(0, m)
      if (mode === 'idle' && outside()) {
        v = 0
        run('spring')
      }
    },
    destroy() {
      stop()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
    },
  }
}
