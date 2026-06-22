import Dexie, { type EntityTable } from 'dexie'
import type { PlanMeal, Recipe } from './types'

/**
 * IndexedDB schema. This is the *persistence* layer only — the UI never reads
 * from here on the render path. We load it once on boot and write to it in the
 * background (see persistence.ts).
 */
export const db = new Dexie('meal-planner') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>
  plan: EntityTable<PlanMeal, 'id'>
}

db.version(1).stores({
  // Only index what we query/sort by. Arrays (tags, ingredients, components)
  // are stored inline on the row; we don't need multi-entry indexes for
  // family-scale data — filtering happens in-memory.
  recipes: 'id, title',
  meals: 'id, name',
  plan: 'id, position',
})

// v2: meals are no longer a saved entity — a meal is now an anonymous group of
// components living on the plan row itself. The app is pre-release with no
// users, so we don't migrate old data: drop the meals table and clear the
// now-incompatible (mealId-shaped) plan rows. Recipes carry over unchanged.
db.version(2)
  .stores({
    recipes: 'id, title',
    meals: null,
    plan: 'id, position',
  })
  .upgrade((tx) => tx.table('plan').clear())

export type TableName = 'recipes' | 'plan'
