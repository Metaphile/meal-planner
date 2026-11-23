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
  'h-[var(--cell-h,30px)] min-w-0 bg-transparent pt-0 pb-[4px] pr-1 leading-[var(--cell-lead,24px)] focus:bg-accent/15 focus:outline-none'

/**
 * Add-ons: things wanted that aren't from a recipe, jotted down by hand —
 * one per ruled line, just as it's said ("milk", "2 bags of ice"), edited
 * where it is. There's always an empty line at the end to write the next
 * one on; it's added once you press Enter or move off the line (with
 * something written on it).
 *
 * Each can be ticked once it's got. Ticked, it's done with: Clear selected (at
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
            'text-hand-lg [--cell-h:36px] [--cell-lead:30px]'
          : 'paper-card notepad rounded-t-md px-4 pt-3 pb-3 text-hand-sm'
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
      className={`${COLS} items-center border-b border-ruled-line`}
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
        // (Its box's middle on its words' small letters, as on the lines
        // above: its target, as tall as the field's line — set 1px down in
        // the field, centred in what its padding leaves — set on it and
        // moved down 0.145em of the writing. See `.struck`.)
        className="mt-[calc(1px+0.145*26px)] self-start"
      />
      <div className="relative min-w-0">
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
        className={`${CELL} block w-full`}
      />
      {/* Ticked: crossed off — a line drawn through its words (a field's
          writing can't be: drawn over it, on the same words laid out the
          same way, unseen). */}
      {addon.have && (
        <div
          aria-hidden
          className={`${CELL} pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-transparent`}
          style={{ '--strike': 'var(--color-pen)' } as React.CSSProperties}
        >
          {/* (Its line, centred as the field's is; the words on it.) */}
          <span>
            <span className="struck">{addOnText(addon)}</span>
          </span>
        </div>
      )}
      </div>
    </div>
  )
}

/** The empty line at the end: written on, it becomes an add-on. */
function SpareLine() {
  const add = useStore((s) => s.addAddOn)
  const [text, setText] = useState('')
  // Each item written on a field of its own (see Return, below).
  const [field, setField] = useState(0)
  const commit = () => {
    if (!text.trim()) return
    add({ name: text.trim() })
    setText('')
  }
  return (
    <div role="row" className={`${COLS} items-center border-b border-ruled-line`}>
      <span />
      <input
        key={field}
        // (A new field, on Return: written in straight away.)
        autoFocus={field > 0}
        value={text}
        onChange={(e) => setText(e.target.value)}
        // Return: it's added, and the line's ready for the next — one after
        // another. (The keyboard's key says "next", and the focus stays on
        // the line: "done", iOS would put the keyboard away.) The next is
        // written on a new field, not this one emptied: iOS decides on a
        // capital as a field's focused (or as it's typed in), so an emptied
        // field would start the next item in lowercase — every item should
        // start as the first did.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (!text.trim()) return
          commit()
          setField((n) => n + 1)
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
