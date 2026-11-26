import type { AddOn, Have } from '../data/types'
import { useStore } from '../store/store'

/**
 * Remove selected (was Clear selected): done with what's ticked on the
 * list (the shopping put away, say) — at once:
 * - a ticked add-on is taken off;
 * - every ticked line is unticked (and one no wanted recipe calls for any
 *   more goes from the list with it). One kept on the list unticked (see
 *   Have's `off`) stays.
 * There while anything on the list is ticked.
 */
export function ClearSelectedButton({ canEdit }: { canEdit: boolean }) {
  const haves = useStore((s) => s.haves)
  const addons = useStore((s) => s.addons)
  if (!canEdit || (!haves.some(ticked) && !addons.some((a) => a.have)))
    return null
  return (
    // (Printed, not written: it's a button. At the right, coloured as a
    // card's Save.)
    <div className="paper-serif flex justify-end pt-3">
      <button
        type="button"
        onClick={clearSelected}
        className="rounded-full border border-accent-edge bg-accent px-4 py-1.5 text-sm font-semibold leading-5 text-accent-ink transition active:scale-95"
      >
        Remove selected
      </button>
    </div>
  )
}

/** What clearing does (see ClearSelectedButton), worked out: the lines to
 *  untick, and the add-ons to take off. */
export function cleared(haves: Have[], addons: AddOn[]) {
  return {
    untick: haves.filter(ticked).map((h) => h.id),
    remove: addons.filter((a) => a.have).map((a) => a.id),
  }
}

const ticked = (h: Have) => !h.off

/** Clear what's ticked on the list (see ClearSelectedButton). */
export function clearSelected() {
  const { haves, addons, setHave, removeAddOn } = useStore.getState()
  const c = cleared(haves, addons)
  for (const key of c.untick) setHave(key, false)
  for (const id of c.remove) removeAddOn(id)
}
