import { useMemo, useRef, useState, type FocusEvent } from 'react'
import { useStore } from '../store/store'
import type { AddOn, Ingredient } from '../data/types'
import { QuantityInput } from './QuantityInput'
import { Tickbox } from './IngredientsList'
import {
  COMMON_UNITS,
  EDIT_CLASS,
  MARK_BUTTON,
  RowMark,
  UnitCell,
} from './RecipeCard'

// The lines: a box to tick once it's got, the item, how much, its unit, and
// × to take it off. (The box where the shopping list's are, before its
// lines.)
const COLS = 'grid grid-cols-[1.75rem_minmax(0,1fr)_3.25rem_4.25rem_1.75rem]'
const CELL =
  // (The middle of its lowercase letters the line's middle: a stroke
  // through them meets the ×. A field centres its writing in what its
  // padding leaves: padded below, it's 2px high.)
  'h-[30px] min-w-0 bg-transparent pt-0 pb-[4px] leading-[24px] focus:bg-kraft/15 focus:outline-none'
const RULE = 'border-l border-line-blue'
/** A quantity field fitted to its figures, in its cell. */
const FITTED = 'h-full min-w-[4px] bg-transparent p-0 text-left focus:outline-none'

/**
 * Add-ons: things wanted that aren't from a recipe, jotted down by hand on
 * a notepad sheet — one per ruled line, edited where they are. There's
 * always an empty line at the end to write the next one on; it's added once
 * you press Enter or move off the line (with something written on it).
 *
 * Taking items off is two steps: × crosses a line out (↺ brings it back),
 * as many as you like; then Delete takes them off, or Cancel keeps them all.
 * Each can be ticked once it's got (on hand) — just ticked: there's nothing
 * to count it against.
 */
export function AddOnsList({
  canEdit,
  bare = false,
}: {
  canEdit: boolean
  /** Written straight on what it's on (a card), not on a sheet of its own. */
  bare?: boolean
}) {
  const addons = useStore((s) => s.addons)
  const remove = useStore((s) => s.removeAddOn)
  const [crossed, setCrossed] = useState<ReadonlySet<string>>(new Set())
  // (Only lines still there: one taken off elsewhere is gone.)
  const marked = addons.filter((a) => crossed.has(a.id))
  const toggle = (id: string) =>
    setCrossed((c) => {
      const next = new Set(c)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const deleteMarked = () => {
    for (const a of marked) remove(a.id)
    setCrossed(new Set())
  }
  const units = useMemo(() => {
    const extra = new Set<string>()
    for (const a of addons)
      if (a.unit && !COMMON_UNITS.includes(a.unit)) extra.add(a.unit)
    return [...COMMON_UNITS, ...[...extra].sort()]
  }, [addons])

  return (
    <div
      className={`font-hand text-[22px] ${
        bare ? '' : 'paper-card notepad rounded-t-md px-4 pt-3 pb-3'
      }`}
    >
      <div role="table" aria-label="Add-ons">
        {addons.map((a) => (
          <AddOnLine
            key={a.id}
            addon={a}
            units={units}
            canEdit={canEdit}
            crossed={crossed.has(a.id)}
            onToggle={() => toggle(a.id)}
          />
        ))}
        {canEdit && <SpareLine units={units} />}
        {!canEdit && addons.length === 0 && (
          <p className="py-1 text-center text-ink-faint">Nothing yet.</p>
        )}
      </div>
      {marked.length > 0 && (
        // (Printed, not written: they're buttons.)
        // (Delete at the far left, Cancel at the right — as on a card's
        // back.)
        <div className="flex gap-2 pt-3 font-sans">
          <button
            type="button"
            onClick={deleteMarked}
            className="rounded-full bg-danger px-4 py-1.5 text-sm font-semibold leading-5 text-white transition active:scale-95"
          >
            Delete
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setCrossed(new Set())}
            className={EDIT_CLASS}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function AddOnLine({
  addon,
  units,
  canEdit,
  crossed,
  onToggle,
}: {
  addon: AddOn
  units: string[]
  canEdit: boolean
  /** Crossed out, to be taken off (on Delete). */
  crossed: boolean
  onToggle: () => void
}) {
  const update = useStore((s) => s.updateAddOn)
  const set = (patch: Partial<Ingredient & Pick<AddOn, 'have'>>) =>
    update(addon.id, patch)
  const fixed = !canEdit || crossed
  return (
    <div
      role="row"
      className={`${COLS} relative items-center border-b border-line-blue`}
    >
      <Tickbox
        state={addon.have ? 'on' : 'off'}
        disabled={fixed}
        label={`Have ${addon.name || 'item'}`}
        onChange={(have) => set({ have: have || undefined })}
        className="items-center"
      />
      <input
        value={addon.name}
        onChange={(e) => set({ name: e.target.value })}
        readOnly={fixed}
        aria-label="Item"
        autoComplete="off"
        className={`${CELL} pr-1`}
      />
      <QuantityInput
        value={addon.quantity}
        onChange={(quantity) => set({ quantity })}
        placeholder=""
        readOnly={fixed}
        // (Fitted to its figures, so the last one's stroke isn't cut off —
        // see QuantityInput.)
        fitClassName={`${CELL} ${RULE} flex justify-end pr-px focus-within:bg-kraft/15`}
        className={FITTED}
      />
      <UnitCell
        value={addon.unit}
        onChange={(unit) => set({ unit })}
        units={units}
        disabled={fixed}
        className={`${CELL} ${RULE} pl-1.5`}
      />
      {canEdit ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={crossed}
          aria-label={
            crossed
              ? `Keep ${addon.name || 'item'}`
              : `Cross out ${addon.name || 'item'}`
          }
          className={MARK_BUTTON}
        >
          <RowMark kind={crossed ? 'restore' : 'cross'} />
        </button>
      ) : (
        <span />
      )}
      {crossed && (
        // A pen stroke through the line.
        <span
          aria-hidden
          className="pointer-events-none absolute left-[calc(1.75rem-2px)] right-8 top-[calc(50%-0.5px)] h-px rounded-full bg-ink"
          style={{ transform: 'rotate(-0.5deg)' }}
        />
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
      <span />
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
        fitClassName={`${CELL} ${RULE} flex justify-end pr-px focus-within:bg-kraft/15`}
        className={`${FITTED} placeholder:text-pencil`}
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
