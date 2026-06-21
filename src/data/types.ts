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
 * ingredients do.
 */
export type MealComponent =
  | { kind: 'recipe'; recipeId: string }
  | ({ kind: 'item' } & Ingredient)

export interface Meal {
  id: string
  name: string
  components: MealComponent[]
}

/** One entry in the flat, ordered meal plan. */
export interface PlanEntry {
  id: string
  mealId: string
  position: number
  includeInIngredients: boolean
}

/** Shape of the entire persisted dataset (one row per table on hydrate). */
export interface Dataset {
  recipes: Recipe[]
  meals: Meal[]
  plan: PlanEntry[]
}
