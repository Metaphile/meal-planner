import Dexie, { type EntityTable } from 'dexie'
import type { Meal, PlanEntry, Recipe } from './types'

/**
 * IndexedDB schema. This is the *persistence* layer only — the UI never reads
 * from here on the render path. We load it once on boot and write to it in the
 * background (see persistence.ts).
 */
export const db = new Dexie('meal-planner') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>
  meals: EntityTable<Meal, 'id'>
  plan: EntityTable<PlanEntry, 'id'>
}

db.version(1).stores({
  // Only index what we query/sort by. Arrays (tags, ingredients, components)
  // are stored inline on the row; we don't need multi-entry indexes for
  // family-scale data — filtering happens in-memory.
  recipes: 'id, title',
  meals: 'id, name',
  plan: 'id, position',
})

export type TableName = 'recipes' | 'meals' | 'plan'
