import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { useStore } from '../store/store'
import type { AddOn, Ingredient } from '../data/types'
import { QuantityInput } from './QuantityInput'
import { Tickbox } from './IngredientsList'
import { COMMON_UNITS, UnitCell } from './RecipeCard'

// The lines: a box to tick once it's got, the item, how much, and its unit.
// (The box where the shopping list's are, before its lines.)
const COLS = 'grid grid-cols-[1.75rem_minmax(0,1fr)_3.25rem_4.25rem]'
const CELL =
  // (The middle of its lowercase letters the line's middle: a stroke
  // through them meets the ×. A field centres its writing in what its
  // padding leaves: padded below, it's 2px high.)
  // (Its height and line height: 30 and 24 — larger, on the shopping list:
  // see AddOnsList.)
  'h-[var(--cell-h,30px)] min-w-0 bg-transparent pt-0 pb-[4px] leading-[var(--cell-lead,24px)] focus:bg-kraft/15 focus:outline-none'
const RULE = 'border-l border-line-blue'
/** A quantity field fitted to its figures, in its cell. */
const FITTED = 'h-full min-w-[4px] bg-transparent p-0 text-left focus:outline-none'

/**
 * Add-ons: things wanted that aren't from a recipe, jotted down by hand on
 * a notepad sheet — one per ruled line, edited where they are. There's
 * always an empty line at the end to write the next one on; it's added once
 * you press Enter or move off the line (with something written on it).
 *
 * Each can be ticked once it's got (on hand) — just ticked: there's nothing
 * to count it against. Ticked, it's done with: Delete selected (there while
 * any is ticked) takes off all the ticked ones. One with nothing left on it
 * (no name, amount or unit) goes — however it got that way — once it's not
 * being written in.
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
  const ticked = addons.filter((a) => a.have)
  const deleteTicked = () => {
    for (const a of ticked) remove(a.id)
  }
  const units = useMemo(() => {
    const extra = new Set<string>()
    for (const a of addons)
      if (a.unit && !COMMON_UNITS.includes(a.unit)) extra.add(a.unit)
    return [...COMMON_UNITS, ...[...extra].sort()]
  }, [addons])

  return (
    <div
      className={`font-hand ${
        bare
          ? // (On the shopping list: as large as its other lines.)
            'text-[26px] [--cell-h:36px] [--cell-lead:30px]'
          : 'paper-card notepad rounded-t-md px-4 pt-3 pb-3 text-[22px]'
      }`}
    >
      <div role="table" aria-label="Add-ons">
        {addons.map((a) => (
          <AddOnLine
            key={a.id}
            addon={a}
            units={units}
            canEdit={canEdit}
          />
        ))}
        {canEdit && <SpareLine units={units} />}
        {!canEdit && addons.length === 0 && (
          <p className="py-1 text-center text-ink-faint">Nothing yet.</p>
        )}
      </div>
      {canEdit && ticked.length > 0 && (
        // (Printed, not written: it's a button. At the far left, as Delete
        // is on a card's back.)
        <div className="flex pt-3 font-sans">
          <button
            type="button"
            onClick={deleteTicked}
            className="rounded-full bg-danger px-4 py-1.5 text-sm font-semibold leading-5 text-white transition active:scale-95"
          >
            Delete selected
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
}: {
  addon: AddOn
  units: string[]
  canEdit: boolean
}) {
  const update = useStore((s) => s.updateAddOn)
  const remove = useStore((s) => s.removeAddOn)
  const rowRef = useRef<HTMLDivElement>(null)
  // (A tap within the line, under way: on iOS a tap on a button, like its
  // unit's, takes the focus to nowhere — that's not leaving it.)
  const tapping = useRef(false)
  // Nothing left on it, and not being written in: gone.
  const dropIfEmpty = () => {
    const now = useStore.getState().addons.find((x) => x.id === addon.id)
    if (
      !now ||
      !blank(now) ||
      tapping.current ||
      rowRef.current?.contains(document.activeElement)
    )
      return
    remove(addon.id)
  }
  const set = (patch: Partial<Ingredient & Pick<AddOn, 'have'>>) => {
    update(addon.id, patch)
    // (Emptied from outside it — its unit taken off, no field in it
    // focused: gone at once.)
    setTimeout(dropIfEmpty)
  }
  // Empty, a tap anywhere else leaves it (even with nothing focused in it).
  const empty = blank(addon)
  useEffect(() => {
    if (!empty || !canEdit) return
    const onDown = (e: PointerEvent) => {
      if (rowRef.current?.contains(e.target as Node)) return
      setTimeout(dropIfEmpty, 300)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () =>
      window.removeEventListener('pointerdown', onDown, { capture: true })
  })
  const fixed = !canEdit
  return (
    <div
      ref={rowRef}
      role="row"
      className={`${COLS} relative items-center border-b border-line-blue`}
      onPointerDownCapture={() => {
        tapping.current = true
        const done = () => setTimeout(() => (tapping.current = false))
        window.addEventListener('click', done, { capture: true, once: true })
        setTimeout(done, 1000)
      }}
      onBlur={(e) => {
        if (rowRef.current?.contains(e.relatedTarget as Node)) return
        setTimeout(dropIfEmpty)
      }}
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
    </div>
  )
}

/** Nothing on it: no name, amount or unit. */
const blank = (a: Ingredient) =>
  !a.name.trim() && a.quantity === undefined && !a.unit

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
    </div>
  )
}
