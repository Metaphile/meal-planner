import type { Ingredient, PlanMeal, Recipe, Want } from './types'
import { allIngredients, isWanted } from './types'

/** A line in the aggregated ingredients view. */
export interface AggregatedIngredient {
  name: string
  unit?: string
  /** Summed quantity, or undefined when no contributing line had a quantity. */
  quantity?: number
  /**
   * Sorted, de-duped source labels: a recipe contributes its title, a simple
   * item contributes its own name. (A line's lone self-referential item tag is
   * suppressed — see below.)
   */
  sources: string[]
}

/** Normalize a name/unit for grouping: trimmed + lowercased. */
function norm(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** Group key combines normalized name + normalized unit. */
function keyFor(ing: Ingredient): string {
  return `${norm(ing.name)} ${norm(ing.unit)}`
}

/**
 * Aggregate the ingredients required by the currently-included plan meals.
 *
 * Walks every included meal -> a flat list of Ingredients drawn from BOTH
 * sources (recipe components contribute the recipe's ingredients; item
 * components contribute themselves), then groups by normalized name + unit and
 * sums quantities. Each line is tagged with the recipes / items it came from.
 *
 * Rules:
 *  - same name + same unit -> sum quantities, regardless of source.
 *  - same name + different unit -> separate lines (never convert across units).
 *  - a line with no quantity contributes no number; a group with no quantities
 *    at all reports `quantity: undefined`.
 *  - excluded meals and missing recipe refs are skipped safely.
 *  - sources: recipe -> recipe.title, item -> its own name; sorted & de-duped.
 *    If a line's only source is an item whose name equals the line itself, the
 *    (redundant) self-tag is suppressed.
 *  - output sorted alphabetically by name (then unit).
 */
export function aggregateIngredients(
  plan: PlanMeal[],
  recipes: Recipe[],
): AggregatedIngredient[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]))
  return aggregate((add) => {
    for (const meal of plan) {
      if (!meal.includeInIngredients) continue
      for (const component of meal.components) {
        if (component.kind === 'recipe') {
          const recipe = recipeById.get(component.recipeId)
          if (!recipe) continue
          for (const ing of allIngredients(recipe)) add(ing, recipe.title, 1)
        } else {
          // Simple item: tag it with its own name.
          add(component, component.name, 1)
        }
      }
    }
  })
}

/**
 * Aggregate the ingredients of the wanted recipes, each as many times over
 * as it's wanted (same rules as above). A want whose recipe is gone is
 * skipped. A recipe wanted more than once is tagged "Title ×n".
 */
export function aggregateWanted(
  wants: Want[],
  recipes: Recipe[],
): AggregatedIngredient[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]))
  return aggregate((add) => {
    for (const want of wants) {
      if (!isWanted(want)) continue
      const recipe = recipeById.get(want.recipeId)
      if (!recipe) continue
      const times = Math.max(1, want.count)
      const source = times > 1 ? `${recipe.title} ×${times}` : recipe.title
      for (const ing of allIngredients(recipe)) add(ing, source, times)
    }
  })
}

type Add = (ing: Ingredient, source: string, times: number) => void

/** Group, sum and tag the lines `collect` adds (see aggregateIngredients). */
function aggregate(collect: (add: Add) => void): AggregatedIngredient[] {

  // Preserve the first-seen display name/unit so output isn't lowercased.
  const groups = new Map<
    string,
    {
      name: string
      unit?: string
      quantity?: number
      hasQuantity: boolean
      sources: Set<string>
    }
  >()

  const add: Add = (ing, source, times) => {
    if (!norm(ing.name)) return // skip blank ingredient names
    const key = keyFor(ing)
    let group = groups.get(key)
    if (!group) {
      group = {
        name: ing.name.trim(),
        unit: ing.unit?.trim() || undefined,
        quantity: undefined,
        hasQuantity: false,
        sources: new Set(),
      }
      groups.set(key, group)
    }
    if (typeof ing.quantity === 'number' && !Number.isNaN(ing.quantity)) {
      group.quantity = (group.quantity ?? 0) + ing.quantity * times
      group.hasQuantity = true
    }
    if (source.trim()) group.sources.add(source.trim())
  }

  collect(add)

  return [...groups.values()]
    .map((g) => {
      let sources = [...g.sources].sort((a, b) => a.localeCompare(b))
      // Suppress a lone self-referential item tag (e.g. "Garlic bread" used
      // only as a standalone item shouldn't tag itself with "Garlic bread").
      if (sources.length === 1 && norm(sources[0]) === norm(g.name)) {
        sources = []
      }
      return {
        name: g.name,
        unit: g.unit,
        quantity: g.hasQuantity ? g.quantity : undefined,
        sources,
      }
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || norm(a.unit).localeCompare(norm(b.unit)),
    )
}
