import { useCallback, useEffect, useRef } from 'react'

/**
 * Swipe-right-to-remove driven entirely by GPU transforms on the element ref.
 * Pointer moves update a ref + a single rAF write to `transform` — there is NO
 * React state per pointermove, so dragging never triggers a render storm. React
 * only hears about it once, on release past the threshold (via onRemove).
 */
export function useSwipeToRemove<T extends HTMLElement>(
  onRemove: () => void,
  { threshold = 0.4 }: { threshold?: number } = {},
) {
  const ref = useRef<T | null>(null)
  const onRemoveRef = useRef(onRemove)
  onRemoveRef.current = onRemove

  const s = useRef({
    startX: 0,
    startY: 0,
    dx: 0,
    engaged: false, // committed to a horizontal swipe
    decided: false, // axis decided for this gesture
    pointerId: -1,
    raf: 0,
    width: 0,
  })

  const paint = useCallback(() => {
    s.current.raf = 0
    const el = ref.current
    if (!el) return
    const dx = Math.max(0, s.current.dx) // only rightward
    el.style.transform = `translateX(${dx}px)`
    el.style.opacity = String(1 - Math.min(dx / (s.current.width || 1), 0.6))
  }, [])

  const schedule = useCallback(() => {
    if (!s.current.raf) s.current.raf = requestAnimationFrame(paint)
  }, [paint])

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = ref.current
    if (!el) return
    s.current.startX = e.clientX
    s.current.startY = e.clientY
    s.current.dx = 0
    s.current.engaged = false
    s.current.decided = false
    s.current.pointerId = e.pointerId
    s.current.width = el.offsetWidth
    el.style.transition = 'none'
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (e.pointerId !== s.current.pointerId) return
      const dx = e.clientX - s.current.startX
      const dy = e.clientY - s.current.startY

      if (!s.current.decided) {
        // Wait for a clear intent before claiming the gesture.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.current.decided = true
        // Horizontal-right intent engages the swipe; otherwise let it scroll.
        s.current.engaged = Math.abs(dx) > Math.abs(dy) && dx > 0
      }
      if (!s.current.engaged) return

      // Claim the pointer so the scroller doesn't fight us.
      e.preventDefault()
      ref.current?.setPointerCapture(e.pointerId)
      s.current.dx = dx
      schedule()
    },
    [schedule],
  )

  const finish = useCallback(() => {
    const el = ref.current
    if (!el) return
    const past = s.current.engaged && s.current.dx > s.current.width * threshold
    el.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out'
    if (past) {
      el.style.transform = `translateX(${s.current.width}px)`
      el.style.opacity = '0'
      const done = () => {
        el.removeEventListener('transitionend', done)
        onRemoveRef.current()
      }
      el.addEventListener('transitionend', done)
    } else {
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
    }
    s.current.engaged = false
    s.current.decided = false
    s.current.pointerId = -1
  }, [threshold])

  // Clean up a pending frame on unmount.
  useEffect(() => () => cancelAnimationFrame(s.current.raf), [])

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  }
}
