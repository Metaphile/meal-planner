import { useState } from 'react'

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
  className = '',
}: {
  value: number | undefined
  onChange: (quantity: number | undefined) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState(() => fmtQty(value))
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (parseQty(draft) !== value) setDraft(fmtQty(value))
  }

  return (
    <input
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        onChange(parseQty(e.target.value))
      }}
      inputMode="decimal"
      placeholder={placeholder}
      aria-label="Quantity"
      autoComplete="off"
      className={className}
    />
  )
}
