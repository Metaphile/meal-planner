import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store/store'
import { useRecipeMap } from '../store/selectors'
import { EmptyState, PageHeader, Tag } from '../components/ui'
import type { Meal, Recipe } from '../data/types'

export default function MealsPage() {
  const meals = useStore((s) => s.meals)
  const recipeMap = useRecipeMap()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Meals"
        action={
          <Link
            to="/meals/new"
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-bg active:scale-95"
          >
            + New
          </Link>
        }
      />

      {meals.length === 0 ? (
        <EmptyState
          title="No meals yet"
          hint="A meal combines recipes and simple items — like pancakes + bacon."
        />
      ) : (
        <div className="scroll-y flex-1 space-y-2 px-4 py-3">
          {meals.map((meal) => (
            <button
              key={meal.id}
              onClick={() => navigate(`/meals/${meal.id}`)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left transition active:scale-[0.99]"
            >
              <div className="font-medium">{meal.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {meal.components.map((c, i) => (
                  <Tag key={i}>{componentLabel(c, recipeMap)}</Tag>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function componentLabel(
  c: Meal['components'][number],
  recipeMap: Map<string, Recipe>,
): string {
  if (c.kind === 'recipe') {
    return recipeMap.get(c.recipeId)?.title ?? '(deleted recipe)'
  }
  return c.name || '(item)'
}
