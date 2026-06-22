import { useAggregatedIngredients, useIncludedCount } from '../store/selectors'
import { Tag } from './ui'

/**
 * Read-only aggregated ingredients, with each line tagged by its sources —
 * the recipes that call for it and/or standalone items by their own name.
 * Presentational — pulls straight from the memoized selector.
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
              {ing.sources.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ing.sources.map((source) => (
                    <Tag key={source}>{source}</Tag>
                  ))}
                </div>
              )}
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
