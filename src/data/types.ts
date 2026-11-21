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

/**
 * A recipe the household wants to make, and how many times. One per recipe
 * (its id is the recipe's id). Not wanting it any more keeps the row, with
 * its count, so wanting it again picks up where it left off. Wanted
 * recipes' ingredients make up the Ingredients list.
 */
export interface Want {
  id: string
  recipeId: string
  /** How many times over (at least 1) — when not wanted, the count it will
   *  have again when it is. */
  count: number
  /** False: not wanted just now. (Absent on older rows: wanted.) */
  wanted?: boolean
}

/** Whether a want row is wanted just now. */
export const isWanted = (w: Want) => w.wanted !== false

/** Something wanted that isn't from a recipe ("milk", "2 bags of ice"):
 *  listed under Add-ons on the Ingredients tab, in the order added. */
export interface AddOn extends Ingredient {
  id: string
  position: number
}

/**
 * An ingredient on the Ingredients list that the household has (ticked), and
 * how much of it. Keyed by the line (its name and unit, as lines are grouped
 * — see haveKey), so it stays with the line as the recipes wanted change.
 */
export interface Have {
  id: string
  /** How much is on hand (in the line's unit); none for a line without a
   *  quantity ("salt"). */
  amount?: number
  /** The line as it was written when ticked, to show it by even when no
   *  wanted recipe calls for it any more. (Absent on older rows: from id.) */
  name?: string
  unit?: string
}

/** A line's key for its Have: its name and unit, trimmed and lowercased. */
export const haveKey = (name: string, unit?: string) =>
  `${name.trim().toLowerCase()}|${(unit ?? '').trim().toLowerCase()}`

/** Shape of the entire persisted dataset (one row per table on hydrate). */
export interface Dataset {
  recipes: Recipe[]
  plan: PlanMeal[]
  wants: Want[]
  addons: AddOn[]
  haves: Have[]
}
