import { useLayoutEffect, useRef, useState } from 'react'

function fmtQty(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

function parseQty(text: string): number | undefined {
  const t = text.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isNaN(n) ? undefined : n
}

/**
 * Quantity field that keeps the raw text you're typing so in-progress decimals
 * (e.g. "1." on the way to "1.5") survive — a plain controlled number input
 * reformats "1." back to "1" and eats the decimal point. The numeric value is
 * parsed underneath. External value changes (e.g. a row removed, shifting
 * indices) are adopted, but not when they match the number the draft already
 * represents.
 */
export function QuantityInput({
  value,
  onChange,
  placeholder = 'Qty',
  readOnly,
  className = '',
  onKeyDown,
  enterKeyHint,
  fitClassName,
}: {
  value: number | undefined
  onChange: (quantity: number | undefined) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>['enterKeyHint']
  /**
   * Set against the right of a cell (this, its classes): the field just as
   * wide as what's written in it, and a little more — a handwritten figure's
   * stroke reaches past its own width (the 7's top, say), and a field cuts
   * off whatever reaches past its edge, which for writing set against its
   * right is all of that. (`className` is then the field's own.) The whole
   * cell's tapped into, as if it were the field.
   */
  fitClassName?: string
}) {
  const [draft, setDraft] = useState(() => fmtQty(value))
  const justFocused = useRef(false)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (parseQty(draft) !== value) setDraft(fmtQty(value))
  }

  // (Fitted: as wide as the writing, and FIT_ROOM more.)
  const fieldRef = useRef<HTMLInputElement>(null)
  const [width, setWidth] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (fitClassName === undefined) return
    const fit = () => {
      const field = fieldRef.current
      if (!field) return
      const ctx = measurer().getContext('2d')!
      ctx.font = getComputedStyle(field).font
      // (Exact, so figures in a column end level. Empty: as wide as what
      // it says when empty, if anything.)
      const text = field.value || field.placeholder
      setWidth(ctx.measureText(text).width + FIT_ROOM)
    }
    fit()
    // (Once the handwriting's in: it's not the width of what stood in.)
    void document.fonts?.ready.then(fit)
  }, [draft, fitClassName])

  const field = (
    <input
      ref={fieldRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        onChange(parseQty(e.target.value))
      }}
      inputMode="decimal"
      placeholder={placeholder}
      readOnly={readOnly}
      // Tapped into, what's there is selected, to type over. (After the tap
      // settles: iOS places the caret after focus, undoing an earlier
      // selection; and the click that follows mustn't put it back.)
      onFocus={(e) => {
        if (readOnly) return
        const field = e.currentTarget
        justFocused.current = true
        setTimeout(() => field.setSelectionRange(0, field.value.length))
      }}
      onMouseUp={(e) => {
        if (justFocused.current) e.preventDefault()
        justFocused.current = false
      }}
      onKeyDown={onKeyDown}
      enterKeyHint={enterKeyHint}
      aria-label="Quantity"
      autoComplete="off"
      className={className}
      style={fitClassName === undefined ? undefined : { width }}
    />
  )
  if (fitClassName === undefined) return field
  return (
    <span
      className={fitClassName}
      // (A tap anywhere in the cell: into the field.)
      onClick={(e) => {
        if (e.target === e.currentTarget) fieldRef.current?.focus()
      }}
    >
      {field}
    </span>
  )
}

/** Room past a fitted field's writing, for its last stroke. */
const FIT_ROOM = 3

let canvas: HTMLCanvasElement | undefined
const measurer = () => (canvas ??= document.createElement('canvas'))
