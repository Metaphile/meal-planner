import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** px: how far the line's box reaches out either side of its column (into
 *  the space beside it: on a card, between the title and the star and the
 *  box). */
const OUTSET = 8
/** px: how far a cut-off end fades. */
const FEATHER = 20

/**
 * A title (or a name) on one line. If it fits: as it is — a card's title
 * centred on its row (`centred`), else at the start. If not: cut off, its
 * cut-off end feathered to say there's more, and swiped sideways to read the
 * rest (the feathering follows: whichever end has more beyond it fades).
 *
 * Whether it fits is measured when it's laid out (and resized), never per
 * frame; scrolling it moves only its own text. A sideways drag on it is its
 * own to follow (see dragSideways), not the browser's — iOS won't scroll it
 * natively on a card in hand (inside the card's 3D turn). A vertical one is
 * left alone: with `panY`, to scroll the page; without, for whatever else
 * takes vertical drags there (the rolodex's drum, a card pulled to put it
 * back).
 */
export function OneLine({
  text,
  centred = true,
  panY = true,
}: {
  text: string
  centred?: boolean
  panY?: boolean
}) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  // A still title is centred on its row, not its column: the column can be
  // off-centre (a Want count beside the box narrows it on the right), so a
  // title that fits is moved by `shift` px. It must fit centred so; a title
  // cut off has the whole column.
  const [shift, setShift] = useState(0)
  const cutRef = useRef(cut)
  const shiftRef = useRef(shift)
  cutRef.current = cut
  shiftRef.current = shift
  const measure = () => {
    const column = boxRef.current!.parentElement!
    const row = column.parentElement!
    const off = centred
      ? column.offsetLeft +
        column.offsetWidth / 2 -
        (row.offsetLeft + row.offsetWidth / 2)
      : 0
    const fits =
      textRef.current!.offsetWidth <= column.clientWidth - 2 * Math.abs(off) + 1
    return { cut: !fits, shift: fits ? -off : 0 }
  }
  useLayoutEffect(() => {
    const m = measure()
    setCut(m.cut)
    setShift(m.shift)
    // (Resized: settled at once, before it's drawn.)
    const ro = new ResizeObserver(() => {
      const m = measure()
      if (m.cut !== cutRef.current || m.shift !== shiftRef.current)
        flushSync(() => {
          setCut(m.cut)
          setShift(m.shift)
        })
    })
    ro.observe(boxRef.current!.parentElement!)
    return () => ro.disconnect()
  }, [text])

  // How far it's been moved along (px, 0 to `max`), and the moving part.
  const trackRef = useRef<HTMLSpanElement>(null)
  const at = useRef(0)
  /** Moved to `x` (kept within its ends): the text slid along, and its
   *  ends faded as much as is hidden there, up to FEATHER. */
  const moveTo = (x: number) => {
    const b = boxRef.current
    const t = trackRef.current
    if (!b || !t || !textRef.current) return 0
    // (All the way along, its last letter ends where its column does.)
    const max = Math.max(0, textRef.current.offsetWidth + 2 * OUTSET - b.clientWidth)
    at.current = Math.min(max, Math.max(0, x))
    t.style.transform = `translateX(${-at.current}px)`
    b.style.setProperty('--fade-l', `${Math.min(at.current, FEATHER)}px`)
    b.style.setProperty('--fade-r', `${Math.min(max - at.current, FEATHER)}px`)
    return at.current
  }
  useLayoutEffect(() => {
    if (cut) moveTo(0)
  }, [cut, text])
  useEffect(() => {
    if (cut)
      return dragSideways(boxRef.current!, () => at.current, moveTo)
  }, [cut])

  return (
    <span
      ref={boxRef}
      className={`one-line block ${cut ? 'one-line-cut' : ''} ${
        cut || !centred ? 'text-left' : ''
      }`}
      style={
        {
          '--outset': `${OUTSET}px`,
          // (Sideways is ours; vertical, the page's — or no one's here.)
          touchAction: cut ? (panY ? 'pan-y' : 'none') : undefined,
        } as React.CSSProperties
      }
    >
      {cut ? (
        // (Slid along by a transform: its own layer, nothing re-laid out.
        // The layer's a little wider than the writing, either side —
        // handwriting reaches past its letters' widths, and a layer is cut
        // at its edges — without moving it.)
        <span
          ref={trackRef}
          className="-mx-[0.25em] inline-block px-[0.25em] will-change-transform"
        >
          <span ref={textRef} className="whitespace-nowrap">
            {text}
          </span>
        </span>
      ) : (
        <span
          ref={textRef}
          className="relative whitespace-nowrap"
          style={{ left: shift }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/**
 * A finger's sideways drag on a cut-off line slides it along, following the
 * finger, and it carries on a little when let go (slowing to a stop); a
 * trackpad's sideways swipe slides it too. A drag that starts out more
 * up-and-down than sideways is left alone. A sideways one is no one else's:
 * not the drum's, not the card's, and not a tap (no taking the card out).
 *
 * (Touches are followed by both their touch and their pointer events —
 * whichever comes first — and a sideways one's moves are kept from
 * everything else by both. Not its start or its end: whatever saw the finger
 * go down must see it lift — the drum waits for it before it'll take
 * another.) Returns the cleanup.
 */
function dragSideways(
  box: HTMLElement,
  where: () => number,
  moveTo: (x: number) => number,
): () => void {
  let active = false
  let x0 = 0
  let y0 = 0
  let from = 0
  let mode: 'undecided' | 'sideways' | 'not' = 'not'
  let k = 1 // element px per screen px (the card may be drawn scaled)
  let lastX = 0
  let lastT = 0
  let v = 0 // element px per ms
  let raf = 0
  const stopGlide = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const begin = (x: number, y: number, t: number) => {
    if (active) return
    stopGlide()
    active = true
    x0 = lastX = x
    y0 = y
    lastT = t
    from = where()
    v = 0
    k = box.offsetWidth / (box.getBoundingClientRect().width || 1)
    mode = 'undecided'
  }
  /** Follows the finger; whether it's a sideways drag (ours). */
  const track = (x: number, y: number, t: number) => {
    if (!active || mode === 'not') return false
    const dx = x - x0
    if (mode === 'undecided') {
      const dy = y - y0
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return false
      mode = Math.abs(dx) > Math.abs(dy) ? 'sideways' : 'not'
      if (mode === 'not') return false
    }
    moveTo(from - dx * k)
    const dt = t - lastT
    if (dt > 0) v = 0.6 * ((-(x - lastX) * k) / dt) + 0.4 * v
    lastX = x
    lastT = t
    return true
  }
  const end = (t: number) => {
    if (!active) return false
    active = false
    const ours = mode === 'sideways'
    mode = 'not'
    if (!ours) return false
    // Not a tap: the click this release makes is swallowed.
    const swallow = (c: MouseEvent) => {
      c.preventDefault()
      c.stopPropagation()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, true), 400)
    // Carries on, slowing (unless held still before letting go).
    if (t - lastT > 60) v = 0
    let prev = performance.now()
    const glide = (now: number) => {
      const dt = Math.min(32, now - prev)
      prev = now
      v *= Math.pow(0.995, dt)
      const before = where()
      if (Math.abs(v) < 0.02 || moveTo(before + v * dt) === before)
        return stopGlide()
      raf = requestAnimationFrame(glide)
    }
    if (Math.abs(v) > 0.05) raf = requestAnimationFrame(glide)
    return true
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1)
      begin(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp)
  }
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0]
    if (t && track(t.clientX, t.clientY, e.timeStamp)) {
      if (e.cancelable) e.preventDefault()
      e.stopPropagation() // (not the card's to pull)
    }
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (end(e.timeStamp) && e.cancelable) e.preventDefault() // (no click)
  }
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') begin(e.clientX, e.clientY, e.timeStamp)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    if (track(e.clientX, e.clientY, e.timeStamp) || mode === 'sideways')
      e.stopPropagation() // (not the drum's)
  }
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') end(e.timeStamp)
  }
  const onCancel = () => {
    active = false
    mode = 'not'
  }
  // A trackpad's sideways swipe (or a mouse's sideways wheel).
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    e.preventDefault()
    stopGlide()
    moveTo(where() + e.deltaX)
  }
  const listen: [string, EventListener, AddEventListenerOptions][] = [
    ['touchstart', onTouchStart as EventListener, { passive: true }],
    ['touchmove', onTouchMove as EventListener, { passive: false }],
    ['touchend', onTouchEnd as EventListener, { passive: false }],
    ['touchcancel', onCancel, {}],
    ['pointerdown', onPointerDown as EventListener, {}],
    ['pointermove', onPointerMove as EventListener, {}],
    ['pointerup', onPointerUp as EventListener, {}],
    ['pointercancel', onCancel, {}],
    ['wheel', onWheel as EventListener, { passive: false }],
  ]
  for (const [type, f, o] of listen) box.addEventListener(type, f, o)
  return () => {
    stopGlide()
    for (const [type, f, o] of listen) box.removeEventListener(type, f, o)
  }
}
