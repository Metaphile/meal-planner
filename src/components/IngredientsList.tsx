import { useAggregatedIngredients, useIncludedCount } from '../store/selectors'
import { Tag } from './ui'

/**
 * Read-only aggregated ingredients, with each line tagged by the meals that
 * contribute to it. Presentational — pulls straight from the memoized selector
 * so it can be dropped into the Plan view (or a standalone page).
 */
export function IngredientsList() {
  const ingredients = useAggregatedIngredients()
  const includedCount = useIncludedCount()

  if (ingredients.length === 0) {
    return (
      <p className="text-sm text-muted">
        Toggle a meal above to see what you’ll need.
      </p>
    )
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted">
        Aggregated from {includedCount} included meal
        {includedCount === 1 ? '' : 's'}. This is a reference list — not a
        shopping list or inventory.
      </p>
      <ul className="overflow-hidden rounded-xl border border-border">
        {ingredients.map((ing) => (
          <li
            key={`${ing.name}|${ing.unit ?? ''}`}
            className="flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="text-text">{ing.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ing.meals.map((meal) => (
                  <Tag key={meal}>{meal}</Tag>
                ))}
              </div>
            </div>
            <span className="shrink-0 text-sm text-muted">
              {formatAmount(ing.quantity, ing.unit)}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function formatAmount(quantity?: number, unit?: string): string {
  if (quantity === undefined) return unit ?? ''
  // Trim float noise (e.g. 0.1+0.2) without forcing decimals on whole numbers.
  const rounded = Math.round(quantity * 100) / 100
  return unit ? `${rounded} ${unit}` : String(rounded)
}
