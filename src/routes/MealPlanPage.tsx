import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore, type NewComponent } from '../store/store'
import { useRecipeMap } from '../store/selectors'
import { useAuth } from '../auth/AuthProvider'
import { useSwipeToRemove } from '../lib/useSwipeToRemove'
import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  TextInput,
} from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import type { Ingredient, MealComponent, PlanMeal, Recipe } from '../data/types'
import { newId } from '../lib/id'

// Meals reorder chronologically; lock the drag to the vertical axis.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
})

export default function MealPlanPage() {
  const plan = useStore((s) => s.plan)
  const recipeMap = useRecipeMap()
  const addEmptyMeal = useStore((s) => s.addEmptyMeal)
  const reorderPlan = useStore((s) => s.reorderPlan)
  const { hasCapability } = useAuth()
  const canEdit = hasCapability('edit_plan')

  const ordered = useMemo(
    () => [...plan].sort((a, b) => a.position - b.position),
    [plan],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = ordered.map((m) => m.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from !== -1 && to !== -1) reorderPlan(arrayMove(ids, from, to))
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Meals"
        action={
          canEdit ? (
            <button
              onClick={addEmptyMeal}
              className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand active:scale-95"
            >
              + Meal
            </button>
          ) : undefined
        }
      />

      {ordered.length === 0 ? (
        <EmptyState
          title="Your plan is empty"
          hint={
            canEdit
              ? 'Tap “+ Meal” to start one, or add a recipe straight from the Recipes tab.'
              : 'No meals are planned yet.'
          }
          action={
            <Link
              to="/recipes"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium"
            >
              Browse recipes
            </Link>
          }
        />
      ) : (
        <div className="scroll-y flex-1 px-4 py-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-3">
                {ordered.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    recipeMap={recipeMap}
                    canEdit={canEdit}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {/* Ingredients, consolidated below the plan for an at-a-glance view. */}
          <div className="mt-6 mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Ingredients
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <IngredientsList />
        </div>
      )}
    </div>
  )
}

function MealCard({
  meal,
  recipeMap,
  canEdit,
}: {
  meal: PlanMeal
  recipeMap: Map<string, Recipe>
  canEdit: boolean
}) {
  const removePlanMeal = useStore((s) => s.removePlanMeal)
  const togglePlanInclude = useStore((s) => s.togglePlanInclude)
  const removeComponent = useStore((s) => s.removeComponent)
  const [adding, setAdding] = useState(false)

  const { ref: swipeRef, handlers } = useSwipeToRemove<HTMLDivElement>(() =>
    removePlanMeal(meal.id),
  )
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: meal.id })

  return (
    <li
      ref={setNodeRef}
      style={{
        // Translate only — Transform.toString would add scaleX/scaleY to fit
        // the swapped slot, squishing/stretching variable-height meal cards.
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={isDragging ? 'opacity-80' : undefined}
    >
      <div className="relative overflow-hidden rounded-xl">
        <div
          ref={canEdit ? swipeRef : undefined}
          {...(canEdit ? handlers : {})}
          style={{ touchAction: 'pan-y' }}
          className="peer relative z-10 rounded-xl border border-border bg-surface"
        >
          {/* Meal header: drag handle · count · + · include toggle */}
          <div className="flex items-center gap-2 px-3 py-2">
            {canEdit && (
              <button
                {...attributes}
                {...listeners}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  listeners?.onPointerDown?.(e)
                }}
                aria-label="Drag meal to reorder"
                className="-my-1 grid h-10 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <circle cx="9" cy="6" r="1.6" />
                  <circle cx="15" cy="6" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" />
                  <circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="18" r="1.6" />
                  <circle cx="15" cy="18" r="1.6" />
                </svg>
              </button>
            )}

            <span className="flex-1" />

            {canEdit && (
              <button
                onClick={() => setAdding(true)}
                className="h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-sm font-semibold text-brand active:scale-95"
              >
                Add
              </button>
            )}
            <IncludeToggle
              on={meal.includeInIngredients}
              disabled={!canEdit}
              onToggle={() => togglePlanInclude(meal.id)}
            />
          </div>

          {/* Components — a plain list; order isn't meaningful */}
          {meal.components.length > 0 && (
            <div className="px-3 pb-3">
              <ul className="flex flex-col gap-1.5">
                {meal.components.map((component) => (
                  <ComponentRow
                    key={component.id}
                    component={component}
                    recipeMap={recipeMap}
                    canEdit={canEdit}
                    onRemove={() => removeComponent(meal.id, component.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* Revealed behind the card as it's swiped right. Hidden otherwise so
            its red can't fringe the card's rounded corners. */}
        <div
          aria-hidden
          className="pointer-events-none invisible absolute inset-0 z-0 flex items-center rounded-xl bg-danger pl-5 text-lg text-white peer-data-swiping:visible"
        >
          Remove
        </div>
      </div>

      {adding && (
        <AddToMealSheet mealId={meal.id} onClose={() => setAdding(false)} />
      )}
    </li>
  )
}

function ComponentRow({
  component,
  recipeMap,
  canEdit,
  onRemove,
}: {
  component: MealComponent
  recipeMap: Map<string, Recipe>
  canEdit: boolean
  onRemove: () => void
}) {
  return (
    <li
      // Stop a press here from arming the meal's swipe-to-remove.
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2"
    >
      <span className="min-w-0 flex-1 truncate text-sm">
        {componentLabel(component, recipeMap)}
      </span>
      {canEdit && (
        <button
          onClick={onRemove}
          aria-label="Remove item"
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted active:scale-95"
        >
          ✕
        </button>
      )}
    </li>
  )
}

function componentLabel(
  component: MealComponent,
  recipeMap: Map<string, Recipe>,
): string {
  if (component.kind === 'recipe') {
    return recipeMap.get(component.recipeId)?.title ?? '(deleted recipe)'
  }
  return itemLabel(component)
}

function itemLabel(item: Ingredient): string {
  const amount = formatItemAmount(item.quantity, item.unit)
  return amount ? `${item.name} · ${amount}` : item.name
}

function formatItemAmount(quantity?: number, unit?: string): string {
  if (quantity === undefined) return unit ?? ''
  return unit ? `${quantity} ${unit}` : String(quantity)
}

function IncludeToggle({
  on,
  onToggle,
  disabled = false,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      aria-label="Include in ingredients"
      onClick={disabled ? undefined : onToggle}
      className={`-my-2 grid h-11 w-12 shrink-0 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        disabled ? 'cursor-default opacity-60' : ''
      }`}
    >
      <span
        className={`relative h-7 w-12 rounded-full transition-colors duration-200 ease-out ${
          on ? 'bg-brand' : 'bg-surface-2'
        }`}
      >
        <span
          className="absolute left-0 top-0.5 h-6 w-6 rounded-full bg-bg shadow-sm transition-transform duration-200 ease-out"
          style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }}
        />
      </span>
    </button>
  )
}

/** A full-width on/off row used for both recipes and misc items in the sheet. */
function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-pressed={on}
      onClick={onToggle}
      className={`flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition active:scale-[0.99] ${
        on ? 'border-brand bg-surface-2 text-brand' : 'border-border bg-bg'
      }`}
    >
      <span className="truncate">{label}</span>
      <span
        aria-hidden
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
          on ? 'border-brand bg-brand text-white' : 'border-border bg-bg'
        }`}
      >
        {on && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
    </button>
  )
}

interface StagedItem {
  key: string
  item: Ingredient
  on: boolean
}

/**
 * Stages recipes and misc items as toggles; nothing touches the meal until
 * Done, which commits everything toggled on in a single write. Tapping the
 * backdrop discards the selection.
 */
function AddToMealSheet({
  mealId,
  onClose,
}: {
  mealId: string
  onClose: () => void
}) {
  const recipes = useStore((s) => s.recipes)
  const addComponentsToMeal = useStore((s) => s.addComponentsToMeal)
  const [query, setQuery] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemUnit, setItemUnit] = useState('')
  const [miscItems, setMiscItems] = useState<StagedItem[]>([])
  const [pickedRecipes, setPickedRecipes] = useState<string[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [recipes, query])

  const stagedCount =
    pickedRecipes.length + miscItems.filter((m) => m.on).length

  const stageItem = () => {
    const name = itemName.trim()
    if (!name) return
    const qty = itemQty.trim()
    const item: Ingredient = {
      name,
      quantity: qty === '' ? undefined : Number(qty),
      unit: itemUnit.trim() || undefined,
    }
    setMiscItems((items) => [...items, { key: newId(), item, on: true }])
    setItemName('')
    setItemQty('')
    setItemUnit('')
  }

  const toggleItem = (key: string) =>
    setMiscItems((items) =>
      items.map((m) => (m.key === key ? { ...m, on: !m.on } : m)),
    )

  const toggleRecipe = (id: string) =>
    setPickedRecipes((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    )

  const done = () => {
    const additions: NewComponent[] = [
      ...pickedRecipes.map((recipeId) => ({
        kind: 'recipe' as const,
        recipeId,
      })),
      ...miscItems
        .filter((m) => m.on)
        .map((m) => ({ kind: 'item' as const, ...m.item })),
    ]
    addComponentsToMeal(mealId, additions)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80%] flex-col rounded-t-2xl border-t border-border bg-surface"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-base font-semibold">Add to meal</h2>
          <button
            onClick={done}
            className={`text-sm ${stagedCount > 0 ? 'font-semibold text-brand' : 'text-muted'}`}
          >
            Done
          </button>
        </div>

        {/* Misc items: the form stages an item as a toggle (on by default) */}
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Misc item
          </div>
          <div className="flex items-center gap-2">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && stageItem()}
              placeholder="e.g. Steamed broccoli"
              aria-label="Item name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 focus:border-brand focus:outline-none"
            />
            <input
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
              inputMode="decimal"
              placeholder="Qty"
              aria-label="Quantity"
              className="w-14 rounded-lg border border-border bg-bg px-2 py-2 text-center focus:border-brand focus:outline-none"
            />
            <input
              value={itemUnit}
              onChange={(e) => setItemUnit(e.target.value)}
              placeholder="Unit"
              aria-label="Unit"
              className="w-16 rounded-lg border border-border bg-bg px-2 py-2 focus:border-brand focus:outline-none"
            />
            <PrimaryButton onClick={stageItem} disabled={!itemName.trim()}>
              Add
            </PrimaryButton>
          </div>
          {miscItems.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {miscItems.map((m) => (
                <ToggleRow
                  key={m.key}
                  label={itemLabel(m.item)}
                  on={m.on}
                  onToggle={() => toggleItem(m.key)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recipes */}
        <div className="px-4 pt-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Recipes
          </div>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            inputMode="search"
            aria-label="Search recipes"
          />
        </div>
        <div className="scroll-y flex flex-col gap-2 px-4 py-3">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              No recipes match.
            </p>
          ) : (
            filtered.map((r) => (
              <ToggleRow
                key={r.id}
                label={r.title}
                on={pickedRecipes.includes(r.id)}
                onToggle={() => toggleRecipe(r.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
