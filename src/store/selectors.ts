import { useStore } from './store'
import { aggregateIngredients } from '../data/aggregate'
import type { AggregatedIngredient } from '../data/aggregate'
import type { Recipe } from '../data/types'

/**
 * Memoized ingredient aggregate. The store replaces the plan/recipes arrays
 * immutably on every change, so reference equality is a sound and cheap cache
 * key — the (potentially heavy) aggregation only re-runs when one of those
 * arrays actually changes, never on unrelated renders.
 */
let cache: {
  plan: unknown
  recipes: unknown
  result: AggregatedIngredient[]
} | null = null

export function useAggregatedIngredients(): AggregatedIngredient[] {
  return useStore((s) => {
    if (cache && cache.plan === s.plan && cache.recipes === s.recipes) {
      return cache.result
    }
    const result = aggregateIngredients(s.plan, s.recipes)
    cache = { plan: s.plan, recipes: s.recipes, result }
    return result
  })
}

/** Count of plan meals currently feeding the ingredients list. */
export function useIncludedCount(): number {
  return useStore((s) => s.plan.filter((m) => m.includeInIngredients).length)
}

/** Recipe lookup, used to render recipe titles inside plan components. */
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
