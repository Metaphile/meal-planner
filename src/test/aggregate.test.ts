import { describe, expect, it } from 'vitest'
import { aggregateIngredients } from '../data/aggregate'
import type { Meal, PlanEntry, Recipe } from '../data/types'

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
]

const meals: Meal[] = [
  {
    id: 'm-breakfast',
    name: 'Pancakes & Bacon',
    components: [
      { kind: 'recipe', recipeId: 'r-pancakes' },
      { kind: 'item', name: 'Bacon', quantity: 6, unit: 'slice' }, // simple item
    ],
  },
  {
    id: 'm-tacos',
    name: 'Taco Night',
    components: [{ kind: 'recipe', recipeId: 'r-tacos' }],
  },
]

const entry = (over: Partial<PlanEntry>): PlanEntry => ({
  id: 'p-' + Math.random(),
  mealId: 'm-breakfast',
  position: 0,
  includeInIngredients: true,
  ...over,
})

describe('aggregateIngredients', () => {
  it('merges same name + unit across recipe and simple-item sources', () => {
    const out = aggregateIngredients([entry({})], meals, recipes)
    // recipe bacon (2 slice) + simple-item bacon (6 slice) => 8 slice
    const bacon = out.find((i) => i.name === 'Bacon')
    expect(bacon).toEqual({
      name: 'Bacon',
      unit: 'slice',
      quantity: 8,
      meals: ['Pancakes & Bacon'],
    })
  })

  it('keeps same name with different units as separate lines', () => {
    const out = aggregateIngredients(
      [entry({ mealId: 'm-tacos' })],
      meals,
      recipes,
    )
    const flours = out.filter((i) => i.name === 'Flour')
    expect(flours).toHaveLength(2)
    expect(flours).toEqual(
      expect.arrayContaining([
        { name: 'Flour', unit: 'cup', quantity: 1, meals: ['Taco Night'] },
        { name: 'Flour', unit: 'g', quantity: 200, meals: ['Taco Night'] },
      ]),
    )
  })

  it('reports no quantity when no contributing line had one', () => {
    const out = aggregateIngredients([entry({})], meals, recipes)
    const salt = out.find((i) => i.name === 'Salt')
    expect(salt).toEqual({
      name: 'Salt',
      unit: undefined,
      quantity: undefined,
      meals: ['Pancakes & Bacon'],
    })
  })

  it('skips entries excluded from the ingredients list', () => {
    const out = aggregateIngredients(
      [entry({ includeInIngredients: false })],
      meals,
      recipes,
    )
    expect(out).toEqual([])
  })

  it('skips missing meal and recipe references safely', () => {
    const out = aggregateIngredients(
      [entry({ mealId: 'does-not-exist' })],
      meals,
      recipes,
    )
    expect(out).toEqual([])

    const orphanMeal: Meal = {
      id: 'm-x',
      name: 'X',
      components: [{ kind: 'recipe', recipeId: 'gone' }],
    }
    const out2 = aggregateIngredients(
      [entry({ mealId: 'm-x' })],
      [orphanMeal],
      recipes,
    )
    expect(out2).toEqual([])
  })

  it('sums quantities across multiple included meals and sorts by name', () => {
    const out = aggregateIngredients(
      [
        entry({ id: 'a', mealId: 'm-breakfast', position: 0 }),
        entry({ id: 'b', mealId: 'm-tacos', position: 1 }),
      ],
      meals,
      recipes,
    )
    // Flour: pancakes 2 cup + tacos 1 cup => 3 cup, plus tacos 200 g separately
    const flourCup = out.find((i) => i.name === 'Flour' && i.unit === 'cup')
    expect(flourCup?.quantity).toBe(3)
    // ...and it's tagged with both contributing meals, sorted.
    expect(flourCup?.meals).toEqual(['Pancakes & Bacon', 'Taco Night'])

    const names = out.map((i) => i.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('tags a line with a meal only once even when planned multiple times', () => {
    const out = aggregateIngredients(
      [
        entry({ id: 'a', mealId: 'm-tacos', position: 0 }),
        entry({ id: 'b', mealId: 'm-tacos', position: 1 }),
      ],
      meals,
      recipes,
    )
    const flourCup = out.find((i) => i.name === 'Flour' && i.unit === 'cup')
    // Quantity sums across both entries, but the meal tag is deduped.
    expect(flourCup?.quantity).toBe(2)
    expect(flourCup?.meals).toEqual(['Taco Night'])
  })
})
