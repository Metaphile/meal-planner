import type { Ingredient, IngredientSection, Recipe } from '../data/types'
import {
  DAY,
  bool,
  isObj,
  loadKept,
  num,
  save,
  str,
  strs,
  type Slice,
} from './uiState'

/**
 * An unsaved edit (the back of a card being written on), kept on the device
 * as it's written, so it outlives leaving the app — and a new version of the
 * app. It's kept in the recipe's own terms (a title, sections of lines,
 * notes, tags — what any version of the app knows a recipe by), plus which
 * lines and sections are crossed out.
 *
 * Unlike the rest of what's on screen, it's never just dropped: if a new
 * version can't read it, it's kept, and its words shown (see `draftWords`)
 * for you to copy out.
 */

export interface DraftRow {
  name: string
  quantity?: number
  unit?: string
  struck?: boolean
}
export interface DraftGroup {
  title: string
  struck?: boolean
  /** Made in this edit. */
  fresh?: boolean
  rows: DraftRow[]
}
/** What a recipe said when its editing began (to tell, on saving, whether
 *  someone else has changed it since). */
export type RecipeText = Pick<
  Recipe,
  'title' | 'ingredients' | 'ingredientsTitle' | 'sections' | 'notes' | 'tags'
>
export interface Draft {
  recipeId: string
  /** A new recipe, never saved. */
  isNew: boolean
  base: RecipeText
  title: string
  tagsText: string
  notes: string
  groups: DraftGroup[]
}

const ingredient = (x: unknown): Ingredient | null =>
  isObj(x)
    ? {
        name: str(x.name),
        quantity: num(x.quantity),
        unit: str(x.unit) || undefined,
      }
    : null
const ingredients = (x: unknown) =>
  (Array.isArray(x) ? x : [])
    .map(ingredient)
    .filter((i): i is Ingredient => !!i)

const recipeText = (x: unknown): RecipeText => {
  const r = isObj(x) ? x : {}
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .filter(isObj)
    .map(
      (s): IngredientSection => ({
        title: str(s.title),
        ingredients: ingredients(s.ingredients),
      }),
    )
  return {
    title: str(r.title),
    ingredients: ingredients(r.ingredients),
    ingredientsTitle: str(r.ingredientsTitle) || undefined,
    sections: sections.length ? sections : undefined,
    notes: str(r.notes) || undefined,
    tags: strs(r.tags),
  }
}

export const DRAFT: Slice<Draft> = {
  key: 'draft',
  version: 1,
  maxAgeMs: 7 * DAY,
  parse(x) {
    if (!isObj(x) || typeof x.recipeId !== 'string') return null
    const groups = (Array.isArray(x.groups) ? x.groups : [])
      .filter(isObj)
      .map(
        (g): DraftGroup => ({
          title: str(g.title),
          struck: bool(g.struck) || undefined,
          fresh: bool(g.fresh) || undefined,
          rows: (Array.isArray(g.rows) ? g.rows : []).filter(isObj).map(
            (r): DraftRow => ({
              name: str(r.name),
              quantity: num(r.quantity),
              unit: str(r.unit) || undefined,
              struck: bool(r.struck) || undefined,
            }),
          ),
        }),
      )
    if (!groups.length) return null
    return {
      recipeId: x.recipeId,
      isNew: bool(x.isNew),
      base: recipeText(x.base),
      title: str(x.title),
      tagsText: str(x.tagsText),
      notes: str(x.notes),
      groups,
    }
  },
}

export type KeptDraft =
  | { draft: Draft }
  /** Kept by a version of the app that wrote it differently: its words. */
  | { unreadable: string }
  | null

export function loadDraft(): KeptDraft {
  const kept = loadKept(DRAFT)
  if (!kept) return null
  return 'value' in kept
    ? { draft: kept.value }
    : { unreadable: draftWords(kept.unreadable) }
}

export const saveDraft = (d: Draft | null) => save(DRAFT, d)

/**
 * Whatever words an edit kept in a shape this version can't read holds —
 * every bit of text in it, a line each (but not what the recipe said before
 * the edit, nor ids) — so they needn't be lost.
 */
export function draftWords(x: unknown): string {
  const out: string[] = []
  const walk = (v: unknown, key = '') => {
    if (key === 'base' || key === 'recipeId' || key === 'id') return
    if (typeof v === 'string') {
      if (v.trim()) out.push(v.trim())
    } else if (Array.isArray(v)) v.forEach((e) => walk(e))
    else if (isObj(v) && typeof v.name === 'string') {
      // (A line: its amount and name together.)
      const line = [num(v.quantity), str(v.unit), v.name.trim()]
        .filter((p) => p !== undefined && p !== '')
        .join(' ')
      if (v.name.trim()) out.push(line)
    } else if (isObj(v)) for (const [k, e] of Object.entries(v)) walk(e, k)
  }
  walk(x)
  return out.join('\n')
}
