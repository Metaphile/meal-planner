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
  /** The first section's lines (every recipe has it). */
  ingredients: Ingredient[]
  /** The first section's title, if it's given one (see sectionLabels). */
  ingredientsTitle?: string
  /** Sections after the first, in order. */
  sections?: IngredientSection[]
  notes?: string
}

/** A titled group of a recipe's ingredient lines ("Sauce", "Topping") —
 *  possibly none yet: a section stands on its own. */
export interface IngredientSection {
  title: string
  ingredients: Ingredient[]
}

/**
 * Sections' headings, in order. Titles are optional: one that's given
 * shows; untitled, a section has no heading (`null`) — set apart from the
 * one before it only by the line left blank between them.
 */
export const sectionLabels = (titles: string[]): (string | null)[] =>
  titles.map((t) => t.trim() || null)

/** A line with anything on it — a name, an amount, a unit: any of them
 *  will do (only a line with nothing at all is no line). */
export const hasAnything = (i: Ingredient) =>
  !!i.name.trim() || i.quantity !== undefined || !!i.unit

/** A recipe's sections, the first included (titles as given: maybe none). */
/** Units since renamed: whatever's written with the old name (by an
 *  older version of the app) is read as the new one. */
const RENAMED_UNITS: Record<string, string> = {
  'heaping tbsp': 'tbsp heaping',
}
const tidyLines = (lines: Ingredient[]) =>
  lines.map((i) =>
    i.unit && RENAMED_UNITS[i.unit] ? { ...i, unit: RENAMED_UNITS[i.unit] } : i,
  )
/** A recipe as this version of the app writes it (renamed units read as
 *  their names now) — for every recipe read in, from the device or the
 *  server. */
export function tidyRecipe(r: Recipe): Recipe {
  if (
    !allIngredients(r).some((i) => i.unit && RENAMED_UNITS[i.unit])
  )
    return r
  return {
    ...r,
    ingredients: tidyLines(r.ingredients),
    sections: r.sections?.map((s) => ({
      ...s,
      ingredients: tidyLines(s.ingredients),
    })),
  }
}

export const sectionsOf = (r: Recipe): IngredientSection[] => [
  { title: r.ingredientsTitle ?? '', ingredients: r.ingredients },
  ...(r.sections ?? []),
]

/** Every ingredient line of a recipe, all sections, in order. */
export const allIngredients = (r: Recipe): Ingredient[] =>
  r.sections?.length
    ? [...r.ingredients, ...r.sections.flatMap((s) => s.ingredients)]
    : r.ingredients

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
 *  listed under Add-ons on the shopping list, in the order added. */
export interface AddOn extends Ingredient {
  id: string
  position: number
  /** Ticked: got it (on hand). (Absent on older rows: not ticked.) */
  have?: boolean
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
  /** Unticked, but kept on the list: a line no wanted recipe calls for,
   *  unticked — still listed ("– cup"), to tick again (at `amount`). */
  off?: true
}

/** A line's key for its Have: its name and unit, trimmed and lowercased. */
export const haveKey = (name: string, unit?: string) =>
  `${name.trim().toLowerCase()}|${(unit ?? '').trim().toLowerCase()}`

/** A recipe someone marked a favorite: theirs to add or take back, seen by
 *  the whole group. Its id is theirs and the recipe's (see favoriteKey). */
export interface Favorite {
  id: string
  recipeId: string
}

export const favoriteKey = (userId: string, recipeId: string) =>
  `${userId}:${recipeId}`

/** Whose favorite it is (their user id: the first part of its key). */
export const favoriteUser = (f: Favorite) => f.id.slice(0, f.id.indexOf(':'))

/** Someone in the group, by name (as kept on this device, for the names on
 *  a card — who's favorited it — even offline). */
export interface Person {
  id: string
  name: string
}

/** Shape of the entire persisted dataset (one row per table on hydrate). */
export interface Dataset {
  recipes: Recipe[]
  plan: PlanMeal[]
  wants: Want[]
  addons: AddOn[]
  haves: Have[]
  /** (Everyone's.) */
  favorites: Favorite[]
  /** The group. (Read here, never written: see the Account page.) */
  people: Person[]
}
