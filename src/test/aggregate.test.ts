import { describe, expect, it } from 'vitest'
import { aggregateIngredients, aggregateWanted } from '../data/aggregate'
import type { MealComponent, PlanMeal, Recipe, Want } from '../data/types'

const recipes: Recipe[] = [
  {
    id: 'r-pancakes',
    title: 'Pancakes',
    tags: [],
    ingredients: [
      { name: 'Flour', quantity: 2, unit: 'cup' },
      { name: 'Bacon', quantity: 2, unit: 'slice' }, // recipe also uses bacon
      { name: 'Salt' }, // no quantity
    ],
  },
  {
    id: 'r-tacos',
    title: 'Tacos',
    tags: [],
    ingredients: [
      { name: 'Flour', quantity: 1, unit: 'cup' },
      { name: 'Flour', quantity: 200, unit: 'g' }, // same name, different unit
      { name: 'Salt' },
    ],
  },
  {
    id: 'r-casserole',
    title: 'Broccoli Casserole',
    tags: [],
    ingredients: [
      { name: 'Broccoli', quantity: 1, unit: 'cup' },
      { name: 'Cheese', quantity: 1, unit: 'cup' },
    ],
  },
]

let cid = 0
const rc = (recipeId: string): MealComponent => ({
  id: `c${cid++}`,
  kind: 'recipe',
  recipeId,
})
const item = (name: string, quantity?: number, unit?: string): MealComponent => ({
  id: `c${cid++}`,
  kind: 'item',
  name,
  quantity,
  unit,
})

let mid = 0
const meal = (components: MealComponent[], include = true): PlanMeal => ({
  id: `m${mid++}`,
  position: 0,
  includeInIngredients: include,
  components,
})

describe('aggregateIngredients', () => {
  it('merges same name + unit across recipe and item sources, tagging both', () => {
    const out = aggregateIngredients(
      [meal([rc('r-pancakes'), item('Bacon', 6, 'slice')])],
      recipes,
    )
    // recipe bacon (2 slice) + item bacon (6 slice) => 8 slice, tagged by both
    const bacon = out.find((i) => i.name === 'Bacon')
    expect(bacon).toEqual({
      name: 'Bacon',
      unit: 'slice',
      quantity: 8,
      sources: ['Bacon', 'Pancakes'],
    })
  })

  it('keeps same name with different units as separate lines', () => {
    const out = aggregateIngredients([meal([rc('r-tacos')])], recipes)
    const flours = out.filter((i) => i.name === 'Flour')
    expect(flours).toHaveLength(2)
    expect(flours).toEqual(
      expect.arrayContaining([
        { name: 'Flour', unit: 'cup', quantity: 1, sources: ['Tacos'] },
        { name: 'Flour', unit: 'g', quantity: 200, sources: ['Tacos'] },
      ]),
    )
  })

  it('reports no quantity when no contributing line had one', () => {
    const out = aggregateIngredients([meal([rc('r-pancakes')])], recipes)
    const salt = out.find((i) => i.name === 'Salt')
    expect(salt).toEqual({
      name: 'Salt',
      unit: undefined,
      quantity: undefined,
      sources: ['Pancakes'],
    })
  })

  it('tags by recipe title; standalone item by its own name (broccoli case)', () => {
    const out = aggregateIngredients(
      [meal([rc('r-casserole'), item('broccoli', 1, 'cup')])],
      recipes,
    )
    const broccoli = out.find((i) => i.name === 'Broccoli')
    expect(broccoli?.quantity).toBe(2)
    expect(broccoli?.unit).toBe('cup')
    expect(broccoli?.sources).toHaveLength(2)
    expect(broccoli?.sources).toEqual(
      expect.arrayContaining(['Broccoli Casserole', 'broccoli']),
    )
  })

  it('suppresses a lone self-referential item tag', () => {
    const out = aggregateIngredients(
      [meal([item('Garlic bread', 4, 'slice')])],
      recipes,
    )
    const gb = out.find((i) => i.name === 'Garlic bread')
    expect(gb).toEqual({
      name: 'Garlic bread',
      unit: 'slice',
      quantity: 4,
      sources: [],
    })
  })

  it('skips excluded meals and missing recipe refs safely', () => {
    expect(
      aggregateIngredients([meal([rc('r-pancakes')], false)], recipes),
    ).toEqual([])
    expect(aggregateIngredients([meal([rc('gone')])], recipes)).toEqual([])
  })

  it('sums across meals, de-dupes sources, and sorts by name', () => {
    const out = aggregateIngredients(
      [meal([rc('r-pancakes')]), meal([rc('r-pancakes')])],
      recipes,
    )
    const flour = out.find((i) => i.name === 'Flour' && i.unit === 'cup')
    expect(flour?.quantity).toBe(4)
    expect(flour?.sources).toEqual(['Pancakes']) // deduped, not ['Pancakes','Pancakes']

    const names = out.map((i) => i.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe('aggregateWanted', () => {
  it('sums the wanted recipes, each as many times over as wanted', () => {
    const wants: Want[] = [
      { id: 'r-pancakes', recipeId: 'r-pancakes', count: 2 },
      { id: 'r-tacos', recipeId: 'r-tacos', count: 1 },
    ]
    const out = aggregateWanted(wants, recipes)
    const flourCup = out.find((l) => l.name === 'Flour' && l.unit === 'cup')
    expect(flourCup?.quantity).toBe(2 * 2 + 1) // pancakes ×2 + tacos
    expect(flourCup?.sources).toEqual(['Pancakes ×2', 'Tacos'])
    expect(out.find((l) => l.name === 'Flour' && l.unit === 'g')?.quantity).toBe(200)
    expect(out.find((l) => l.name === 'Bacon')?.quantity).toBe(4)
    // No quantity stays no quantity, however many times over.
    expect(out.find((l) => l.name === 'Salt')?.quantity).toBeUndefined()
  })

  it('leaves out wants not wanted just now (whatever count they keep)', () => {
    const out = aggregateWanted(
      [
        { id: 'r-pancakes', recipeId: 'r-pancakes', count: 3, wanted: false },
        { id: 'r-casserole', recipeId: 'r-casserole', count: 2, wanted: true },
      ],
      recipes,
    )
    expect(out.map((l) => l.name)).toEqual(['Broccoli', 'Cheese'])
    expect(out[0].quantity).toBe(2)
  })

  it('skips wants whose recipe is gone, and is empty with nothing wanted', () => {
    expect(aggregateWanted([], recipes)).toEqual([])
    expect(
      aggregateWanted([{ id: 'gone', recipeId: 'gone', count: 3 }], recipes),
    ).toEqual([])
  })

  it('counts every section of a recipe, not just the first', () => {
    const crumble: Recipe = {
      id: 'r-crumble',
      title: 'Crumble',
      tags: [],
      ingredients: [{ name: 'Apples', quantity: 4 }],
      sections: [
        {
          title: 'Topping',
          ingredients: [
            { name: 'Flour', quantity: 1, unit: 'cup' },
            { name: 'Brown sugar', quantity: 2, unit: 'heaping tbsp' },
          ],
        },
      ],
    }
    const out = aggregateWanted(
      [{ id: 'r-crumble', recipeId: 'r-crumble', count: 2 }],
      [crumble],
    )
    expect(out.map((l) => [l.name, l.quantity, l.unit])).toEqual([
      ['Apples', 8, undefined],
      ['Brown sugar', 4, 'heaping tbsp'],
      ['Flour', 2, 'cup'],
    ])
  })
})
