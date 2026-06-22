import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../store/store'
import { EmptyState, PageHeader, Tag, TextInput } from '../components/ui'
import type { Recipe } from '../data/types'

export default function RecipesPage() {
  const recipes = useStore((s) => s.recipes)
  const addRecipeToPlan = useStore((s) => s.addRecipeToPlan)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)

  // In-memory filter over title + tags — instant, no debounce needed.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [recipes, query])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
  })

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Recipes"
        action={
          <Link
            to="/recipes/new"
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand active:scale-95"
          >
            + New
          </Link>
        }
      />

      <div className="px-4 py-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title or tag…"
          inputMode="search"
          aria-label="Filter recipes"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={recipes.length === 0 ? 'No recipes yet' : 'No matches'}
          hint={
            recipes.length === 0
              ? 'Add your first recipe to start building meals.'
              : 'Try a different title or tag.'
          }
        />
      ) : (
        <div ref={scrollRef} className="scroll-y flex-1 px-4 pb-4">
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const recipe = filtered[vItem.index]
              return (
                <div
                  key={recipe.id}
                  ref={virtualizer.measureElement}
                  data-index={vItem.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                  }}
                  className="pb-2"
                >
                  <RecipeRow
                    recipe={recipe}
                    onEdit={() => navigate(`/recipes/${recipe.id}`)}
                    onAddToPlan={() => addRecipeToPlan(recipe.id)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function RecipeRow({
  recipe,
  onEdit,
  onAddToPlan,
}: {
  recipe: Recipe
  onEdit: () => void
  onAddToPlan: () => void
}) {
  const [added, setAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])

  const add = () => {
    onAddToPlan()
    setAdded(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 1400)
  }

  return (
    <div className="flex items-stretch gap-2 rounded-xl border border-border bg-surface">
      <button
        onClick={onEdit}
        className="min-w-0 flex-1 px-4 py-3 text-left transition active:scale-[0.99]"
      >
        <div className="truncate font-medium">{recipe.title}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted">
            {recipe.ingredients.length} ingredient
            {recipe.ingredients.length === 1 ? '' : 's'}
          </span>
          {recipe.tags.slice(0, 3).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      </button>
      <button
        onClick={add}
        aria-label={`Add ${recipe.title} to plan`}
        className={`my-2 mr-2 shrink-0 self-center rounded-full px-3 py-2 text-sm font-semibold transition active:scale-95 ${
          added ? 'bg-surface-2 text-brand' : 'bg-brand text-on-brand'
        }`}
      >
        {added ? 'Added ✓' : '+ Plan'}
      </button>
    </div>
  )
}
