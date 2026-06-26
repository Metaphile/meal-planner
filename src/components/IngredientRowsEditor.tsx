import { useState } from 'react'
import type { Ingredient } from '../data/types'

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
function QuantityInput({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (quantity: number | undefined) => void
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
      placeholder="Qty"
      aria-label="Quantity"
      className="w-16 rounded-lg border border-border bg-surface px-2 py-2 text-center focus:border-brand focus:outline-none"
    />
  )
}

/**
 * Controlled editor for a list of ingredient rows (name + optional qty + unit).
 * Used by both the recipe editor and the meal editor's "simple items".
 * Edits live in the parent's local component state and only reach the store on
 * save — nothing is persisted per keystroke.
 */
export function IngredientRowsEditor({
  rows,
  onChange,
  addLabel = '+ Add ingredient',
}: {
  rows: Ingredient[]
  onChange: (rows: Ingredient[]) => void
  addLabel?: string
}) {
  const update = (i: number, patch: Partial<Ingredient>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const add = () => onChange([...rows, { name: '' }])

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Ingredient"
            aria-label="Ingredient name"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 focus:border-brand focus:outline-none"
          />
          <QuantityInput
            value={row.quantity}
            onChange={(quantity) => update(i, { quantity })}
          />
          <input
            value={row.unit ?? ''}
            onChange={(e) =>
              update(i, { unit: e.target.value || undefined })
            }
            placeholder="Unit"
            aria-label="Unit"
            className="w-20 rounded-lg border border-border bg-surface px-2 py-2 focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove ingredient"
            className="shrink-0 rounded-lg border border-border px-2 py-2 text-muted active:scale-95"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start rounded-full border border-border px-3 py-1.5 text-sm text-brand active:scale-95"
      >
        {addLabel}
      </button>
    </div>
  )
}
