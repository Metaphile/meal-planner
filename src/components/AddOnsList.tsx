import { useMemo, useRef, useState, type FocusEvent } from 'react'
import { useStore } from '../store/store'
import type { AddOn, Ingredient } from '../data/types'
import { QuantityInput } from './QuantityInput'
import { COMMON_UNITS, MARK_BUTTON, RowMark, UnitCell } from './RecipeCard'

// The lines: the item, how much, its unit, and × to take it off.
const COLS = 'grid grid-cols-[minmax(0,1fr)_3.25rem_4.25rem_1.75rem]'
const CELL =
  'h-[30px] min-w-0 bg-transparent pt-[6px] leading-[24px] focus:bg-kraft/15 focus:outline-none'
const RULE = 'border-l border-line-blue'

/**
 * Add-ons: things wanted that aren't from a recipe, jotted down by hand on
 * a notepad sheet — one per ruled line, edited where they are. There's
 * always an empty line at the end to write the next one on; it's added once
 * you press Enter or move off the line (with something written on it).
 */
export function AddOnsList({ canEdit }: { canEdit: boolean }) {
  const addons = useStore((s) => s.addons)
  const units = useMemo(() => {
    const extra = new Set<string>()
    for (const a of addons)
      if (a.unit && !COMMON_UNITS.includes(a.unit)) extra.add(a.unit)
    return [...COMMON_UNITS, ...[...extra].sort()]
  }, [addons])

  return (
    <div className="paper-card notepad font-hand rounded-t-md px-4 pt-3 pb-3 text-[22px]">
      <div role="table" aria-label="Add-ons">
        {addons.map((a) => (
          <AddOnLine key={a.id} addon={a} units={units} canEdit={canEdit} />
        ))}
        {canEdit && <SpareLine units={units} />}
        {!canEdit && addons.length === 0 && (
          <p className="py-1 text-center text-ink-faint">Nothing yet.</p>
        )}
      </div>
    </div>
  )
}

function AddOnLine({
  addon,
  units,
  canEdit,
}: {
  addon: AddOn
  units: string[]
  canEdit: boolean
}) {
  const update = useStore((s) => s.updateAddOn)
  const remove = useStore((s) => s.removeAddOn)
  const set = (patch: Partial<Ingredient>) => update(addon.id, patch)
  return (
    <div role="row" className={`${COLS} items-center border-b border-line-blue`}>
      <input
        value={addon.name}
        onChange={(e) => set({ name: e.target.value })}
        readOnly={!canEdit}
        aria-label="Item"
        autoComplete="off"
        className={`${CELL} pr-1`}
      />
      <QuantityInput
        value={addon.quantity}
        onChange={(quantity) => set({ quantity })}
        placeholder=""
        readOnly={!canEdit}
        className={`${CELL} ${RULE} pr-1 text-right`}
      />
      <UnitCell
        value={addon.unit}
        onChange={(unit) => set({ unit })}
        units={units}
        disabled={!canEdit}
        className={`${CELL} ${RULE} pl-1.5`}
      />
      {canEdit ? (
        <button
          type="button"
          onClick={() => remove(addon.id)}
          aria-label={`Remove ${addon.name || 'item'}`}
          className={MARK_BUTTON}
        >
          <RowMark kind="cross" />
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

/** The empty line at the end: written on, it becomes an add-on. */
function SpareLine({ units }: { units: string[] }) {
  const add = useStore((s) => s.addAddOn)
  const [draft, setDraft] = useState<Ingredient>({ name: '' })
  const rowRef = useRef<HTMLDivElement>(null)
  const commit = () => {
    if (!draft.name.trim()) return
    add({ ...draft, name: draft.name.trim() })
    setDraft({ name: '' })
  }
  // Moving off the line (not just to its other fields, or its unit menu).
  const onBlur = (e: FocusEvent) => {
    if (!rowRef.current?.contains(e.relatedTarget as Node)) commit()
  }
  return (
    <div
      ref={rowRef}
      role="row"
      onBlur={onBlur}
      className={`${COLS} items-center border-b border-line-blue`}
    >
      <input
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="Add an item…"
        aria-label="New item"
        autoComplete="off"
        enterKeyHint="done"
        className={`${CELL} pr-1 placeholder:text-pencil`}
      />
      <QuantityInput
        value={draft.quantity}
        onChange={(quantity) => setDraft((d) => ({ ...d, quantity }))}
        placeholder="Qty"
        className={`${CELL} ${RULE} pr-1 text-right placeholder:text-pencil`}
      />
      <UnitCell
        value={draft.unit}
        onChange={(unit) => setDraft((d) => ({ ...d, unit }))}
        units={units}
        placeholder="Unit"
        className={`${CELL} ${RULE} pl-1.5`}
      />
      <span />
    </div>
  )
}
