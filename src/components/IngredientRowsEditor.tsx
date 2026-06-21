import type { Ingredient } from '../data/types'

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
          <input
            value={row.quantity ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              update(i, { quantity: v === '' ? undefined : Number(v) })
            }}
            inputMode="decimal"
            placeholder="Qty"
            aria-label="Quantity"
            className="w-16 rounded-lg border border-border bg-surface px-2 py-2 text-center focus:border-brand focus:outline-none"
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
