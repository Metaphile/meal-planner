import type { PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'

/*
 * Moving lines up and down by their grips — a card's ingredient lines and
 * sections, the shopping list's add-ons. Each drag is transforms only, on
 * rows laid out once as it starts: nothing re-renders till it's let go.
 */

/**
 * A drag by a grip is never a tap on what's under the finger when it lets
 * go — on iOS, lifting the finger can count as a tap there, which would put
 * the caret in the field now under it (after a drop, another line's name).
 * So the touch's end is the grip's alone (no tap made of it), any click it
 * makes is swallowed, and nothing in the table takes the focus meanwhile.
 * Returns what to call once the drag's over (it stands guard a moment
 * longer, for a tap that comes late).
 */
function guardDrag(handle: HTMLElement, table: HTMLElement) {
  const noTap = (ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault()
  }
  const noClick = (ev: MouseEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
  }
  const noFocus = (ev: FocusEvent) => (ev.target as HTMLElement).blur?.()
  handle.addEventListener('touchend', noTap, { passive: false })
  window.addEventListener('click', noClick, true)
  table.addEventListener('focusin', noFocus)
  return () =>
    setTimeout(() => {
      handle.removeEventListener('touchend', noTap)
      window.removeEventListener('click', noClick, true)
      table.removeEventListener('focusin', noFocus)
    }, 400)
}

/**
 * Dragging a whole section by its title's grip: up or down, among the
 * sections (it can go first: the first is the starter, whichever it is). It
 * lifts, title and lines together; the others slide aside to show where
 * it'd go. Let go, it settles there and the move is made (`onDrop`: to just
 * before the section at `to`, or last). As dragRow: transforms only, and
 * scrolling near the edges.
 */
export function dragSection(
  e: ReactPointerEvent<HTMLElement>,
  onDrop: (to: number) => void,
) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const handle = e.currentTarget
  const table = handle.closest('[role=table]') as HTMLElement
  const block = handle.closest('[role=rowgroup]') as HTMLElement
  const unguard = guardDrag(handle, table)
  try {
    handle.setPointerCapture(e.pointerId)
  } catch {
    /* (gone) */
  }
  const id = e.pointerId
  // The sections, then "Add section…" (always after the last).
  const els = [...table.querySelectorAll<HTMLElement>(':scope > [role=rowgroup]')]
  const o = els.indexOf(block)
  const top0 = table.getBoundingClientRect().top
  const rel = els.map((el) => el.getBoundingClientRect().top - top0)
  const h = rel[o + 1] - rel[o] // (its height, and the space after it)
  const spots = els.map((_, k) => k).filter((k) => k !== o)
  const slot = (k: number) => rel[k] - (k > o ? h : 0)
  const minTop = Math.min(...spots.map(slot))
  const maxTop = Math.max(...spots.map(slot))
  const y0 = e.clientY - top0
  let lastY = e.clientY
  let target = o + 1
  Object.assign(block.style, {
    zIndex: '10',
    background: 'var(--color-paper)',
    boxShadow: '0 8px 18px -8px color-mix(in srgb, var(--color-shadow) 45%, transparent)',
    transition: 'none',
  })
  els.forEach((el, k) => {
    if (k !== o) el.style.transition = 'transform 150ms ease'
  })
  const follow = (clientY: number) => {
    lastY = clientY
    const top = table.getBoundingClientRect().top
    const want = Math.min(maxTop, Math.max(minTop, rel[o] + (clientY - top - y0)))
    let bestD = Infinity
    for (const k of spots) {
      const d = Math.abs(slot(k) - want)
      if (d < bestD) {
        bestD = d
        target = k
      }
    }
    els.forEach((el, k) => {
      if (k === o) return
      const shift =
        target > o && k > o && k < target
          ? -h
          : target < o && k >= target && k < o
            ? h
            : 0
      el.style.transform = shift ? `translateY(${shift}px)` : ''
    })
    block.style.transform = `translateY(${want - rel[o]}px)`
  }
  const stopScrolling = scrollNearEdges(table, () => lastY, () => follow(lastY))
  const finish = (drop: boolean) => {
    stopScrolling()
    unguard()
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onCancel)
    const moved = drop && target !== o + 1
    block.style.transition = 'transform 120ms ease-out'
    block.style.transform = `translateY(${moved ? slot(target) - rel[o] : 0}px)`
    if (!moved) els.forEach((el, k) => k !== o && (el.style.transform = ''))
    setTimeout(() => {
      if (moved) flushSync(() => onDrop(target))
      for (const el of els) {
        el.style.transform = ''
        el.style.transition = ''
        el.style.zIndex = ''
        el.style.background = ''
        el.style.boxShadow = ''
      }
    }, 130)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId === id) follow(ev.clientY)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(true)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(false)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onCancel)
}

/** While dragging: near the top or bottom of what `inside` scrolls in, it
 *  scrolls (faster, nearer the edge), and `moved` is called as it does.
 *  Returns the stop. */
function scrollNearEdges(
  inside: HTMLElement,
  y: () => number,
  moved: () => void,
): () => void {
  let scroller: HTMLElement | null = inside.parentElement
  while (scroller) {
    const oy = getComputedStyle(scroller).overflowY
    if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight)
      break
    scroller = scroller.parentElement
  }
  const edge = 56
  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    if (!scroller) return
    const r = scroller.getBoundingClientRect()
    const at = y()
    const v =
      at < r.top + edge
        ? -((r.top + edge - at) / edge) * 10
        : at > r.bottom - edge
          ? ((at - (r.bottom - edge)) / edge) * 10
          : 0
    if (v) {
      scroller.scrollTop += v
      moved()
    }
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

/** Six dots: a line's handle, to drag it up or down by. */
export function GripIcon() {
  return (
    <svg viewBox="0 0 8 14" width={8} height={14} aria-hidden fill="currentColor">
      {[2, 7, 12].map((y) =>
        [2, 6].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.25} />),
      )}
    </svg>
  )
}

/**
 * Dragging an ingredient line by its grip: up or down only, into any
 * section. It lifts and follows the finger; the lines it passes slide aside,
 * opening a gap where it would land (anywhere a line is, or before a
 * section's "Add ingredient…" — or under "Add section…", which then reads
 * as the new section it'll make). Let go, it settles into the gap and the
 * move is made (`onDrop`: to just before the line at `to`; a section past
 * the last is a new one). Near the top or
 * bottom of what scrolls, it scrolls. All by transforms on the lines, laid
 * out once at the start: no re-rendering mid-drag. (Not anywhere `goes`
 * says no to: a move that would change nothing.)
 */
export function dragRow(
  e: ReactPointerEvent<HTMLElement>,
  onDrop: (to: { g: number; i: number }) => void,
  goes: (to: { g: number; i: number }) => boolean = () => true,
) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault() // (not focusing, not selecting)
  e.stopPropagation()
  const handle = e.currentTarget
  const origin = handle.closest('[role=row]') as HTMLElement
  const table = handle.closest('[role=table]') as HTMLElement
  const unguard = guardDrag(handle, table)
  try {
    handle.setPointerCapture(e.pointerId)
  } catch {
    /* (gone) */
  }
  const id = e.pointerId
  const els = [...table.querySelectorAll<HTMLElement>('[role=row]')]
  const o = els.indexOf(origin)
  const h = origin.offsetHeight
  const top0 = table.getBoundingClientRect().top
  const rel = els.map((el) => el.getBoundingClientRect().top - top0)
  // Where it could go: before any other ingredient line (spare ones too);
  // or, as the first line of a new section, under "Add section…" (the last
  // row: `add`).
  const add = els.findIndex((el) => el.dataset.newSection !== undefined)
  const spots = els
    .map((_, k) => k)
    .filter((k) =>
      k === add
        ? goes({ g: Number(els[k].dataset.newSection), i: 0 })
        : k !== o &&
          els[k].dataset.g !== undefined &&
          goes({ g: Number(els[k].dataset.g), i: Number(els[k].dataset.i) }),
    )
  // Its top, put there (the lines below where it was having closed up).
  const slot = (k: number) =>
    k === add
      ? rel[k] - h + els[k].offsetHeight // (under it)
      : rel[k] - (k > o ? h : 0)
  const addField = add >= 0 ? els[add].querySelector('input') : null
  const addHint = addField?.placeholder ?? ''
  const minTop = Math.min(...spots.map(slot))
  const maxTop = Math.max(...spots.map(slot))
  const y0 = e.clientY - top0
  let lastY = e.clientY
  let target = o + 1 // (just where it is: before the next line)

  // Lifted.
  Object.assign(origin.style, {
    zIndex: '10',
    background: 'var(--color-paper)',
    boxShadow: '0 6px 14px -6px color-mix(in srgb, var(--color-shadow) 45%, transparent)',
    transition: 'none',
  })
  els.forEach((el, k) => {
    if (k !== o) el.style.transition = 'transform 150ms ease'
  })

  const follow = (clientY: number) => {
    lastY = clientY
    const top = table.getBoundingClientRect().top
    const want = Math.min(maxTop, Math.max(minTop, rel[o] + (clientY - top - y0)))
    let best = target
    let bestD = Infinity
    for (const k of spots) {
      const d = Math.abs(slot(k) - want)
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    target = best
    // (Headed for a new section: "Add section…" reads as it'll be named.)
    if (addField)
      addField.placeholder =
        target === add ? (els[add].dataset.newLabel ?? addHint) : addHint
    els.forEach((el, k) => {
      if (k === o) return
      const shift =
        // (Under "Add section…": it too closes up.)
        target > o && k > o && (k < target || (target === add && k === add))
          ? -h
          : target < o && k >= target && k < o
            ? h
            : 0
      el.style.transform = shift ? `translateY(${shift}px)` : ''
    })
    origin.style.transform = `translateY(${want - rel[o]}px)`
  }

  const stopScrolling = scrollNearEdges(table, () => lastY, () => follow(lastY))

  const finish = (drop: boolean) => {
    stopScrolling()
    unguard()
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onCancel)
    const moved = drop && target !== o + 1
    const to = !moved
      ? null
      : target === add
        ? { g: Number(els[add].dataset.newSection), i: 0 }
        : { g: Number(els[target].dataset.g), i: Number(els[target].dataset.i) }
    if (addField) addField.placeholder = addHint
    // It settles into its place (or back where it was), then the move is
    // made and everything stands where it now is, in the same frame.
    origin.style.transition = 'transform 120ms ease-out'
    origin.style.transform = `translateY(${moved ? slot(target) - rel[o] : 0}px)`
    if (!moved) els.forEach((el, k) => k !== o && (el.style.transform = ''))
    setTimeout(() => {
      if (to) flushSync(() => onDrop(to))
      for (const el of els) {
        el.style.transform = ''
        el.style.transition = ''
        el.style.zIndex = ''
        el.style.background = ''
        el.style.boxShadow = ''
      }
    }, 130)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId === id) follow(ev.clientY)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(true)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(false)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onCancel)
}
