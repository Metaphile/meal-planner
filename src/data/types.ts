// Domain model for the meal planner. These types are the contract shared by
// the Zustand store, the Dexie persistence layer, and the aggregation logic.

/** A single ingredient line. `quantity` is optional ("salt, to taste"). */
export interface Ingredient {
  name: string
  quantity?: number
  unit?: string
}

export interface Recipe {
  id: string
  title: string
  tags: string[]
  ingredients: Ingredient[]
  notes?: string
}

/**
 * A meal is composed of recipe references AND/OR simple items.
 * A simple item (e.g. "bacon") IS an ingredient that lives directly on the
 * meal, so it aggregates into the ingredients list exactly like a recipe's
 * ingredients do. Each component carries its own `id` (distinct from any
 * recipeId) so it can be a stable drag key and moved between meals.
 */
export type MealComponent =
  | { id: string; kind: 'recipe'; recipeId: string }
  | ({ id: string; kind: 'item' } & Ingredient)

/**
 * A meal is an anonymous group of components that lives only inside the plan —
 * there are no saved/reusable meals. The plan is a flat, ordered list of these.
 */
export interface PlanMeal {
  id: string
  position: number
  includeInIngredients: boolean
  components: MealComponent[]
}

/** Shape of the entire persisted dataset (one row per table on hydrate). */
export interface Dataset {
  recipes: Recipe[]
  plan: PlanMeal[]
}
