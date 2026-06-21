import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/store'
import { newId } from '../lib/id'
import { IngredientRowsEditor } from '../components/IngredientRowsEditor'
import {
  GhostButton,
  PageHeader,
  PrimaryButton,
  TextInput,
} from '../components/ui'
import type { Ingredient, Meal } from '../data/types'

export default function MealEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recipes = useStore((s) => s.recipes)
  const existing = useStore((s) =>
    id ? s.meals.find((m) => m.id === id) : undefined,
  )
  const upsertMeal = useStore((s) => s.upsertMeal)
  const deleteMeal = useStore((s) => s.deleteMeal)

  const [name, setName] = useState(existing?.name ?? '')
  const [recipeIds, setRecipeIds] = useState<string[]>(
    () =>
      existing?.components
        .filter((c): c is { kind: 'recipe'; recipeId: string } => c.kind === 'recipe')
        .map((c) => c.recipeId) ?? [],
  )
  const [items, setItems] = useState<Ingredient[]>(
    () =>
      existing?.components
        .filter((c) => c.kind === 'item')
        .map(({ name: n, quantity, unit }) => ({ name: n, quantity, unit })) ??
      [],
  )
  const [picking, setPicking] = useState(false)

  const recipeById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  )
  const canSave =
    name.trim().length > 0 &&
    (recipeIds.length > 0 || items.some((i) => i.name.trim()))

  const toggleRecipe = (rid: string) =>
    setRecipeIds((ids) =>
      ids.includes(rid) ? ids.filter((x) => x !== rid) : [...ids, rid],
    )

  const save = () => {
    const components: Meal['components'] = [
      ...recipeIds.map((rid) => ({ kind: 'recipe' as const, recipeId: rid })),
      ...items
        .map((i) => ({ ...i, name: i.name.trim() }))
        .filter((i) => i.name.length > 0)
        .map((i) => ({ kind: 'item' as const, ...i })),
    ]
    upsertMeal({
      id: existing?.id ?? newId(),
      name: name.trim(),
      components,
    })
    navigate('/meals')
  }

  const remove = () => {
    if (existing) deleteMeal(existing.id)
    navigate('/meals')
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={existing ? 'Edit meal' : 'New meal'}
        action={<GhostButton onClick={() => navigate(-1)}>Cancel</GhostButton>}
      />

      <div className="scroll-y flex-1 space-y-5 px-4 py-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pancakes & Bacon"
            autoFocus={!existing}
          />
        </label>

        {/* Recipes ---------------------------------------------------------- */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Recipes</span>
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              className="text-sm text-brand active:scale-95"
            >
              {picking ? 'Done' : '+ Add recipe'}
            </button>
          </div>

          {recipeIds.length === 0 && !picking && (
            <p className="text-sm text-muted">No recipes added yet.</p>
          )}

          {!picking && recipeIds.length > 0 && (
            <div className="flex flex-col gap-2">
              {recipeIds.map((rid) => (
                <div
                  key={rid}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span>{recipeById.get(rid)?.title ?? '(deleted recipe)'}</span>
                  <button
                    type="button"
                    onClick={() => toggleRecipe(rid)}
                    aria-label="Remove recipe"
                    className="text-muted active:scale-95"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {picking && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2">
              {recipes.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted">
                  No recipes exist yet — create one first.
                </p>
              )}
              {recipes.map((r) => {
                const selected = recipeIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRecipe(r.id)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left transition active:scale-[0.99] ${
                      selected ? 'bg-brand-strong text-text' : 'bg-surface-2'
                    }`}
                  >
                    <span>{r.title}</span>
                    <span className="text-sm">{selected ? '✓' : '+'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Simple items ----------------------------------------------------- */}
        <section>
          <div className="mb-1.5">
            <span className="text-sm font-medium">Simple items</span>
            <p className="text-xs text-muted">
              Things with no recipe (e.g. bacon). They count toward the
              ingredients list.
            </p>
          </div>
          <IngredientRowsEditor
            rows={items}
            onChange={setItems}
            addLabel="+ Add item"
          />
        </section>

        {existing && (
          <button
            onClick={remove}
            className="text-sm font-medium text-danger active:scale-95"
          >
            Delete meal
          </button>
        )}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
      >
        <PrimaryButton onClick={save} disabled={!canSave} className="w-full">
          {existing ? 'Save changes' : 'Add meal'}
        </PrimaryButton>
      </div>
    </div>
  )
}
