import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { AggregatedIngredient } from '../data/aggregate'
import { haveKey, type Have } from '../data/types'
import { useStore } from '../store/store'

/**
 * Read-only aggregated ingredients, with each line tagged by its sources —
 * the recipes that call for it and/or standalone items by their own name.
 * The lines come from a memoized selector.
 *
 * With `checkable`, each line has a box to tick when it's on hand (– in red
 * when there's some, but short). Ticking it takes it you have just what's
 * needed ("3 of 3"); under a ticked line,
 * how much you have can be changed — typed (fractions too) or a whole unit
 * at a time. It stays put if what's needed changes later (untick and tick
 * again to match it).
 */
export function IngredientsList({
  ingredients,
  empty,
  checkable = false,
  canEdit = false,
}: {
  ingredients: AggregatedIngredient[]
  /** What it says with nothing on it. */
  empty: ReactNode
  checkable?: boolean
  /** May tick lines and change how much is on hand. */
  canEdit?: boolean
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
    <div className="paper-card notepad rounded-t-md px-4 pt-2.5 pb-3">
      {lines.length === 0 ? (
        <p className="paper-serif py-3 text-center italic text-ink-faint">
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
}: {
  ing: AggregatedIngredient
  haveKey: string
  have: Have | undefined
  /** Some wanted recipe calls for it (else it's here only as ticked). */
  needed: boolean
  checkable: boolean
  canEdit: boolean
}) {
  const setHave = useStore((s) => s.setHave)
  const need = ing.quantity === undefined ? undefined : round(ing.quantity)
  // Have some but not enough: short.
  const short =
    !!have && need !== undefined && round(have.amount ?? 0) < need
  // Ticked, with an amount to count (needed, or on hand by itself).
  const counted =
    !!have && (needed ? need !== undefined : have.amount !== undefined)
  return (
    <li className="paper-serif flex gap-2.5 border-b border-line-blue pt-1.5 pb-1 last:border-b-0">
      {checkable && (
        <Tickbox
          state={!have ? 'off' : short ? 'short' : 'on'}
          disabled={!canEdit}
          label={`Have ${ing.name}`}
          onChange={(on) =>
            setHave(key, on, need, { name: ing.name, unit: ing.unit })
          }
        />
      )}
      <div className="min-w-0 flex-1">
        {/* Ticked (with an amount to count), the counter takes the place of
            the quantity: "− [have] of need unit +", or without a recipe
            calling for it, "− [have] unit +". */}
        <div
          className={`flex justify-between gap-3 ${
            counted ? '-my-0.5 items-center' : 'items-baseline'
          }`}
        >
          {/* (Short of what's needed: the name in red too.) */}
          <span className={`text-[17px] ${short ? 'text-danger' : ''}`}>
            {ing.name}
          </span>
          {counted ? (
            <HaveCounter
              haveKey={key}
              amount={have.amount ?? 0}
              need={needed ? need : undefined}
              unit={ing.unit}
              canEdit={canEdit}
            />
          ) : (
            <span className="shrink-0 text-base text-ink-soft">
              {needed ? formatAmount(ing.quantity, ing.unit) : (ing.unit ?? '')}
            </span>
          )}
        </div>
        {(ing.sources.length > 0 || !needed) && (
          <div className="text-xs italic leading-[18px] text-ink-faint">
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
 * hand), ✓ (enough), or – in red (some, but short). Tapping an empty box
 * ticks it; tapping a ticked or short one unticks it.
 */
function Tickbox({
  state,
  disabled,
  label,
  onChange,
}: {
  state: 'off' | 'on' | 'short'
  disabled: boolean
  label: string
  onChange: (checked: boolean) => void
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
      // A generous target around the small box, level with the name.
      className="-my-1 -ml-1.5 flex shrink-0 items-start p-1.5 pt-[7px] disabled:cursor-default"
    >
      <span
        className={`grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] ${
          state === 'on'
            ? 'border-kraft-edge bg-kraft text-kraft-ink'
            : state === 'short'
              ? 'border-danger bg-danger text-white'
              : 'border-[#c9bda4] bg-paper'
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

/**
 * How much is on hand: − [have] of need unit + (or, nothing calling for it,
 * − [have] unit +), in place of the line's quantity. The
 * number can be typed (a plain decimal; cleared, it's 0, and shows 0 once
 * you leave it); − and + go a whole unit at a time (not below 0). Short of
 * what's needed, it shows in red.
 */
function HaveCounter({
  haveKey: key,
  amount,
  need,
  unit,
  canEdit,
}: {
  haveKey: string
  amount: number
  /** What's needed (none: nothing calls for it, so no "of"). */
  need?: number
  unit?: string
  canEdit: boolean
}) {
  const setHaveAmount = useStore((s) => s.setHaveAmount)
  // The text being typed (so "1." or an empty field survive while typing).
  const [draft, setDraft] = useState<string | null>(null)
  const justFocused = useRef(false)
  const short = need !== undefined && amount < need
  // What's typed while it's this amount; otherwise the amount (as after −
  // or +, or a change from elsewhere).
  const shown =
    draft !== null && parseAmount(draft) === round(amount)
      ? draft
      : String(round(amount))
  const step =
    'grid h-7 w-8 place-items-center text-lg leading-none active:opacity-60 disabled:opacity-35'
  return (
    <div className="flex shrink-0 items-center rounded-full border border-kraft-edge bg-brand text-[15px] text-on-brand">
      <button
        type="button"
        aria-label={`Less ${unitName(unit)}`}
        disabled={!canEdit || amount <= 0}
        onClick={() => setHaveAmount(key, Math.max(0, amount - 1))}
        className={step}
      >
        −
      </button>
      <input
        value={shown}
        // As wide as what's in it: digits a ch each (at least one), the
        // point narrower.
        style={{ width: `calc(${fieldWidth(shown)}ch + 12px)` }}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = parseAmount(e.target.value)
          if (n !== undefined) setHaveAmount(key, n)
        }}
        // Tapping in selects the whole number, to type over. (After the
        // tap settles: iOS places the caret after focus, undoing an
        // earlier selection; and the click that follows a focus mustn't
        // put the caret back.)
        onFocus={(e) => {
          const field = e.currentTarget
          justFocused.current = true
          setTimeout(() => field.setSelectionRange(0, field.value.length))
        }}
        onMouseUp={(e) => {
          if (justFocused.current) e.preventDefault()
          justFocused.current = false
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        readOnly={!canEdit}
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        aria-label="How much you have"
        // (16px: no zooming in on iOS.)
        // (Short of what's needed: a faint red field, to draw the eye — as
        // light as the usual one.)
        className={`h-7 rounded-md px-1.5 text-center text-[16px] font-semibold tabular-nums focus:outline-none ${
          short ? 'bg-[#f6e3e1] text-danger' : 'bg-paper/70'
        }`}
      />
      <span className="pr-0.5 pl-1.5 whitespace-nowrap">
        {need !== undefined ? `of ${round(need)}` : ''}
        {unit ? `${need !== undefined ? ' ' : ''}${unit}` : ''}
      </span>
      <button
        type="button"
        aria-label={`More ${unitName(unit)}`}
        disabled={!canEdit}
        onClick={() => setHaveAmount(key, amount + 1)}
        className={step}
      >
        +
      </button>
    </div>
  )
}

const unitName = (unit?: string) => unit || 'of it'

/** The have field's width for its text, in ch. */
const fieldWidth = (text: string) => {
  const points = (text.match(/\./g) ?? []).length
  return Math.max(1, text.length - points) + points * 0.65
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

/**
 * What's typed in the have field, as an amount: a plain decimal, not
 * negative ("2", "1.5", ".25", "3."). Empty is 0 (everything deleted), and
 * so is a lone "." (on the way to ".5"); leaving the field writes the
 * amount out in full ("0.5"). Anything else isn't an amount (undefined),
 * and isn't taken.
 */
export function parseAmount(text: string): number | undefined {
  const t = text.trim()
  if (t === '' || t === '.') return 0
  if (!/^\d*\.?\d*$/.test(t)) return undefined
  return Number(t)
}

function formatAmount(quantity?: number, unit?: string): string {
  if (quantity === undefined) return unit ?? ''
  // Trim float noise (e.g. 0.1+0.2) without forcing decimals on whole numbers.
  const rounded = round(quantity)
  return unit ? `${rounded} ${unit}` : String(rounded)
}
