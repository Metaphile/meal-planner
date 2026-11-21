import type { ReactNode } from 'react'
import type { AggregatedIngredient } from '../data/aggregate'

/**
 * Read-only aggregated ingredients, with each line tagged by its sources —
 * the recipes that call for it and/or standalone items by their own name.
 * Presentational: the lines come from a memoized selector.
 */
export function IngredientsList({
  ingredients,
  empty,
}: {
  ingredients: AggregatedIngredient[]
  /** What it says with nothing on it. */
  empty: ReactNode
}) {
  return (
    // A notepad sheet: each ingredient on a ruled line, where it's from below.
    <div className="paper-card notepad rounded-t-md px-4 pt-2.5 pb-3">
      {ingredients.length === 0 ? (
        <p className="paper-serif py-3 text-center italic text-ink-faint">
          {empty}
        </p>
      ) : (
        <ul>
          {ingredients.map((ing) => (
            <li
              key={`${ing.name}|${ing.unit ?? ''}`}
              className="paper-serif border-b border-line-blue pt-1.5 pb-1 last:border-b-0"
            >
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatAmount(quantity?: number, unit?: string): string {
  if (quantity === undefined) return unit ?? ''
  // Trim float noise (e.g. 0.1+0.2) without forcing decimals on whole numbers.
  const rounded = Math.round(quantity * 100) / 100
  return unit ? `${rounded} ${unit}` : String(rounded)
}
