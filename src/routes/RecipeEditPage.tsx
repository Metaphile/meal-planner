import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/store'
import { useAuth } from '../auth/AuthProvider'
import { newId } from '../lib/id'
import { IngredientRowsEditor } from '../components/IngredientRowsEditor'
import {
  GhostButton,
  PageHeader,
  PrimaryButton,
  Tag,
  TextInput,
} from '../components/ui'
import type { Ingredient, Recipe } from '../data/types'

export default function RecipeEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasCapability } = useAuth()
  const canEdit = hasCapability('edit_recipes')
  const existing = useStore((s) =>
    id ? s.recipes.find((r) => r.id === id) : undefined,
  )
  const upsertRecipe = useStore((s) => s.upsertRecipe)
  const deleteRecipe = useStore((s) => s.deleteRecipe)

  // Members without edit_recipes get a read-only view (or bounce from /new).
  if (!canEdit) {
    if (!existing) return <Navigate to="/recipes" replace />
    return <RecipeView recipe={existing} onBack={() => navigate(-1)} />
  }

  // Local form state — committed to the store only on save.
  const [title, setTitle] = useState(existing?.title ?? '')
  const [tagsText, setTagsText] = useState((existing?.tags ?? []).join(', '))
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    existing?.ingredients ?? [{ name: '' }],
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')

  const canSave = title.trim().length > 0

  const save = () => {
    const cleaned = ingredients
      .map((i) => ({ ...i, name: i.name.trim() }))
      .filter((i) => i.name.length > 0)
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    upsertRecipe({
      id: existing?.id ?? newId(),
      title: title.trim(),
      tags,
      ingredients: cleaned,
      notes: notes.trim() || undefined,
    })
    navigate('/recipes')
  }

  const remove = () => {
    if (existing) deleteRecipe(existing.id)
    navigate('/recipes')
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={existing ? 'Edit recipe' : 'New recipe'}
        action={<GhostButton onClick={() => navigate(-1)}>Cancel</GhostButton>}
      />

      <div className="scroll-y flex-1 space-y-5 px-4 py-4">
        <Field label="Title">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Buttermilk Pancakes"
            autoFocus={!existing}
          />
        </Field>

        <Field label="Tags" hint="Comma-separated (e.g. breakfast, vegetarian)">
          <TextInput
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="breakfast, kid-friendly"
          />
        </Field>

        <Field label="Ingredients">
          <IngredientRowsEditor rows={ingredients} onChange={setIngredients} />
        </Field>

        <Field label="Notes" hint="Optional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            placeholder="Prep tips, substitutions…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 focus:border-brand focus:outline-none"
          />
        </Field>

        {existing && (
          <button
            onClick={remove}
            className="text-sm font-medium text-danger active:scale-95"
          >
            Delete recipe
          </button>
        )}
      </div>

      <div
        className="border-t border-border bg-surface px-4 py-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
      >
        <PrimaryButton
          onClick={save}
          disabled={!canSave}
          className="w-full"
        >
          {existing ? 'Save changes' : 'Add recipe'}
        </PrimaryButton>
      </div>
    </div>
  )
}

function RecipeView({
  recipe,
  onBack,
}: {
  recipe: Recipe
  onBack: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={recipe.title}
        action={<GhostButton onClick={onBack}>Back</GhostButton>}
      />
      <div className="scroll-y flex-1 space-y-5 px-4 py-4">
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
        <div>
          <div className="mb-1.5 text-sm font-medium">Ingredients</div>
          <ul className="overflow-hidden rounded-xl border border-border">
            {recipe.ingredients.map((ing, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between border-b border-border bg-surface px-4 py-2.5 last:border-b-0"
              >
                <span>{ing.name}</span>
                <span className="text-sm text-muted">
                  {ing.quantity !== undefined
                    ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}`
                    : (ing.unit ?? '')}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {recipe.notes && (
          <div>
            <div className="mb-1.5 text-sm font-medium">Notes</div>
            <p className="whitespace-pre-wrap text-sm text-muted">
              {recipe.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-text">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
