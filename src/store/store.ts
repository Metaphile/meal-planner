import { create } from 'zustand'
import type {
  Ingredient,
  MealComponent,
  PlanMeal,
  Recipe,
  Want,
} from '../data/types'
import {
  enqueueDelete,
  enqueuePut,
  hydrate,
  startSync,
} from '../data/persistence'
import { newId } from '../lib/id'

const byTitle = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title)
const byPosition = (a: PlanMeal, b: PlanMeal) => a.position - b.position

interface AppState {
  recipes: Recipe[]
  plan: PlanMeal[]
  /** Recipes wanted (and how many times): they make the Ingredients list. */
  wants: Want[]
  hydrated: boolean

  init: () => Promise<void>

  // Recipes (the durable library)
  upsertRecipe: (recipe: Recipe) => void
  deleteRecipe: (id: string) => void

  // Wants
  /** Want a recipe (once), or not any more. */
  setWanted: (recipeId: string, wanted: boolean) => void
  /** How many times over a wanted recipe is wanted (at least 1). */
  setWantCount: (recipeId: string, count: number) => void

  // Plan meals (anonymous groups that live only on the plan)
  addRecipeToPlan: (recipeId: string) => void
  addEmptyMeal: () => void
  removePlanMeal: (mealId: string) => void
  togglePlanInclude: (mealId: string) => void
  /** New meal order, by id, in display order. */
  reorderPlan: (orderedIds: string[]) => void

  // Components within a meal
  /** Add several recipes/items to a meal in one write (the add sheet's Done). */
  addComponentsToMeal: (mealId: string, additions: NewComponent[]) => void
  removeComponent: (mealId: string, componentId: string) => void
}

/** A meal component before it has an id. */
export type NewComponent =
  { kind: 'recipe'; recipeId: string } | ({ kind: 'item' } & Ingredient)

/** Append a meal at the end of the plan. */
function makeMeal(components: MealComponent[], position: number): PlanMeal {
  return { id: newId(), position, includeInIngredients: true, components }
}

export const useStore = create<AppState>((set, get) => ({
  recipes: [],
  plan: [],
  wants: [],
  hydrated: false,

  init: async () => {
    if (get().hydrated) return
    // 1. Instant paint from the local cache (works offline).
    const cached = await hydrate()
    set({
      recipes: [...cached.recipes].sort(byTitle),
      plan: [...cached.plan].sort(byPosition),
      wants: cached.wants,
      hydrated: true,
    })
    // 2. Reconcile with PocketBase + subscribe to realtime updates. Keeps the
    //    cache if we're offline.
    try {
      await startSync((data) => {
        set({
          recipes: [...data.recipes].sort(byTitle),
          plan: [...data.plan].sort(byPosition),
          wants: data.wants,
        })
      })
    } catch {
      // Offline or sync unavailable — the cached data above still works.
    }
  },

  upsertRecipe: (recipe) => {
    set((s) => {
      const others = s.recipes.filter((r) => r.id !== recipe.id)
      return {
        recipes: [...others, recipe].sort((a, b) =>
          a.title.localeCompare(b.title),
        ),
      }
    })
    enqueuePut('recipes', recipe)
  },

  deleteRecipe: (id) => {
    // Plan components referencing this recipe become dangling refs, which the
    // aggregation and UI both handle safely (shown as "deleted recipe").
    set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }))
    enqueueDelete('recipes', id)
  },

  setWanted: (recipeId, wanted) => {
    const has = get().wants.some((w) => w.recipeId === recipeId)
    if (wanted === has) return
    if (wanted) {
      const want: Want = { id: recipeId, recipeId, count: 1 }
      set((s) => ({ wants: [...s.wants, want] }))
      enqueuePut('wants', want)
    } else {
      set((s) => ({ wants: s.wants.filter((w) => w.recipeId !== recipeId) }))
      enqueueDelete('wants', recipeId)
    }
  },

  setWantCount: (recipeId, count) => {
    const n = Math.max(1, Math.round(count))
    let updated: Want | undefined
    set((s) => ({
      wants: s.wants.map((w) => {
        if (w.recipeId !== recipeId || w.count === n) return w
        updated = { ...w, count: n }
        return updated
      }),
    }))
    if (updated) enqueuePut('wants', updated)
  },

  addRecipeToPlan: (recipeId) => {
    const meal = makeMeal(
      [{ id: newId(), kind: 'recipe', recipeId }],
      get().plan.length,
    )
    set((s) => ({ plan: [...s.plan, meal] }))
    enqueuePut('plan', meal)
  },

  addEmptyMeal: () => {
    const meal = makeMeal([], get().plan.length)
    set((s) => ({ plan: [...s.plan, meal] }))
    enqueuePut('plan', meal)
  },

  removePlanMeal: (mealId) => {
    const renumbered = get()
      .plan.filter((m) => m.id !== mealId)
      .sort((a, b) => a.position - b.position)
      .map((m, i) => ({ ...m, position: i }))
    set({ plan: renumbered })
    enqueueDelete('plan', mealId)
    renumbered.forEach((m) => enqueuePut('plan', m))
  },

  togglePlanInclude: (mealId) => {
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = { ...m, includeInIngredients: !m.includeInIngredients }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },

  reorderPlan: (orderedIds) => {
    const byId = new Map(get().plan.map((m) => [m.id, m]))
    const renumbered = orderedIds
      .map((id, i) => {
        const meal = byId.get(id)
        return meal ? { ...meal, position: i } : undefined
      })
      .filter((m): m is PlanMeal => m !== undefined)
    set({ plan: renumbered })
    renumbered.forEach((m) => enqueuePut('plan', m))
  },

  addComponentsToMeal: (mealId, additions) => {
    if (additions.length === 0) return
    const components = additions.map(
      (a) => ({ ...a, id: newId() }) as MealComponent,
    )
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = { ...m, components: [...m.components, ...components] }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },

  removeComponent: (mealId, componentId) => {
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = {
          ...m,
          components: m.components.filter((c) => c.id !== componentId),
        }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },
}))
