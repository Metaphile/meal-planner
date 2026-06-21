import { create } from 'zustand'
import type { Meal, PlanEntry, Recipe } from '../data/types'
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
  meals: Meal[]
  plan: PlanEntry[]
  hydrated: boolean

  init: () => Promise<void>

  // Recipes
  upsertRecipe: (recipe: Recipe) => void
  deleteRecipe: (id: string) => void

  // Meals
  upsertMeal: (meal: Meal) => void
  deleteMeal: (id: string) => void

  // Plan
  addMealToPlan: (mealId: string) => void
  removePlanEntry: (id: string) => void
  togglePlanInclude: (id: string) => void
  /** Commit a new order (array of plan-entry ids, in display order). */
  reorderPlan: (orderedIds: string[]) => void
}

export const useStore = create<AppState>((set, get) => ({
  recipes: [],
  meals: [],
  plan: [],
  hydrated: false,

  init: async () => {
    if (get().hydrated) return
    let data = await hydrate()
    // First run: seed once so the app isn't empty.
    if (
      data.recipes.length === 0 &&
      data.meals.length === 0 &&
      data.plan.length === 0
    ) {
      await replaceAll(seedData)
      data = seedData
    }
    set({
      recipes: [...data.recipes].sort((a, b) => a.title.localeCompare(b.title)),
      meals: [...data.meals].sort((a, b) => a.name.localeCompare(b.name)),
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
    set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }))
    enqueueDelete('recipes', id)
  },

  upsertMeal: (meal) => {
    set((s) => {
      const others = s.meals.filter((m) => m.id !== meal.id)
      return {
        meals: [...others, meal].sort((a, b) => a.name.localeCompare(b.name)),
      }
    })
    enqueuePut('meals', meal)
  },

  deleteMeal: (id) => {
    // Remove the meal and any plan entries that referenced it.
    const orphans = get().plan.filter((p) => p.mealId === id)
    set((s) => ({
      meals: s.meals.filter((m) => m.id !== id),
      plan: s.plan.filter((p) => p.mealId !== id),
    }))
    enqueueDelete('meals', id)
    orphans.forEach((p) => enqueueDelete('plan', p.id))
  },

  addMealToPlan: (mealId) => {
    const position = get().plan.length
    const entry: PlanEntry = {
      id: newId(),
      mealId,
      position,
      includeInIngredients: true,
    }
    set((s) => ({ plan: [...s.plan, entry] }))
    enqueuePut('plan', entry)
  },

  removePlanEntry: (id) => {
    // Drop the entry, then renumber positions so they stay contiguous.
    const remaining = get()
      .plan.filter((p) => p.id !== id)
      .sort((a, b) => a.position - b.position)
    const renumbered = remaining.map((p, i) => ({ ...p, position: i }))
    set({ plan: renumbered })
    enqueueDelete('plan', id)
    renumbered.forEach((p) => enqueuePut('plan', p))
  },

  togglePlanInclude: (id) => {
    let updated: PlanEntry | undefined
    set((s) => ({
      plan: s.plan.map((p) => {
        if (p.id !== id) return p
        updated = { ...p, includeInIngredients: !p.includeInIngredients }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },

  reorderPlan: (orderedIds) => {
    const byId = new Map(get().plan.map((p) => [p.id, p]))
    const renumbered = orderedIds
      .map((id, i) => {
        const entry = byId.get(id)
        return entry ? { ...entry, position: i } : undefined
      })
      .filter((p): p is PlanEntry => p !== undefined)
    set({ plan: renumbered })
    renumbered.forEach((p) => enqueuePut('plan', p))
  },
}))
