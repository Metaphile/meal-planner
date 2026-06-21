import { useStore } from './store'
import { aggregateIngredients } from '../data/aggregate'
import type { AggregatedIngredient } from '../data/aggregate'
import type { Meal, Recipe } from '../data/types'

/**
 * Memoized ingredient aggregate. The store replaces the plan/meals/recipes
 * arrays immutably on every change, so reference equality is a sound and cheap
 * cache key — the (potentially heavy) aggregation only re-runs when one of
 * those three arrays actually changes, never on unrelated renders.
 */
let cache: {
  plan: unknown
  meals: unknown
  recipes: unknown
  result: AggregatedIngredient[]
} | null = null

export function useAggregatedIngredients(): AggregatedIngredient[] {
  return useStore((s) => {
    if (
      cache &&
      cache.plan === s.plan &&
      cache.meals === s.meals &&
      cache.recipes === s.recipes
    ) {
      return cache.result
    }
    const result = aggregateIngredients(s.plan, s.meals, s.recipes)
    cache = { plan: s.plan, meals: s.meals, recipes: s.recipes, result }
    return result
  })
}

/** Count of plan entries currently feeding the ingredients list. */
export function useIncludedCount(): number {
  return useStore((s) => s.plan.filter((p) => p.includeInIngredients).length)
}

/** Lookup helpers used across the meal/plan UIs. */
export function useRecipeMap(): Map<string, Recipe> {
  return useStore((s) => {
    if (recipeMapCache.src === s.recipes) return recipeMapCache.map
    const map = new Map(s.recipes.map((r) => [r.id, r]))
    recipeMapCache = { src: s.recipes, map }
    return map
  })
}
let recipeMapCache: { src: unknown; map: Map<string, Recipe> } = {
  src: null,
  map: new Map(),
}

export function useMealMap(): Map<string, Meal> {
  return useStore((s) => {
    if (mealMapCache.src === s.meals) return mealMapCache.map
    const map = new Map(s.meals.map((m) => [m.id, m]))
    mealMapCache = { src: s.meals, map }
    return map
  })
}
let mealMapCache: { src: unknown; map: Map<string, Meal> } = {
  src: null,
  map: new Map(),
}
