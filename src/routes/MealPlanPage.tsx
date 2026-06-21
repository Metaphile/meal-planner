import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store/store'
import { useMealMap } from '../store/selectors'
import { useSwipeToRemove } from '../lib/useSwipeToRemove'
import { EmptyState, PageHeader } from '../components/ui'
import type { Meal, PlanEntry } from '../data/types'

export default function MealPlanPage() {
  const plan = useStore((s) => s.plan)
  const meals = useStore((s) => s.meals)
  const mealMap = useMealMap()
  const reorderPlan = useStore((s) => s.reorderPlan)
  const [adding, setAdding] = useState(false)

  // Render in position order regardless of array order.
  const ordered = useMemo(
    () => [...plan].sort((a, b) => a.position - b.position),
    [plan],
  )

  // A small distance constraint stops a tap or swipe from starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = ordered.map((p) => p.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    reorderPlan(arrayMove(ids, from, to)) // committed on drop only
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Meal Plan"
        action={
          <button
            onClick={() => setAdding(true)}
            disabled={meals.length === 0}
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand active:scale-95 disabled:opacity-40"
          >
            + Add
          </button>
        }
      />

      {ordered.length === 0 ? (
        <EmptyState
          title="Your plan is empty"
          hint={
            meals.length === 0
              ? 'Create a meal first, then add it to the plan.'
              : 'Tap “+ Add” to drop meals into your plan.'
          }
          action={
            meals.length === 0 ? (
              <Link
                to="/meals/new"
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand"
              >
                New meal
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="scroll-y flex-1 px-4 py-3">
          <p className="mb-2 text-xs text-muted">
            Drag the handle to reorder · swipe a card right to remove · toggle
            the switch to include it in the ingredients list.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {ordered.map((entry) => (
                  <PlanRow
                    key={entry.id}
                    entry={entry}
                    meal={mealMap.get(entry.mealId)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {adding && <AddMealSheet onClose={() => setAdding(false)} />}
    </div>
  )
}

function PlanRow({ entry, meal }: { entry: PlanEntry; meal?: Meal }) {
  const removePlanEntry = useStore((s) => s.removePlanEntry)
  const togglePlanInclude = useStore((s) => s.togglePlanInclude)
  const { ref: swipeRef, handlers } = useSwipeToRemove<HTMLDivElement>(() =>
    removePlanEntry(entry.id),
  )

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={isDragging ? 'opacity-80' : undefined}
    >
      {/* Removal hint revealed as the card slides away. */}
      <div className="relative overflow-hidden rounded-xl">
        <div className="pointer-events-none absolute inset-0 flex items-center pl-4 text-sm font-medium text-danger">
          Remove
        </div>
        <div
          ref={swipeRef}
          {...handlers}
          style={{ touchAction: 'pan-y' }}
          className="relative flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3"
        >
          <button
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            // 44px hit area; negative margin keeps it from inflating the row.
            className="-my-2 grid h-11 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing"
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

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {meal?.name ?? '(deleted meal)'}
            </div>
            <div className="truncate text-xs text-muted">
              {meal ? summarize(meal) : '—'}
            </div>
          </div>

          <IncludeToggle
            on={entry.includeInIngredients}
            onToggle={() => togglePlanInclude(entry.id)}
          />
        </div>
      </div>
    </li>
  )
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
      // 44px hit area for thumbs; negative margin keeps the row height tight.
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

function summarize(meal: Meal): string {
  return `${meal.components.length} item${
    meal.components.length === 1 ? '' : 's'
  }`
}

function AddMealSheet({ onClose }: { onClose: () => void }) {
  const meals = useStore((s) => s.meals)
  const addMealToPlan = useStore((s) => s.addMealToPlan)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[70%] rounded-t-2xl border-t border-border bg-surface p-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add a meal</h2>
          <button onClick={onClose} className="text-sm text-muted">
            Close
          </button>
        </div>
        <div className="scroll-y flex flex-col gap-2">
          {meals.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                addMealToPlan(m.id)
                onClose()
              }}
              className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-left active:scale-[0.99]"
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
