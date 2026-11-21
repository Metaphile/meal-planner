import { useLayoutEffect, useRef, useState } from 'react'
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
 * frame; scrolling it moves only its own text. `panY` lets a vertical swipe
 * that starts on it go on to scroll the page — not in the rolodex, whose
 * drum takes vertical drags itself.
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
          touchAction: cut ? (panY ? 'pan-x pan-y' : 'pan-x') : undefined,
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
