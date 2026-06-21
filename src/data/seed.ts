import type { Dataset } from './types'

// A small starter dataset so the app isn't empty on first run. Ids are stable
// strings (not random) so seed relationships line up deterministically.
export const seedData: Dataset = {
  recipes: [
    {
      id: 'r-pancakes',
      title: 'Buttermilk Pancakes',
      tags: ['breakfast', 'kid-friendly'],
      ingredients: [
        { name: 'Flour', quantity: 2, unit: 'cup' },
        { name: 'Buttermilk', quantity: 2, unit: 'cup' },
        { name: 'Eggs', quantity: 2 },
        { name: 'Butter', quantity: 3, unit: 'tbsp' },
        { name: 'Sugar', quantity: 2, unit: 'tbsp' },
        { name: 'Baking powder', quantity: 2, unit: 'tsp' },
        { name: 'Salt' },
      ],
      notes: 'Rest the batter 5 minutes before cooking.',
    },
    {
      id: 'r-tacos',
      title: 'Weeknight Beef Tacos',
      tags: ['dinner', 'mexican'],
      ingredients: [
        { name: 'Ground beef', quantity: 1, unit: 'lb' },
        { name: 'Taco shells', quantity: 8 },
        { name: 'Cheddar', quantity: 1, unit: 'cup' },
        { name: 'Lettuce', quantity: 1 },
        { name: 'Tomato', quantity: 2 },
        { name: 'Salt' },
      ],
    },
    {
      id: 'r-salad',
      title: 'House Green Salad',
      tags: ['side', 'vegetarian'],
      ingredients: [
        { name: 'Lettuce', quantity: 1 },
        { name: 'Tomato', quantity: 1 },
        { name: 'Cucumber', quantity: 1 },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      ],
    },
  ],
  meals: [
    {
      id: 'm-pancakes-bacon',
      name: 'Pancakes & Bacon',
      components: [
        { kind: 'recipe', recipeId: 'r-pancakes' },
        { kind: 'item', name: 'Bacon', quantity: 8, unit: 'slice' },
      ],
    },
    {
      id: 'm-taco-night',
      name: 'Taco Night',
      components: [
        { kind: 'recipe', recipeId: 'r-tacos' },
        { kind: 'recipe', recipeId: 'r-salad' },
      ],
    },
  ],
  plan: [
    {
      id: 'p-1',
      mealId: 'm-pancakes-bacon',
      position: 0,
      includeInIngredients: true,
    },
    {
      id: 'p-2',
      mealId: 'm-taco-night',
      position: 1,
      includeInIngredients: true,
    },
  ],
}
