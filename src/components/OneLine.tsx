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

  // Which ends fade, and how much: as much as is hidden there, up to
  // FEATHER (so a fade comes and goes smoothly as it's swiped).
  const edges = () => {
    const b = boxRef.current
    if (!b) return
    const hidden = b.scrollWidth - b.clientWidth
    b.style.setProperty('--fade-l', `${Math.min(b.scrollLeft, FEATHER)}px`)
    b.style.setProperty(
      '--fade-r',
      `${Math.min(Math.max(0, hidden - b.scrollLeft), FEATHER)}px`,
    )
  }
  useLayoutEffect(() => {
    if (!cut) return
    boxRef.current!.scrollLeft = 0
    edges()
  }, [cut, text])
  useEffect(() => {
    if (cut) return dragSideways(boxRef.current!)
  }, [cut])

  return (
    <span
      ref={boxRef}
      onScroll={cut ? edges : undefined}
      className={`one-line block ${cut ? 'one-line-cut no-scrollbar' : ''} ${
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
      <span
        ref={textRef}
        className="relative whitespace-nowrap"
        style={cut ? undefined : { left: shift }}
      >
        {text}
      </span>
      {/* (Room at the end, as at the start: scrolled all the way, the last
          letter rests clear of the edge.) */}
      {cut && <span aria-hidden className="inline-block" style={{ width: OUTSET }} />}
    </span>
  )
}

/**
 * A finger's sideways drag on a cut-off line scrolls it, following the
 * finger, and carries on a little when let go (slowing to a stop). A drag
 * that starts out more up-and-down than sideways is left alone. A sideways
 * one isn't anyone else's: the drum doesn't see it, and it isn't a tap (no
 * taking the card out). Returns the cleanup.
 */
function dragSideways(box: HTMLElement): () => void {
  let id = -1
  let x0 = 0
  let y0 = 0
  let left0 = 0
  let mode: 'undecided' | 'sideways' | 'not' = 'not'
  let k = 1 // element px per screen px (the card may be drawn scaled)
  let lastX = 0
  let lastT = 0
  let v = 0 // element px per ms
  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return // (a mouse has the wheel)
    stop()
    id = e.pointerId
    x0 = lastX = e.clientX
    y0 = e.clientY
    lastT = e.timeStamp
    left0 = box.scrollLeft
    v = 0
    k = box.offsetWidth / (box.getBoundingClientRect().width || 1)
    mode = 'undecided'
  }
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id || mode === 'not') return
    const dx = e.clientX - x0
    const dy = e.clientY - y0
    if (mode === 'undecided') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        mode = 'not'
        return
      }
      mode = 'sideways'
      try {
        box.setPointerCapture(e.pointerId)
      } catch {
        /* (gone) */
      }
    }
    e.stopPropagation() // (not the drum's)
    box.scrollLeft = left0 - dx * k
    const dt = e.timeStamp - lastT
    if (dt > 0) v = 0.6 * ((-(e.clientX - lastX) * k) / dt) + 0.4 * v
    lastX = e.clientX
    lastT = e.timeStamp
  }
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    id = -1
    if (mode !== 'sideways') {
      mode = 'not'
      return
    }
    mode = 'not'
    e.stopPropagation()
    // Not a tap: the click this release makes is swallowed.
    const swallow = (c: MouseEvent) => {
      c.preventDefault()
      c.stopPropagation()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, true), 400)
    // Carries on, slowing (unless held still before letting go).
    if (e.timeStamp - lastT > 60) v = 0
    let t = performance.now()
    const glide = (now: number) => {
      const dt = Math.min(32, now - t)
      t = now
      v *= Math.pow(0.995, dt)
      const before = box.scrollLeft
      box.scrollLeft = before + v * dt
      if (Math.abs(v) < 0.02 || box.scrollLeft === before) return stop()
      raf = requestAnimationFrame(glide)
    }
    if (Math.abs(v) > 0.05) raf = requestAnimationFrame(glide)
  }
  const cancel = (e: PointerEvent) => {
    if (e.pointerId === id) {
      id = -1
      mode = 'not'
    }
  }
  box.addEventListener('pointerdown', down)
  box.addEventListener('pointermove', move)
  box.addEventListener('pointerup', up)
  box.addEventListener('pointercancel', cancel)
  return () => {
    stop()
    box.removeEventListener('pointerdown', down)
    box.removeEventListener('pointermove', move)
    box.removeEventListener('pointerup', up)
    box.removeEventListener('pointercancel', cancel)
  }
}
