import { create } from 'zustand'
import type {
  AddOn,
  Favorite,
  Person,
  Have,
  Ingredient,
  MealComponent,
  PlanMeal,
  Recipe,
  Want,
} from '../data/types'
import { favoriteKey, isWanted } from '../data/types'
import {
  enqueueDelete,
  enqueuePut,
  hydrate,
  startSync,
} from '../data/persistence'
import { newId } from '../lib/id'

const byTitle = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title)
const byPosition = (a: PlanMeal, b: PlanMeal) => a.position - b.position
const byPos = (a: AddOn, b: AddOn) => a.position - b.position

interface AppState {
  recipes: Recipe[]
  plan: PlanMeal[]
  /** Recipes wanted (and how many times): they make the Ingredients list. */
  wants: Want[]
  /** Other things wanted (Add-ons on the shopping list), in order. */
  addons: AddOn[]
  /** Ingredients on hand (ticked on the shopping list), by line key. */
  haves: Have[]
  /** Everyone's favorite recipes. */
  favorites: Favorite[]
  /** The group, by name. */
  people: Person[]
  hydrated: boolean

  init: () => Promise<void>

  // Recipes (the durable library)
  upsertRecipe: (recipe: Recipe) => void
  deleteRecipe: (id: string) => void

  // Wants
  /** Want a recipe, or not any more. Wanting it again brings back the count
   *  it had (1 the first time) — unless `count` says otherwise. */
  setWanted: (recipeId: string, wanted: boolean, count?: number) => void
  /** How many times over a wanted recipe is wanted (at least 1). */
  setWantCount: (recipeId: string, count: number) => void

  // Add-ons
  /** Add an add-on — at the end, or just after another (`after`, its id).
   *  Its id. */
  addAddOn: (item: Ingredient, after?: string) => string
  updateAddOn: (
    id: string,
    patch: Partial<Ingredient & Pick<AddOn, 'have'>>,
  ) => void
  removeAddOn: (id: string) => void
  /** Move an add-on to just before another (`before`, its id) — or last. */
  moveAddOn: (id: string, before?: string) => void

  // Haves
  /** Tick a line (having all it needs: `amount`), or untick it. */
  setHave: (
    key: string,
    have: boolean,
    amount?: number,
    line?: { name: string; unit?: string },
  ) => void
  /** Untick a line, but keep it on the list (see Have's `off`). */
  setHaveOff: (key: string) => void

  // Favorites (the signed-in person's)
  setFavorite: (userId: string, recipeId: string, on: boolean) => void

  // Plan meals (anonymous groups that live only on the plan)
  addRecipeToPlan: (recipeId: string) => void
  addEmptyMeal: () => void
  removePlanMeal: (mealId: string) => void
  togglePlanInclude: (mealId: string) => void
  /** New meal order, by id, in display order. */
  reorderPlan: (orderedIds: string[]) => void

  // Components within a meal
  /** Add several recipes/items to a meal in one write (the add sheet's Done). */
  addComponentsToMeal: (mealId: string, additions: NewComponent[]) => void
  removeComponent: (mealId: string, componentId: string) => void
}

/** A meal component before it has an id. */
export type NewComponent =
  { kind: 'recipe'; recipeId: string } | ({ kind: 'item' } & Ingredient)

/** Append a meal at the end of the plan. */
function makeMeal(components: MealComponent[], position: number): PlanMeal {
  return { id: newId(), position, includeInIngredients: true, components }
}

export const useStore = create<AppState>((set, get) => ({
  recipes: [],
  plan: [],
  wants: [],
  addons: [],
  haves: [],
  favorites: [],
  people: [],
  hydrated: false,

  init: async () => {
    if (get().hydrated) return
    // 1. Instant paint from the local cache (works offline).
    const cached = await hydrate()
    set({
      recipes: [...cached.recipes].sort(byTitle),
      plan: [...cached.plan].sort(byPosition),
      wants: cached.wants,
      addons: [...cached.addons].sort(byPos),
      haves: cached.haves,
      favorites: cached.favorites,
      people: cached.people,
      hydrated: true,
    })
    // 2. Reconcile with PocketBase + subscribe to realtime updates. Keeps the
    //    cache if we're offline.
    try {
      await startSync((data) => {
        set({
          recipes: [...data.recipes].sort(byTitle),
          plan: [...data.plan].sort(byPosition),
          wants: data.wants,
          addons: [...data.addons].sort(byPos),
          haves: data.haves,
          favorites: data.favorites,
          people: data.people,
        })
      })
    } catch {
      // Offline or sync unavailable — the cached data above still works.
    }
  },

  upsertRecipe: (recipe) => {
    set((s) => {
      const others = s.recipes.filter((r) => r.id !== recipe.id)
      return {
        recipes: [...others, recipe].sort((a, b) =>
          a.title.localeCompare(b.title),
        ),
      }
    })
    enqueuePut('recipes', recipe)
  },

  deleteRecipe: (id) => {
    // Plan components referencing this recipe become dangling refs, which the
    // aggregation and UI both handle safely (shown as "deleted recipe").
    set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }))
    enqueueDelete('recipes', id)
  },

  setWanted: (recipeId, wanted, count) => {
    const was = get().wants.find((w) => w.recipeId === recipeId)
    const n = Math.max(1, Math.round(count ?? was?.count ?? 1))
    if (was && isWanted(was) === wanted && (!wanted || was.count === n)) return
    if (!was && !wanted) return
    // (Not wanted, it keeps its count for next time.)
    const want: Want = wanted
      ? { id: recipeId, recipeId, count: n, wanted: true }
      : { ...was!, wanted: false }
    set((s) => ({
      wants: was
        ? s.wants.map((w) => (w.recipeId === recipeId ? want : w))
        : [...s.wants, want],
    }))
    enqueuePut('wants', want)
  },

  setWantCount: (recipeId, count) => {
    const n = Math.max(1, Math.round(count))
    let updated: Want | undefined
    set((s) => ({
      wants: s.wants.map((w) => {
        if (w.recipeId !== recipeId || !isWanted(w) || w.count === n) return w
        updated = { ...w, count: n }
        return updated
      }),
    }))
    if (updated) enqueuePut('wants', updated)
  },

  addAddOn: (item, after) => {
    const addons = get().addons
    const i = after === undefined ? -1 : addons.findIndex((a) => a.id === after)
    const last = addons.length ? addons[addons.length - 1].position : -1
    // Just after `after`: halfway to the one after it (or one on, at the end).
    const position =
      i < 0
        ? last + 1
        : i + 1 < addons.length
          ? (addons[i].position + addons[i + 1].position) / 2
          : addons[i].position + 1
    const addon: AddOn = { ...item, id: newId(), position }
    set({ addons: [...addons, addon].sort(byPos) })
    enqueuePut('addons', addon)
    return addon.id
  },

  updateAddOn: (id, patch) => {
    let updated: AddOn | undefined
    set((s) => ({
      addons: s.addons.map((a) => {
        if (a.id !== id) return a
        updated = { ...a, ...patch }
        return updated
      }),
    }))
    if (updated) enqueuePut('addons', updated)
  },

  removeAddOn: (id) => {
    set((s) => ({ addons: s.addons.filter((a) => a.id !== id) }))
    enqueueDelete('addons', id)
  },

  moveAddOn: (id, before) => {
    const addons = get().addons
    const moving = addons.find((a) => a.id === id)
    if (!moving || before === id) return
    const others = addons.filter((a) => a.id !== id)
    const at = before === undefined ? others.length : others.findIndex((a) => a.id === before)
    if (at < 0) return
    const prev = others[at - 1]?.position
    const next = others[at]?.position
    const position =
      prev === undefined
        ? next === undefined
          ? 0
          : next - 1
        : next === undefined
          ? prev + 1
          : (prev + next) / 2
    // (Halved too often to tell apart: all of them renumbered, in order.)
    if (prev !== undefined && next !== undefined && next - prev < 1e-9) {
      const order = [...others.slice(0, at), moving, ...others.slice(at)]
      const renumbered = order.map((a, k) => ({ ...a, position: k }))
      set({ addons: renumbered })
      renumbered.forEach((a) => enqueuePut('addons', a))
      return
    }
    const moved = { ...moving, position }
    set({ addons: [...others, moved].sort(byPos) })
    enqueuePut('addons', moved)
  },

  setHave: (key, have, amount, line) => {
    const was = get().haves.find((h) => h.id === key)
    if (have) {
      const row: Have = { id: key, amount, ...line }
      set((s) => ({
        haves: was
          ? s.haves.map((h) => (h.id === key ? row : h))
          : [...s.haves, row],
      }))
      enqueuePut('haves', row)
    } else if (was) {
      set((s) => ({ haves: s.haves.filter((h) => h.id !== key) }))
      enqueueDelete('haves', key)
    }
  },

  setHaveOff: (key) => {
    const was = get().haves.find((h) => h.id === key)
    if (!was || was.off) return
    const row: Have = { ...was, off: true }
    set((s) => ({ haves: s.haves.map((h) => (h.id === key ? row : h)) }))
    enqueuePut('haves', row)
  },

  setFavorite: (userId, recipeId, on) => {
    const id = favoriteKey(userId, recipeId)
    const has = get().favorites.some((f) => f.id === id)
    if (on === has) return
    if (on) {
      const fav: Favorite = { id, recipeId }
      set((s) => ({ favorites: [...s.favorites, fav] }))
      enqueuePut('favorites', fav)
    } else {
      set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) }))
      enqueueDelete('favorites', id)
    }
  },

  addRecipeToPlan: (recipeId) => {
    const meal = makeMeal(
      [{ id: newId(), kind: 'recipe', recipeId }],
      get().plan.length,
    )
    set((s) => ({ plan: [...s.plan, meal] }))
    enqueuePut('plan', meal)
  },

  addEmptyMeal: () => {
    const meal = makeMeal([], get().plan.length)
    set((s) => ({ plan: [...s.plan, meal] }))
    enqueuePut('plan', meal)
  },

  removePlanMeal: (mealId) => {
    const renumbered = get()
      .plan.filter((m) => m.id !== mealId)
      .sort((a, b) => a.position - b.position)
      .map((m, i) => ({ ...m, position: i }))
    set({ plan: renumbered })
    enqueueDelete('plan', mealId)
    renumbered.forEach((m) => enqueuePut('plan', m))
  },

  togglePlanInclude: (mealId) => {
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = { ...m, includeInIngredients: !m.includeInIngredients }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },

  reorderPlan: (orderedIds) => {
    const byId = new Map(get().plan.map((m) => [m.id, m]))
    const renumbered = orderedIds
      .map((id, i) => {
        const meal = byId.get(id)
        return meal ? { ...meal, position: i } : undefined
      })
      .filter((m): m is PlanMeal => m !== undefined)
    set({ plan: renumbered })
    renumbered.forEach((m) => enqueuePut('plan', m))
  },

  addComponentsToMeal: (mealId, additions) => {
    if (additions.length === 0) return
    const components = additions.map(
      (a) => ({ ...a, id: newId() }) as MealComponent,
    )
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = { ...m, components: [...m.components, ...components] }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },

  removeComponent: (mealId, componentId) => {
    let updated: PlanMeal | undefined
    set((s) => ({
      plan: s.plan.map((m) => {
        if (m.id !== mealId) return m
        updated = {
          ...m,
          components: m.components.filter((c) => c.id !== componentId),
        }
        return updated
      }),
    }))
    if (updated) enqueuePut('plan', updated)
  },
}))
