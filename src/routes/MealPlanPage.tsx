import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
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

// Reordering is locked to the vertical axis: the plan and each meal's component
// list are flat vertical lists, so sideways drift is just noise.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
})

export default function MealPlanPage() {
  const plan = useStore((s) => s.plan)
  const recipeMap = useRecipeMap()
  const addEmptyMeal = useStore((s) => s.addEmptyMeal)
  const reorderPlan = useStore((s) => s.reorderPlan)
  const moveComponent = useStore((s) => s.moveComponent)
  const commitPlan = useStore((s) => s.commitPlan)

  const [activeId, setActiveId] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...plan].sort((a, b) => a.position - b.position),
    [plan],
  )

  // Latest meal-id set for the collision strategy (avoids stale closures).
  const mealIdsRef = useRef<Set<string>>(new Set())
  mealIdsRef.current = new Set(ordered.map((m) => m.id))
  const isMealId = (id: string) => mealIdsRef.current.has(id)
  const mealOfComponent = (componentId: string) =>
    ordered.find((m) => m.components.some((c) => c.id === componentId))?.id

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // Keep the two drag levels from interfering: a meal drag only collides with
  // other meals; a component drag collides with everything (meals + items).
  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (mealIdsRef.current.has(String(args.active.id))) {
      const containers = args.droppableContainers.filter((c) =>
        mealIdsRef.current.has(String(c.id)),
      )
      return closestCenter({ ...args, droppableContainers: containers })
    }
    return closestCenter(args)
  }, [])

  const activeMeal = activeId && isMealId(activeId)
    ? ordered.find((m) => m.id === activeId)
    : null
  const activeComponent =
    activeId && !isMealId(activeId)
      ? ordered
          .flatMap((m) => m.components)
          .find((c) => c.id === activeId)
      : null

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  // Cross-meal component moves happen live here; within-meal reorder is left to
  // the SortableContext preview and committed on drop.
  const onDragOver = (e: DragOverEvent) => {
    const activeId = String(e.active.id)
    if (isMealId(activeId) || !e.over) return
    const overId = String(e.over.id)

    const fromMeal = mealOfComponent(activeId)
    const toMeal = isMealId(overId) ? overId : mealOfComponent(overId)
    if (!fromMeal || !toMeal || fromMeal === toMeal) return

    const target = ordered.find((m) => m.id === toMeal)
    if (!target) return
    const overIdx = isMealId(overId)
      ? target.components.length
      : target.components.findIndex((c) => c.id === overId)
    moveComponent(activeId, toMeal, overIdx < 0 ? target.components.length : overIdx)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    setActiveId(null)
    if (!overId) return

    if (isMealId(activeId)) {
      // Meal reorder.
      if (activeId !== overId && isMealId(overId)) {
        const ids = ordered.map((m) => m.id)
        const from = ids.indexOf(activeId)
        const to = ids.indexOf(overId)
        if (from !== -1 && to !== -1) reorderPlan(arrayMove(ids, from, to))
      }
      return
    }

    // Component: settle its final position within its (possibly new) meal.
    const mealId = mealOfComponent(activeId)
    const overMeal = isMealId(overId) ? overId : mealOfComponent(overId)
    if (mealId && overMeal === mealId && !isMealId(overId) && overId !== activeId) {
      const meal = ordered.find((m) => m.id === mealId)!
      const to = meal.components.findIndex((c) => c.id === overId)
      if (to !== -1) moveComponent(activeId, mealId, to)
    }
    commitPlan() // persist the drag once, off the interaction path
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
            Drag a meal’s handle to reorder · drag an item between meals · swipe
            a meal right to remove · toggle the switch to include it below.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
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

            <DragOverlay>
              {activeMeal ? (
                <div className="rounded-xl border border-border bg-surface px-3 py-3 shadow-lg">
                  <div className="text-sm text-muted">
                    Meal · {activeMeal.components.length} item
                    {activeMeal.components.length === 1 ? '' : 's'}
                  </div>
                </div>
              ) : activeComponent ? (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
                  {componentLabel(activeComponent, recipeMap)}
                </div>
              ) : null}
            </DragOverlay>
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
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={isDragging ? 'opacity-40' : undefined}
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
          {/* Meal header: drag handle · spacer · + · include toggle */}
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

          {/* Components */}
          <div className="px-3 pb-3">
            {meal.components.length === 0 ? (
              <button
                onClick={() => setAdding(true)}
                className="w-full rounded-lg border border-dashed border-border py-3 text-sm text-muted active:scale-[0.99]"
              >
                Add a recipe or item
              </button>
            ) : (
              <SortableContext
                items={meal.components.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1.5">
                  {meal.components.map((component) => (
                    <ComponentRow
                      key={component.id}
                      mealId={meal.id}
                      component={component}
                      recipeMap={recipeMap}
                    />
                  ))}
                </ul>
              </SortableContext>
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
  mealId,
  component,
  recipeMap,
}: {
  mealId: string
  component: MealComponent
  recipeMap: Map<string, Recipe>
}) {
  const removeComponent = useStore((s) => s.removeComponent)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // Stop any press on a component from arming the meal's swipe-to-remove.
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-2 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag item"
        className="-my-1 grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="7" r="1.5" />
          <circle cx="15" cy="7" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="17" r="1.5" />
          <circle cx="15" cy="17" r="1.5" />
        </svg>
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">
        {componentLabel(component, recipeMap)}
      </span>
      <button
        onClick={() => removeComponent(mealId, component.id)}
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
