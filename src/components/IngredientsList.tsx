import { useMemo, type ReactNode } from 'react'
import type { AggregatedIngredient } from '../data/aggregate'
import { haveKey, type Have } from '../data/types'
import { useStore } from '../store/store'
import { Amount, Unit } from './Unit'
import { OneLine } from './OneLine'

/**
 * Read-only aggregated ingredients, with each line tagged by its sources —
 * the recipes that call for it and/or standalone items by their own name.
 * The lines come from a memoized selector.
 *
 * With `checkable`, each line has a box to tick when it's on hand. Ticking
 * it takes it you have just what's needed (its name crossed off, its
 * amount as it was: "3 cup"). Needed more since (a recipe wanted more times
 * over, say), it's short: in red, its box –, saying how much of it there
 * is ("3 of 4 cup") — to be looked at again, and a tap
 * confirms there's enough (ticked at what's needed now). Ticked, a tap
 * unticks it.
 */
export function IngredientsList({
  ingredients,
  empty,
  checkable = false,
  canEdit = false,
  bare = false,
}: {
  ingredients: AggregatedIngredient[]
  /** What it says with nothing on it. */
  empty: ReactNode
  checkable?: boolean
  /** May tick lines and change how much is on hand. */
  canEdit?: boolean
  /** Written by hand straight on what it's on (a card, as on its back —
   *  scratch work), not typed on a sheet of its own. */
  bare?: boolean
}) {
  const haves = useStore((s) => s.haves)
  const byKey = new Map(haves.map((h) => [h.id, h]))
  // Ticked lines no wanted recipe calls for (any more) stay on the list:
  // what's on hand is still worth knowing. In among the rest, by name.
  const lines = useMemo(() => {
    if (!checkable) return ingredients
    const listed = new Set(ingredients.map((i) => haveKey(i.name, i.unit)))
    const extra: AggregatedIngredient[] = haves
      .filter((h) => !listed.has(h.id))
      .map((h) => ({ ...lineOf(h), sources: [] }))
    if (extra.length === 0) return ingredients
    return [...ingredients, ...extra].sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.unit ?? '').localeCompare(b.unit ?? ''),
    )
  }, [ingredients, haves, checkable])

  return (
    // A notepad sheet: each ingredient on a ruled line, where it's from below.
    <div
      className={bare ? '' : 'paper-card notepad rounded-t-md px-4 pt-2.5 pb-3'}
    >
      {lines.length === 0 ? (
        <p
          className={
            bare
              ? 'py-2 text-[24px] leading-[28px] text-pencil'
              : 'paper-serif py-3 text-center italic text-ink-faint'
          }
        >
          {empty}
        </p>
      ) : (
        <ul>
          {lines.map((ing) => {
            const key = haveKey(ing.name, ing.unit)
            return (
              <IngredientLine
                key={key}
                ing={ing}
                haveKey={key}
                have={checkable ? byKey.get(key) : undefined}
                needed={ing.sources.length > 0 || !checkable}
                checkable={checkable}
                canEdit={canEdit}
                hand={bare}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}

function IngredientLine({
  ing,
  haveKey: key,
  have,
  needed,
  checkable,
  canEdit,
  hand,
}: {
  ing: AggregatedIngredient
  haveKey: string
  have: Have | undefined
  /** Some wanted recipe calls for it (else it's here only as ticked). */
  needed: boolean
  checkable: boolean
  canEdit: boolean
  /** Written by hand (see IngredientsList's `bare`). */
  hand: boolean
}) {
  const setHave = useStore((s) => s.setHave)
  // Typed, or written by hand: its name, its amount, where it's from.
  const type = hand
    ? {
        line: '',
        name: 'text-[26px] leading-[30px]',
        amount: 'text-[23px] leading-[30px]',
        soft: '',
        from: 'text-[18px] leading-[20px] text-pencil',
      }
    : {
        line: 'paper-serif',
        name: 'text-[17px]',
        amount: 'text-base',
        soft: 'text-ink-soft',
        from: 'text-xs italic leading-[18px] text-ink-faint',
      }
  const need = ing.quantity === undefined ? undefined : round(ing.quantity)
  // Ticked at less than's needed now (needed more since): short.
  const short =
    !!have && need !== undefined && round(have.amount ?? 0) < need
  // Ticked, with an amount of its own to tell: short of what's needed, or
  // on hand by itself. (Enough, it says only what's needed, as unticked:
  // "6", not "6 of 6" — nor "8 of 6".)
  const counted = !!have && (needed ? short : have.amount !== undefined)
  const line = { name: ing.name, unit: ing.unit }
  // Ticked (enough on hand): its name crossed off — by hand (see
  // `.struck`), or typed, struck through. Not its amount: how much there is
  // stays easy to read. (Not short: that's still to see to.)
  const struck =
    checkable && !!have && !short ? (hand ? 'struck' : 'line-through') : ''
  return (
    <li
      className={`${type.line} flex ${hand ? 'gap-1' : 'gap-2.5'} border-b border-ruled-line pt-1.5 pb-1 last:border-b-0`}
    >
      {checkable && (
        <Tickbox
          state={!have ? 'off' : short ? 'short' : 'on'}
          disabled={!canEdit}
          label={`Have ${ing.name}`}
          // By hand: its box's middle on its name's small letters' (see
          // `.struck`) — its target, as tall as the name's line, set on it
          // and moved down 0.145em of the name.
          className={hand ? 'mt-[calc(0.145*26px)] self-start' : undefined}
          // Empty: ticked (enough). Short: enough after all (ticked at
          // what's needed now). Ticked: unticked.
          onChange={() =>
            short
              ? setHave(key, true, need, line)
              : setHave(key, !have, need, line)
          }
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {/* (Short of what's needed: the name in red too. Too long to fit
              beside its amount: cut off and feathered, swiped to read, like
              a card's title.) */}
          {/* (Ticked, but no wanted recipe calls for it: its name and words
              dimmed — on hand, not needed. Not its box: still to use.) */}
          <span
            className={`min-w-0 flex-1 ${type.name} ${short ? 'text-danger' : ''} ${
              needed ? '' : 'opacity-50'
            }`}
          >
            <OneLine text={ing.name} centred={false} textClass={struck} />
          </span>
          {counted ? (
            // Short: how much there is, of how much is needed — "3 of 4
            // cup". (Or, nothing calling for it, how much there is: "3
            // cup".)
            <span
              className={`shrink-0 whitespace-nowrap ${type.amount} ${
                short ? 'text-danger' : type.soft
              } ${needed ? '' : 'opacity-50'}`}
            >
              {round(have.amount ?? 0)}
              {needed && need !== undefined ? ` of ${need}` : ''}
              {ing.unit && ' '}
              <Unit>{ing.unit}</Unit>
            </span>
          ) : (
            <span
              className={`shrink-0 whitespace-nowrap ${type.amount} ${type.soft} ${
                needed ? '' : 'opacity-50'
              }`}
            >
              {needed ? (
                <Amount
                  quantity={
                    ing.quantity === undefined ? undefined : round(ing.quantity)
                  }
                  unit={ing.unit}
                />
              ) : (
                <Unit>{ing.unit}</Unit>
              )}
            </span>
          )}
        </div>
        {(ing.sources.length > 0 || !needed) && (
          <div
            className={`${type.from} ${
              needed ? '' : 'opacity-50'
            }`}
          >
            {/* (Ticked, but no wanted recipe calls for it.) */}
            {needed ? ing.sources.join(', ') : '[no recipe]'}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * The box to tick (as on the recipe cards), in three states: empty (not on
 * hand), ✓ (enough), or – in red (ticked, but short of what's needed now).
 * A tap calls `onChange` with whether it'd be ticked (what a tap does with
 * a short one is its line's to say: see IngredientLine).
 */
export function Tickbox({
  state,
  disabled,
  label,
  onChange,
  className = '-my-1 items-start pt-[7px]',
}: {
  state: 'off' | 'on' | 'short'
  disabled: boolean
  label: string
  onChange: (checked: boolean) => void
  /** Where the box sits in its target (level with a line's name). */
  className?: string
}) {
  const checked = state !== 'off'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'short' ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // A generous target around the small box, level with the name. (Not
      // to be ticked here — a reader: faded, still showing its state.)
      className={`-ml-1.5 flex shrink-0 p-1.5 disabled:cursor-default disabled:opacity-55 ${className}`}
    >
      <span
        className={`grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] ${
          state === 'on'
            ? 'border-accent-edge bg-accent text-accent-ink'
            : state === 'short'
              ? 'border-danger bg-danger text-on-danger'
              : 'border-ink-faint bg-paper'
        }`}
      >
        {checked && (
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={state === 'short' ? 'M3 6h6' : 'M2.5 6.2 5 8.5l4.5-5'} />
          </svg>
        )}
      </span>
    </button>
  )
}

/** A ticked line by itself: as written when ticked, or (older rows) from
 *  its key, capitalized. */
function lineOf(h: Have): { name: string; unit?: string; quantity?: number } {
  if (h.name !== undefined) return { name: h.name, unit: h.unit || undefined }
  const [name, unit] = h.id.split('|')
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    unit: unit || undefined,
  }
}

const round = (n: number) => Math.round(n * 100) / 100
