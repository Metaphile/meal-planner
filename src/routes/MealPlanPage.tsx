import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
import { useAggregatedIngredients, useRecipeMap } from '../store/selectors'
import { useAuth } from '../auth/AuthProvider'
import { useSwipeToRemove } from '../lib/useSwipeToRemove'
import { EmptyState, PageHeader } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import {
  CardDetail,
  EditButton,
  EditLabel,
  RecipeCard,
  type CardOrigin,
} from '../components/RecipeCard'
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
  const planIngredients = useAggregatedIngredients()
  const addEmptyMeal = useStore((s) => s.addEmptyMeal)
  const reorderPlan = useStore((s) => s.reorderPlan)
  const { hasCapability } = useAuth()
  const canEdit = hasCapability('edit_plan')
  const canEditRecipes = hasCapability('edit_recipes')

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
    // The header scrolls with the meals, so a card lifted out of a pocket
    // rises over it (and is clipped only at the top of the page).
    <div
      data-meal-scroller
      className="scroll-y h-full overflow-x-hidden bg-backdrop text-ink"
    >
      <PageHeader
        title="Meals"
        action={
          canEdit ? (
            <button onClick={addEmptyMeal} className="kraft-tag">
              + Meal
            </button>
          ) : undefined
        }
      />

      {ordered.length === 0 ? (
        <EmptyState
          title="No meals yet"
          hint={
            canEdit
              ? 'Tap “+ Meal” to start one, or add a recipe straight from its card.'
              : 'No meals are planned yet.'
          }
          action={
            <Link to="/recipes" className="kraft-tag">
              Browse recipes
            </Link>
          }
        />
      ) : (
        <div className="px-4 pt-1 pb-8">
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
              <ul className="flex flex-col gap-4">
                {ordered.map((meal) => (
                  <MealPocket
                    key={meal.id}
                    meal={meal}
                    recipeMap={recipeMap}
                    canEdit={canEdit}
                    canEditRecipes={canEditRecipes}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {/* Ingredients for the included meals: a notepad sheet behind a
              kraft divider tab. */}
          <div className="relative mt-7 h-[30px]">
            <span className="paper-serif absolute bottom-[-1px] left-[18px] z-[1] rounded-t-lg border border-b-0 border-kraft-edge bg-kraft px-3 pt-1 pb-[5px] text-sm font-semibold text-kraft-ink">
              Ingredients
            </span>
          </div>
          <div className="kraft-pocket rounded-tl-none p-2">
            <IngredientsList
              ingredients={planIngredients}
              empty="Tick Include on a meal to see what it needs."
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** How much of each card peeks out of a pocket: the title of a card with
 *  another in front of it, and the title and a line of the front card. */
// (Just the title: the card in front starts where the title's red rule
// would, so the rule is hidden.)
const TITLE_PEEK = 46
const FRONT_PEEK = 78
/** A card shown faded back in a meal that isn't counted (see --shade). */
const EXCLUDED_SHADE = 0.14

interface Lift {
  componentId: string
  recipe: Recipe
  origin: CardOrigin
}

/**
 * A meal: a kraft pocket holding the recipe cards pulled from the box, their
 * tops peeking out as in the rolodex, with any misc items on a slip of scrap
 * paper tucked in front. Tapping a card lifts it out exactly as the rolodex
 * does; swipe the pocket right to remove the meal.
 */
function MealPocket({
  meal,
  recipeMap,
  canEdit,
  canEditRecipes,
}: {
  meal: PlanMeal
  recipeMap: Map<string, Recipe>
  canEdit: boolean
  canEditRecipes: boolean
}) {
  const removePlanMeal = useStore((s) => s.removePlanMeal)
  const togglePlanInclude = useStore((s) => s.togglePlanInclude)
  const removeComponent = useStore((s) => s.removeComponent)
  const [adding, setAdding] = useState(false)
  const [lift, setLift] = useState<Lift | null>(null)
  const removing = useRef(false)

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

  // Cards in the pocket (recipes that still exist) and everything else,
  // which goes on the slip.
  const cards: { id: string; recipe: Recipe }[] = []
  const slip: MealComponent[] = []
  for (const c of meal.components) {
    const recipe = c.kind === 'recipe' ? recipeMap.get(c.recipeId) : undefined
    if (recipe) cards.push({ id: c.id, recipe })
    else slip.push(c)
  }

  const slots = useRef(new Map<string, HTMLDivElement>())
  const lipRef = useRef<HTMLDivElement>(null)
  const shade = meal.includeInIngredients ? 0 : EXCLUDED_SHADE

  // Where card `id` sits in the pocket (screen space), and how high it must
  // rise to clear the card (or the pocket's front) in front of it.
  const originOf = (id: string): CardOrigin => {
    const slot = slots.current.get(id)!
    const r = slot.getBoundingClientRect()
    const card = slot.firstElementChild as HTMLElement
    const i = cards.findIndex((c) => c.id === id)
    const next =
      (i + 1 < cards.length && slots.current.get(cards[i + 1].id)) ||
      lipRef.current
    const nextTop = next ? next.getBoundingClientRect().top : Infinity
    const scroller = slot.closest('[data-meal-scroller]')
    return {
      slotTop: r.top,
      clearTop: Math.min(r.top, nextTop - card.offsetHeight),
      left: r.left,
      width: r.width,
      height: card.offsetHeight,
      viewTop: scroller ? scroller.getBoundingClientRect().top : 0,
      wheelPose: 'none',
      flatPose: 'none',
      shade,
    }
  }

  const openCard = (id: string, recipe: Recipe) => {
    if (lift) return
    const slot = slots.current.get(id)
    if (!slot) return
    // Let the whole card rise out of its slot (trimmed only below it, where
    // the cards in front and the pocket hide it anyway). Inline overrides of
    // the slot's class, cleared when it's back.
    // (Still a corner's radius below the slot, like its resting clip, so
    // the card in front's rounded corners keep showing this one behind.)
    slot.style.clipPath = 'inset(-4000px -24px -14px -24px)'
    flushSync(() => setLift({ componentId: id, recipe, origin: originOf(id) }))
  }

  const onClosed = () => {
    if (!lift) return
    const slot = slots.current.get(lift.componentId)
    const card = slot?.firstElementChild
    for (const el of [card, slot, card?.querySelector('.rolodex-dim')])
      el?.getAnimations().forEach((a) => a.cancel())
    if (slot) {
      slot.style.clipPath = ''
    }
    if (removing.current) {
      removing.current = false
      removeComponent(meal.id, lift.componentId)
    }
    flushSync(() => setLift(null))
  }

  return (
    <li
      ref={setNodeRef}
      style={{
        // Translate only — Transform.toString would add scaleX/scaleY to fit
        // the swapped slot, squishing/stretching variable-height pockets.
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        // A meal that isn't counted: the pocket goes dull, its cards dim.
        ...(meal.includeInIngredients
          ? {}
          : ({ '--color-kraft': '#d6cfbb' } as React.CSSProperties)),
      }}
      className={isDragging ? 'opacity-80' : undefined}
    >
      <div className="relative">
        <div
          ref={canEdit ? swipeRef : undefined}
          {...(canEdit ? handlers : {})}
          style={{ touchAction: 'pan-y' }}
          className="kraft-pocket peer relative z-10 px-2.5 pt-1.5 transition-colors duration-200"
        >
          {/* Pocket bar: drag handle · Add · Include */}
          <div className="flex items-center gap-3 pb-1.5 text-kraft-ink">
            {canEdit && (
              <button
                {...attributes}
                {...listeners}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  listeners?.onPointerDown?.(e)
                }}
                aria-label="Drag meal to reorder"
                className="-my-1 -ml-1 grid h-10 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-kraft-edge focus:outline-none focus-visible:ring-2 focus-visible:ring-kraft-ink active:cursor-grabbing"
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
                className="paper-serif -my-1 h-10 px-1 text-[15px] font-semibold active:opacity-60"
              >
                + Add
              </button>
            )}
            <IncludeTick
              on={meal.includeInIngredients}
              disabled={!canEdit}
              onToggle={() => togglePlanInclude(meal.id)}
            />
          </div>

          {cards.length === 0 && slip.length === 0 ? (
            <p className="paper-serif mb-2.5 rounded-lg border border-dashed border-kraft-edge px-3 py-4 text-center italic text-kraft-ink/70">
              {canEdit
                ? 'Empty — tap + Add to fill it.'
                : 'Nothing in this meal yet.'}
            </p>
          ) : (
            <>
              {cards.map(({ id, recipe }, i) => (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) slots.current.set(id, el)
                    else slots.current.delete(id)
                  }}
                  className="pocket-slot relative mx-0.5"
                  style={{
                    zIndex: i + 1,
                    height: i === cards.length - 1 ? FRONT_PEEK : TITLE_PEEK,
                    ['--shade' as string]: shade,
                  }}
                >
                  <RecipeCard
                    recipe={recipe}
                    canEditPlan={canEdit}
                    canEditRecipes={canEditRecipes}
                    actions={
                      <PocketCardActions
                        canEdit={canEdit}
                        canEditRecipes={canEditRecipes}
                      />
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`Take out ${recipe.title}`}
                    className="cursor-pointer select-none"
                    onClick={() => openCard(id, recipe)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openCard(id, recipe)
                      }
                    }}
                  />
                </div>
              ))}
              {/* The pocket's front, over the bottom of the cards. */}
              {cards.length > 0 && (
                <div
                  ref={lipRef}
                  className="pocket-lip relative -mx-2.5 -mt-3 h-[26px] transition-colors duration-200"
                  style={{ zIndex: cards.length + 1 }}
                />
              )}
              {slip.length > 0 ? (
                <ul
                  className={`scrap-slip paper-serif relative mx-2 mb-2.5 -rotate-1 px-2.5 py-1 text-[15px] text-ink-soft ${
                    cards.length > 0 ? '-mt-2' : 'mt-0.5'
                  }`}
                  style={{ zIndex: cards.length + 2 }}
                >
                  {slip.map((c) => (
                    <SlipLine
                      key={c.id}
                      label={componentLabel(c, recipeMap)}
                      canEdit={canEdit}
                      onRemove={() => removeComponent(meal.id, c.id)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="h-2.5" />
              )}
            </>
          )}
        </div>
        {/* Revealed behind the pocket as it's swiped right. Hidden otherwise
            so its red can't fringe the pocket's rounded corners. */}
        <div
          aria-hidden
          className="pointer-events-none invisible absolute inset-0 z-0 flex items-center rounded-xl bg-danger pl-5 text-lg text-white peer-data-swiping:visible"
        >
          Remove
        </div>
      </div>

      {lift && (
        <CardDetail
          key={lift.componentId}
          recipe={lift.recipe}
          origin={lift.origin}
          getOrigin={() => originOf(lift.componentId)}
          getRolodexCard={() =>
            slots.current.get(lift.componentId)?.firstElementChild as
              HTMLElement | undefined
          }
          canEditPlan={canEdit}
          canEditRecipes={canEditRecipes}
          renderActions={({ dismiss, edit }) => (
            <PocketCardActions
              canEdit={canEdit}
              canEditRecipes={canEditRecipes}
              onRemove={() => {
                removing.current = true
                dismiss()
              }}
              onEdit={edit}
            />
          )}
          onClosed={onClosed}
        />
      )}

      {adding && (
        <AddToMealSheet mealId={meal.id} onClose={() => setAdding(false)} />
      )}
    </li>
  )
}

/** A card taken out of a meal: take it out of the meal, or edit it (in hand,
 *  Edit turns the card over; in the pocket it's the same-looking label). */
function PocketCardActions({
  canEdit,
  canEditRecipes,
  onRemove,
  onEdit,
}: {
  canEdit: boolean
  canEditRecipes: boolean
  onRemove?: () => void
  onEdit?: () => void
}) {
  return (
    <>
      {canEdit && (
        <button
          onClick={onRemove}
          className="rounded-full border border-[#e3b4ac] px-4 py-1.5 text-sm font-medium leading-5 text-[#a8443a] active:scale-95"
        >
          Remove from meal
        </button>
      )}
      {canEditRecipes &&
        (onEdit ? <EditButton onEdit={onEdit} /> : <EditLabel />)}
    </>
  )
}

function SlipLine({
  label,
  canEdit,
  onRemove,
}: {
  label: string
  canEdit: boolean
  onRemove: () => void
}) {
  return (
    <li
      // Stop a press here from arming the meal's swipe-to-remove.
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center gap-2 italic"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {canEdit && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="-my-1 -mr-1.5 grid h-8 w-8 shrink-0 place-items-center not-italic text-ink-faint active:scale-95"
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

const CHECK = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

/** A ticked box drawn on the pocket: count this meal's ingredients. */
function IncludeTick({
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
      className={`paper-serif -my-1 flex h-10 shrink-0 items-center gap-1.5 text-sm text-kraft-ink focus:outline-none focus-visible:underline ${
        disabled ? 'cursor-default opacity-60' : ''
      }`}
    >
      <span className="grid h-5 w-5 place-items-center rounded border-[1.5px] border-kraft-ink bg-white/35">
        <span
          className={`h-4 w-4 text-[#a8443a] transition duration-150 ${
            on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          {CHECK}
        </span>
      </span>
      Include
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
      className={`paper-serif flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[17px] transition active:scale-[0.99] ${
        on
          ? 'border-kraft-edge bg-kraft/35 text-ink'
          : 'border-paper-edge bg-paper text-ink'
      }`}
    >
      <span className="truncate">{label}</span>
      <span
        aria-hidden
        className="grid h-5 w-5 shrink-0 place-items-center rounded border-[1.5px] border-ink-soft bg-white/50"
      >
        <span
          className={`h-4 w-4 text-[#a8443a] transition duration-150 ${
            on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          {CHECK}
        </span>
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
        className="flex max-h-[80%] flex-col rounded-t-2xl border-t border-paper-edge bg-backdrop text-ink"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="paper-serif text-[21px] font-semibold">Add to meal</h2>
          <button onClick={done} className="kraft-tag">
            Done{stagedCount > 0 ? ` · ${stagedCount}` : ''}
          </button>
        </div>

        {/* Misc items: the form stages an item as a toggle (on by default) */}
        <div className="border-b border-paper-edge px-4 py-3">
          <div className="paper-serif mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
            Misc item
          </div>
          <div className="flex items-center gap-2">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && stageItem()}
              placeholder="e.g. Steamed broccoli"
              aria-label="Misc item"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-paper-edge bg-paper px-3 py-2 placeholder:text-ink-faint focus:border-kraft-edge focus:outline-none"
            />
            <input
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
              inputMode="decimal"
              placeholder="Qty"
              aria-label="Quantity"
              autoComplete="off"
              className="w-14 rounded-lg border border-paper-edge bg-paper px-2 py-2 text-center placeholder:text-ink-faint focus:border-kraft-edge focus:outline-none"
            />
            <input
              value={itemUnit}
              onChange={(e) => setItemUnit(e.target.value)}
              placeholder="Unit"
              aria-label="Unit"
              autoComplete="off"
              autoCapitalize="none"
              className="w-16 rounded-lg border border-paper-edge bg-paper px-2 py-2 placeholder:text-ink-faint focus:border-kraft-edge focus:outline-none"
            />
            <button
              onClick={stageItem}
              disabled={!itemName.trim()}
              className="kraft-tag"
            >
              Add
            </button>
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
          <div className="paper-serif mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
            Recipes
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            inputMode="search"
            aria-label="Search recipes"
            className="w-full rounded-lg border border-paper-edge bg-paper px-3 py-2 placeholder:text-ink-faint focus:border-kraft-edge focus:outline-none"
          />
        </div>
        <div className="scroll-y flex flex-col gap-2 px-4 py-3">
          {filtered.length === 0 ? (
            <p className="paper-serif py-4 text-center italic text-ink-faint">
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
