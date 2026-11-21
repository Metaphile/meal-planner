import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * A title on one line: as it is if it fits; if not, it runs past like a
 * ticker, round and round (two copies, each followed by a dot that marks
 * where the title ends and starts again, sliding by half their length).
 * Whether it fits is measured when it's laid out (and resized), never per
 * frame; the moving text is a layer of its own, so it slides without
 * re-drawing the card. Running, its ends are feathered: it fades out over
 * FEATHER px at either end of a box that reaches OUTSET px out into the
 * space either side of it. (Reduced motion: an ellipsis.)
 */
export function Ticker({
  text,
  centred = true,
}: {
  text: string
  /** Still, centred on its row (a card's title); else at the start (left). */
  centred?: boolean
}) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const trackRef = useRef<HTMLSpanElement>(null)
  const [runs, setRuns] = useState(false)
  const [loop, setLoop] = useState(0) // px: one title, its dot, and gaps
  // Where a still title last sat (px, from its row's left: see xOf), so a
  // title that starts running — its column narrowed — runs on from there,
  // rather than jumping to where a running title starts. And how far that
  // is from the start (px; + to the right of it).
  const stillAt = useRef<number | null>(null)
  const [lead, setLead] = useState(0)
  // A still title is centred on its row, not its column: the column can be
  // off-centre (a Want count beside the box narrows it on the right), so a
  // still title is moved by `shift` px. It must fit centred so; a running
  // title has the whole column.
  const [shift, setShift] = useState(0)
  const runsRef = useRef(runs)
  const shiftRef = useRef(shift)
  // (Its column: the box's parent; its row: the column's.)
  const rowOf = () => boxRef.current!.parentElement!.parentElement!
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
    return { runs: !fits, shift: fits ? -off : 0 }
  }
  useLayoutEffect(() => {
    const m = measure()
    setRuns(m.runs)
    setShift(m.shift)
    // (Resized: settled at once, before it's drawn — else a frame is drawn
    // of the title overflowing, still.)
    const ro = new ResizeObserver(() => {
      const m = measure()
      if (m.runs !== runsRef.current || m.shift !== shiftRef.current)
        flushSync(() => {
          setRuns(m.runs)
          setShift(m.shift)
        })
    })
    ro.observe(boxRef.current!.parentElement!)
    return () => ro.disconnect()
  }, [text])
  // Still, where it's drawn. (Unless it's about to run: on its first
  // measure, a title too long is never drawn still.)
  useLayoutEffect(() => {
    runsRef.current = runs
    shiftRef.current = shift
    if (!runs && !measure().runs) stillAt.current = xOf(textRef.current!, rowOf())
  })
  useLayoutEffect(() => {
    const t = textRef.current!
    if (!runs) {
      setLead(0)
      return
    }
    const track = trackRef.current!
    setLoop(track.offsetWidth / 2)
    const from = stillAt.current
    stillAt.current = null
    if (from === null) return
    const d = from - xOf(t, rowOf())
    setLead(d)
    // To the right of the start: it slides in to the start, at the ticker's
    // speed, and the ticker waits for it (see animationDelay). To the left:
    // the ticker starts that far along instead.
    if (d > 0)
      track.animate(
        [{ transform: `translateX(${d}px)` }, { transform: 'translateX(0)' }],
        { duration: (d / TICKER_SPEED) * 1000, easing: 'linear' },
      )
  }, [runs, text])
  return (
    <span
      ref={boxRef}
      // (Running, it starts at the left; else it's centred like any title.)
      className={`ticker-box block ${runs || !centred ? 'text-left' : ''} ${runs ? 'ticker-runs' : ''}`}
      style={
        { '--outset': `${OUTSET}px`, '--feather': `${FEATHER}px` } as React.CSSProperties
      }
    >
      <span
        ref={trackRef}
        className={runs ? 'ticker' : 'relative whitespace-nowrap'}
        style={
          !runs
            ? { left: shift }
            : loop
            ? {
                animationDuration: `${loop / TICKER_SPEED}s`,
                animationDelay: `${lead / TICKER_SPEED}s`,
              }
            : undefined
        }
      >
        <span ref={textRef} className="whitespace-nowrap">
          {text}
        </span>
        {runs && (
          <>
            <TickerDot />
            <span aria-hidden className="whitespace-nowrap">
              {text}
            </span>
            <TickerDot />
          </>
        )}
      </span>
    </span>
  )
}

/** px a second. */
const TICKER_SPEED = 36

/** Where a title's text sits, px from the left of its row (the title's
 *  row, which stays put as its column narrows): in the card's own px,
 *  however the card is drawn (tilted in the box, scaled). (Not offsetLeft:
 *  a running title's track becomes the offset parent.) */
function xOf(text: HTMLElement, row: HTMLElement) {
  const r = row.getBoundingClientRect()
  return (
    ((text.getBoundingClientRect().left - r.left) * row.offsetWidth) / r.width
  )
}
/** px: how far the title's box reaches out either side of its column (into
 *  the space between it and the star, and the box). */
const OUTSET = 8
/** px: how far a running title's ends fade, from the box's edges in. (It
 *  starts, at rest, just past the fade.) */
const FEATHER = 20

function TickerDot() {
  return (
    <span aria-hidden className="ticker-dot">
      •
    </span>
  )
}
