import type { AggregatedIngredient } from '../data/aggregate'
import { haveKey, type AddOn, type Have } from '../data/types'
import { useStore } from '../store/store'

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Subtract selected: square the list with what's been used (cooked, the
 * shopping put away) — everything ticked on it, at once:
 * - a ticked add-on is taken off;
 * - a ticked line with no amount ("salt") is unticked;
 * - a ticked line with an amount: what's needed comes off what's on hand
 *   (not below none — it stays ticked, at what's left);
 * - a ticked line no wanted recipe calls for any more is unticked (and so
 *   goes from the list).
 * There while anything on the list is ticked.
 */
export function ReconcileButton({
  ingredients,
  canEdit,
}: {
  /** The list's lines: what the wanted recipes call for. */
  ingredients: AggregatedIngredient[]
  canEdit: boolean
}) {
  const haves = useStore((s) => s.haves)
  const addons = useStore((s) => s.addons)
  if (!canEdit || (haves.length === 0 && !addons.some((a) => a.have)))
    return null
  return (
    // (Printed, not written: it's a button. At the right, coloured as a
    // card's Save.)
    <div className="flex justify-end pt-3 font-sans">
      <button
        type="button"
        onClick={() => reconcile(ingredients)}
        className="rounded-full border border-kraft-edge bg-brand px-4 py-1.5 text-sm font-semibold leading-5 text-on-brand transition active:scale-95"
      >
        Subtract selected
      </button>
    </div>
  )
}

/** What reconciling does (see ReconcileButton), worked out: the lines to
 *  untick, the ticked lines' new amounts, and the add-ons to take off. */
export function reconciled(
  ingredients: AggregatedIngredient[],
  haves: Have[],
  addons: AddOn[],
) {
  const lines = new Map(
    ingredients.map((i) => [haveKey(i.name, i.unit), i] as const),
  )
  const untick: string[] = []
  const amounts: [string, number][] = []
  for (const have of haves) {
    const line = lines.get(have.id)
    // No wanted recipe calls for it, or no amount to count: unticked.
    if (!line || line.quantity === undefined) untick.push(have.id)
    // What's needed, used: off what's on hand (not below none).
    else
      amounts.push([
        have.id,
        Math.max(0, round(round(have.amount ?? 0) - round(line.quantity))),
      ])
  }
  const remove = addons.filter((a) => a.have).map((a) => a.id)
  return { untick, amounts, remove }
}

/** Reconcile the list (see ReconcileButton): `ingredients`, its lines. */
export function reconcile(ingredients: AggregatedIngredient[]) {
  const { haves, addons, setHave, setHaveAmount, removeAddOn } =
    useStore.getState()
  const r = reconciled(ingredients, haves, addons)
  for (const key of r.untick) setHave(key, false)
  for (const [key, n] of r.amounts) setHaveAmount(key, n)
  for (const id of r.remove) removeAddOn(id)
}
