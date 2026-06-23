import { create } from 'zustand'
import type { Ingredient, MealComponent, PlanMeal, Recipe } from '../data/types'
import {
  enqueueDelete,
  enqueuePut,
  hydrate,
  replaceAll,
} from '../data/persistence'
import { seedData } from '../data/seed'
import { newId } from '../lib/id'

interface AppState {
  recipes: Recipe[]
  plan: PlanMeal[]
  hydrated: boolean

  init: () => Promise<void>

  // Recipes (the durable library)
  upsertRecipe: (recipe: Recipe) => void
  deleteRecipe: (id: string) => void

  // Plan meals (anonymous groups that live only on the plan)
  addRecipeToPlan: (recipeId: string) => void
  addEmptyMeal: () => void
  removePlanMeal: (mealId: string) => void
  togglePlanInclude: (mealId: string) => void
  /** New meal order, by id, in display order. */
  reorderPlan: (orderedIds: string[]) => void

  // Components within a meal
  addRecipeToMeal: (mealId: string, recipeId: string) => void
  addItemToMeal: (mealId: string, item: Ingredient) => void
  removeComponent: (mealId: string, componentId: string) => void
}

/** Append a meal at the end of the plan. */
function makeMeal(components: MealComponent[], position: number): PlanMeal {
  return { id: newId(), position, includeInIngredients: true, components }
}

export const useStore = create<AppState>((set, get) => ({
  recipes: [],
  plan: [],
  hydrated: false,

  init: async () => {
    if (get().hydrated) return
    let data = await hydrate()
    // First run only: seed so the app isn't empty.
    if (data.recipes.length === 0 && data.plan.length === 0) {
      await replaceAll(seedData)
      data = seedData
    }
    set({
      recipes: [...data.recipes].sort((a, b) => a.title.localeCompare(b.title)),
      plan: [...data.plan].sort((a, b) => a.position - b.position),
      hydrated: true,
    })
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

  addRecipeToMeal: (mealId, recipeId) => {
    const component: MealComponent = { id: newId(), kind: 'recipe', recipeId }
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = { ...m, components: [...m.components, component] }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },

  addItemToMeal: (mealId, item) => {
    const component: MealComponent = { id: newId(), kind: 'item', ...item }
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = { ...m, components: [...m.components, component] }
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
