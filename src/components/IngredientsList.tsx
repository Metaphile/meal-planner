import { useState, type ReactNode } from 'react'
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

  return (
    // A notepad sheet: each ingredient on a ruled line, where it's from below.
    <div className="paper-card notepad rounded-t-md px-4 pt-2.5 pb-3">
      {ingredients.length === 0 ? (
        <p className="paper-serif py-3 text-center italic text-ink-faint">
          {empty}
        </p>
      ) : (
        <ul>
          {ingredients.map((ing) => {
            const key = haveKey(ing.name, ing.unit)
            return (
              <IngredientLine
                key={key}
                ing={ing}
                haveKey={key}
                have={checkable ? byKey.get(key) : undefined}
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
  checkable,
  canEdit,
}: {
  ing: AggregatedIngredient
  haveKey: string
  have: Have | undefined
  checkable: boolean
  canEdit: boolean
}) {
  const setHave = useStore((s) => s.setHave)
  const need = ing.quantity === undefined ? undefined : round(ing.quantity)
  // Have some but not enough: short.
  const short =
    !!have && need !== undefined && round(have.amount ?? 0) < need
  return (
    <li className="paper-serif flex gap-2.5 border-b border-line-blue pt-1.5 pb-1 last:border-b-0">
      {checkable && (
        <Tickbox
          state={!have ? 'off' : short ? 'short' : 'on'}
          disabled={!canEdit}
          label={`Have ${ing.name}`}
          onChange={(on) => setHave(key, on, need)}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[17px]">{ing.name}</span>
          <span className="shrink-0 text-base text-ink-soft">
            {formatAmount(ing.quantity, ing.unit)}
          </span>
        </div>
        {ing.sources.length > 0 && (
          <div className="text-xs italic leading-[18px] text-ink-faint">
            {ing.sources.join(', ')}
          </div>
        )}
        {have && need !== undefined && (
          <HaveCounter
            haveKey={key}
            amount={have.amount ?? 0}
            need={need}
            unit={ing.unit}
            canEdit={canEdit}
          />
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
 * How much is on hand, against what's needed: − [have] of need +. The
 * number can be typed (decimals, or fractions like 1/2 or 1 1/2); − and +
 * go a whole unit at a time (not below 0). Short of what's needed, it shows
 * in red.
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
  need: number
  unit?: string
  canEdit: boolean
}) {
  const setHaveAmount = useStore((s) => s.setHaveAmount)
  // The text being typed (so "1." or "1 1/" survive until it's a number).
  const [draft, setDraft] = useState<string | null>(null)
  const short = amount < need
  const step =
    'grid h-7 w-8 place-items-center text-lg leading-none active:opacity-60 disabled:opacity-35'
  return (
    <div className="flex justify-end pt-1 pb-0.5">
      <div className="flex items-center rounded-full border border-kraft-edge bg-brand text-[15px] text-on-brand">
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
          // (What's typed while it's this amount; otherwise the amount, as
          // after − or +, or a change from elsewhere.)
          value={
            draft !== null && parseAmount(draft) === round(amount)
              ? draft
              : String(round(amount))
          }
          onChange={(e) => {
            setDraft(e.target.value)
            const n = parseAmount(e.target.value)
            if (n !== undefined) setHaveAmount(key, n)
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          readOnly={!canEdit}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label="How much you have"
          // (16px: no zooming in on iOS.)
          // (Short of what's needed: a faint red field, to draw the eye.)
          className={`h-7 w-12 rounded-md px-1.5 text-right text-[16px] font-semibold focus:outline-none ${
            short ? 'bg-danger/15 text-danger' : 'bg-paper/70'
          }`}
        />
        {/* (No unit: it's right above.) */}
        <span className="pr-1 pl-1.5 whitespace-nowrap">of {round(need)}</span>
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
    </div>
  )
}

const unitName = (unit?: string) => unit || 'of it'

const round = (n: number) => Math.round(n * 100) / 100

const FRACTIONS: Record<string, string> = {
  '½': ' 1/2',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '¼': ' 1/4',
  '¾': ' 3/4',
  '⅛': ' 1/8',
}

/** "1.5", "1/2", "1 1/2", "1½" → a number (undefined if it isn't one yet). */
export function parseAmount(text: string): number | undefined {
  const t = text.replace(/[½⅓⅔¼¾⅛]/g, (c) => FRACTIONS[c]).trim()
  const m = /^(\d*\.?\d*)?\s*(?:(\d+)\s*\/\s*(\d+))?$/.exec(t)
  if (!t || !m) return undefined
  const whole = m[1] ? Number(m[1]) : 0
  if (Number.isNaN(whole)) return undefined
  if (m[2] === undefined) return m[1] ? whole : undefined
  const den = Number(m[3])
  return den ? whole + Number(m[2]) / den : undefined
}

function formatAmount(quantity?: number, unit?: string): string {
  if (quantity === undefined) return unit ?? ''
  // Trim float noise (e.g. 0.1+0.2) without forcing decimals on whole numbers.
  const rounded = round(quantity)
  return unit ? `${rounded} ${unit}` : String(rounded)
}
