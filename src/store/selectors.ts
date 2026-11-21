import { useStore } from './store'
import { aggregateIngredients, aggregateWanted } from '../data/aggregate'
import type { AggregatedIngredient } from '../data/aggregate'
import { isWanted, type Recipe } from '../data/types'

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

/** The wanted recipes' ingredients (the Ingredients tab), memoized the same
 *  way. */
let wantedCache: {
  wants: unknown
  recipes: unknown
  result: AggregatedIngredient[]
} | null = null

export function useWantedIngredients(): AggregatedIngredient[] {
  return useStore((s) => {
    if (
      wantedCache &&
      wantedCache.wants === s.wants &&
      wantedCache.recipes === s.recipes
    ) {
      return wantedCache.result
    }
    const result = aggregateWanted(s.wants, s.recipes)
    wantedCache = { wants: s.wants, recipes: s.recipes, result }
    return result
  })
}

/** How many times a recipe is wanted (0: not wanted). */
export function useWantCount(recipeId: string): number {
  return useStore((s) => {
    const w = s.wants.find((w) => w.recipeId === recipeId)
    return w && isWanted(w) ? w.count : 0
  })
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
