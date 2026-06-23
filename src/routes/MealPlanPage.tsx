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
import { useStore } from '../store/store'
import { useRecipeMap } from '../store/selectors'
import { useSwipeToRemove } from '../lib/useSwipeToRemove'
import { EmptyState, PageHeader, PrimaryButton, TextInput } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import type { MealComponent, PlanMeal, Recipe } from '../data/types'

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
        title="Plan"
        action={
          <button
            onClick={addEmptyMeal}
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand active:scale-95"
          >
            + Meal
          </button>
        }
      />

      {ordered.length === 0 ? (
        <EmptyState
          title="Your plan is empty"
          hint="Tap “+ Meal” to start one, or add a recipe straight from the Recipes tab."
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
          <p className="mb-2 text-xs text-muted">
            Drag a meal’s handle to reorder · swipe a meal right to remove ·
            toggle the switch to include it below.
          </p>
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
                  <MealCard key={meal.id} meal={meal} recipeMap={recipeMap} />
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
}: {
  meal: PlanMeal
  recipeMap: Map<string, Recipe>
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
        <div className="pointer-events-none absolute inset-0 flex items-center pl-4 text-sm font-medium text-danger">
          Remove
        </div>
        <div
          ref={swipeRef}
          {...handlers}
          style={{ touchAction: 'pan-y' }}
          className="relative rounded-xl border border-border bg-surface"
        >
          {/* Meal header: drag handle · count · + · include toggle */}
          <div className="flex items-center gap-2 px-3 py-2">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.6" />
                <circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" />
                <circle cx="15" cy="18" r="1.6" />
              </svg>
            </button>

            <span className="flex-1 text-xs text-muted">
              {meal.components.length === 0
                ? 'Empty meal'
                : `${meal.components.length} item${meal.components.length === 1 ? '' : 's'}`}
            </span>

            <button
              onClick={() => setAdding(true)}
              aria-label="Add to meal"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-lg leading-none text-brand active:scale-95"
            >
              +
            </button>
            <IncludeToggle
              on={meal.includeInIngredients}
              onToggle={() => togglePlanInclude(meal.id)}
            />
          </div>

          {/* Components — a plain list; order isn't meaningful */}
          <div className="px-3 pb-3">
            {meal.components.length === 0 ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full rounded-lg border border-dashed border-border py-3 text-sm text-muted active:scale-[0.99]"
              >
                Add a recipe or item
              </button>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {meal.components.map((component) => (
                  <ComponentRow
                    key={component.id}
                    component={component}
                    recipeMap={recipeMap}
                    onRemove={() => removeComponent(meal.id, component.id)}
                  />
                ))}
              </ul>
            )}
          </div>
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
  onRemove,
}: {
  component: MealComponent
  recipeMap: Map<string, Recipe>
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
      <button
        onClick={onRemove}
        aria-label="Remove item"
        className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted active:scale-95"
      >
        ✕
      </button>
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
  const amount = formatItemAmount(component.quantity, component.unit)
  return amount ? `${component.name} · ${amount}` : component.name
}

function formatItemAmount(quantity?: number, unit?: string): string {
  if (quantity === undefined) return unit ?? ''
  return unit ? `${quantity} ${unit}` : String(quantity)
}

function IncludeToggle({
  on,
  onToggle,
}: {
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label="Include in ingredients"
      onClick={onToggle}
      className="-my-2 grid h-11 w-12 shrink-0 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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

function AddToMealSheet({
  mealId,
  onClose,
}: {
  mealId: string
  onClose: () => void
}) {
  const recipes = useStore((s) => s.recipes)
  const addRecipeToMeal = useStore((s) => s.addRecipeToMeal)
  const addItemToMeal = useStore((s) => s.addItemToMeal)
  const [query, setQuery] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemUnit, setItemUnit] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [recipes, query])

  const addItem = () => {
    const name = itemName.trim()
    if (!name) return
    const qty = itemQty.trim()
    addItemToMeal(mealId, {
      name,
      quantity: qty === '' ? undefined : Number(qty),
      unit: itemUnit.trim() || undefined,
    })
    setItemName('')
    setItemQty('')
    setItemUnit('')
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
          <button onClick={onClose} className="text-sm text-muted">
            Done
          </button>
        </div>

        {/* Add a simple item */}
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Simple item
          </div>
          <div className="flex items-center gap-2">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
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
            <PrimaryButton onClick={addItem} disabled={!itemName.trim()}>
              Add
            </PrimaryButton>
          </div>
        </div>

        {/* Add recipes */}
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
              <button
                key={r.id}
                onClick={() => addRecipeToMeal(mealId, r.id)}
                className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-left active:scale-[0.99]"
              >
                <span className="truncate">{r.title}</span>
                <span className="shrink-0 pl-2 text-brand">+</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
