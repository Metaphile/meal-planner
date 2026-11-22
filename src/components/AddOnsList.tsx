import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import type { AddOn, Ingredient } from '../data/types'
import { Tickbox } from './IngredientsList'

// The lines: a box to tick once it's got, and what it is, written in a word
// or a few ("2 bags of ice"). (The box where the shopping list's are, before
// its lines.)
const COLS = 'grid grid-cols-[1.75rem_minmax(0,1fr)]'
const CELL =
  // (A field centres its writing in what its padding leaves: padded below,
  // it's 2px high. Its height and line height: 30 and 24 — larger, on the
  // shopping list: see AddOnsList.)
  'h-[var(--cell-h,30px)] min-w-0 bg-transparent pt-0 pb-[4px] pr-1 leading-[var(--cell-lead,24px)] focus:bg-kraft/15 focus:outline-none'

/**
 * Add-ons: things wanted that aren't from a recipe, jotted down by hand —
 * one per ruled line, just as it's said ("milk", "2 bags of ice"), edited
 * where it is. There's always an empty line at the end to write the next
 * one on; it's added once you press Enter or move off the line (with
 * something written on it).
 *
 * Each can be ticked once it's got. Ticked, it's done with: Subtract selected (at
 * the foot of the list it's on) takes it off. One with nothing left on it
 * goes — however it got that way — once it's not being written in.
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
          <AddOnLine key={a.id} addon={a} canEdit={canEdit} />
        ))}
        {canEdit && <SpareLine />}
        {!canEdit && addons.length === 0 && (
          <p className="py-1 text-center text-ink-faint">Nothing yet.</p>
        )}
      </div>
    </div>
  )
}

/** An add-on as it's written: its words (as typed, spaces and all) — and,
 *  kept by an older version of the app that had them apart, its amount and
 *  unit after them. */
export const addOnText = (a: Ingredient) =>
  a.quantity === undefined && !a.unit
    ? a.name
    : [a.name.trim(), a.quantity ?? '', a.unit ?? '']
        .filter((p) => p !== '')
        .join(' ')
/** Nothing written on it. */
const blank = (a: Ingredient) => !addOnText(a).trim()

function AddOnLine({ addon, canEdit }: { addon: AddOn; canEdit: boolean }) {
  const update = useStore((s) => s.updateAddOn)
  const remove = useStore((s) => s.removeAddOn)
  const rowRef = useRef<HTMLDivElement>(null)
  // (A tap within the line, under way — its box, say: on iOS a tap on a
  // button takes the focus to nowhere, and that's not leaving it.)
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
  return (
    <div
      ref={rowRef}
      role="row"
      className={`${COLS} items-center border-b border-line-blue`}
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
        disabled={!canEdit}
        label={`Have ${addOnText(addon).trim() || 'item'}`}
        onChange={(have) => update(addon.id, { have: have || undefined })}
        className="items-center"
      />
      <input
        value={addOnText(addon)}
        // (Written as one: an amount and unit kept apart by an older
        // version are taken into its words.)
        onChange={(e) =>
          update(addon.id, {
            name: e.target.value,
            quantity: undefined,
            unit: undefined,
          })
        }
        readOnly={!canEdit}
        aria-label="Item"
        autoComplete="off"
        className={CELL}
      />
    </div>
  )
}

/** The empty line at the end: written on, it becomes an add-on. */
function SpareLine() {
  const add = useStore((s) => s.addAddOn)
  const [text, setText] = useState('')
  const fieldRef = useRef<HTMLInputElement>(null)
  const commit = () => {
    if (!text.trim()) return
    add({ name: text.trim() })
    setText('')
  }
  return (
    <div role="row" className={`${COLS} items-center border-b border-line-blue`}>
      <span />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        ref={fieldRef}
        // Return: it's added, and the line's ready for the next — one after
        // another. (The keyboard's key says "next", and the field keeps the
        // focus: "done", iOS would put the keyboard away.)
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          commit()
          fieldRef.current?.focus()
        }}
        onBlur={commit}
        placeholder="Add an item…"
        aria-label="New item"
        autoComplete="off"
        enterKeyHint="next"
        className={`${CELL} placeholder:text-pencil`}
      />
    </div>
  )
}
