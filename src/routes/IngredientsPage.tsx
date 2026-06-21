import { useAggregatedIngredients, useIncludedCount } from '../store/selectors'
import { EmptyState, PageHeader, Tag } from '../components/ui'

export default function IngredientsPage() {
  const ingredients = useAggregatedIngredients()
  const includedCount = useIncludedCount()

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ingredients" />

      {ingredients.length === 0 ? (
        <EmptyState
          title="Nothing to gather yet"
          hint="Ingredients appear here automatically from the meals you’ve included in your plan."
        />
      ) : (
        <div className="scroll-y flex-1 px-4 py-3">
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
        </div>
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
