import Dexie, { type EntityTable } from 'dexie'
import type { PlanMeal, Recipe } from './types'

export type TableName = 'recipes' | 'plan'

/** A pending remote write, persisted so offline edits survive a reload. */
export interface OutboxRow {
  id?: number
  collection: TableName
  key: string
  op: 'put' | 'delete'
  data?: Recipe | PlanMeal
}

/**
 * IndexedDB is the local cache (for instant boot + offline) plus an outbox of
 * writes waiting to reach PocketBase. The UI never reads from here on the
 * render path — see persistence.ts.
 */
export const db = new Dexie('meal-planner') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>
  plan: EntityTable<PlanMeal, 'id'>
  outbox: EntityTable<OutboxRow, 'id'>
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

// v3: add the outbox (offline write queue). recipes/plan become a cache of the
// authoritative PocketBase data, so clear the old local-only rows once — a
// fresh pull repopulates them.
db.version(3)
  .stores({
    recipes: 'id, title',
    plan: 'id, position',
    outbox: '++id',
  })
  .upgrade(async (tx) => {
    await tx.table('recipes').clear()
    await tx.table('plan').clear()
  })
