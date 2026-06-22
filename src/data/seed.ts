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
    {
      id: 'r-spaghetti',
      title: 'Spaghetti Bolognese',
      tags: ['dinner', 'italian'],
      ingredients: [
        { name: 'Spaghetti', quantity: 1, unit: 'lb' },
        { name: 'Ground beef', quantity: 1, unit: 'lb' },
        { name: 'Tomato', quantity: 3 },
        { name: 'Onion', quantity: 1 },
        { name: 'Garlic', quantity: 3, unit: 'clove' },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
        { name: 'Parmesan', quantity: 0.5, unit: 'cup' },
        { name: 'Salt' },
      ],
    },
    {
      id: 'r-stirfry',
      title: 'Chicken Stir-Fry',
      tags: ['dinner', 'quick'],
      ingredients: [
        { name: 'Chicken breast', quantity: 1, unit: 'lb' },
        { name: 'Bell pepper', quantity: 2 },
        { name: 'Broccoli', quantity: 1 },
        { name: 'Soy sauce', quantity: 3, unit: 'tbsp' },
        { name: 'Rice', quantity: 2, unit: 'cup' },
        { name: 'Garlic', quantity: 2, unit: 'clove' },
      ],
      notes: 'Cook the rice first so everything finishes together.',
    },
    {
      id: 'r-grilledcheese',
      title: 'Grilled Cheese',
      tags: ['lunch', 'kid-friendly'],
      ingredients: [
        { name: 'Bread', quantity: 2, unit: 'slice' },
        { name: 'Cheddar', quantity: 2, unit: 'slice' },
        { name: 'Butter', quantity: 1, unit: 'tbsp' },
      ],
    },
    {
      id: 'r-parfait',
      title: 'Greek Yogurt Parfait',
      tags: ['breakfast', 'vegetarian'],
      ingredients: [
        { name: 'Greek yogurt', quantity: 1, unit: 'cup' },
        { name: 'Granola', quantity: 0.5, unit: 'cup' },
        { name: 'Honey', quantity: 1, unit: 'tbsp' },
        { name: 'Blueberries', quantity: 0.5, unit: 'cup' },
      ],
    },
    {
      id: 'r-roastedveg',
      title: 'Roasted Vegetables',
      tags: ['side', 'vegetarian'],
      ingredients: [
        { name: 'Broccoli', quantity: 1 },
        { name: 'Carrot', quantity: 3 },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
        { name: 'Salt' },
      ],
    },
  ],
  // The plan is a flat list of anonymous meals; each meal groups components
  // (recipe refs and/or simple items). A single recipe can be its own meal.
  plan: [
    {
      id: 'pm-1',
      position: 0,
      includeInIngredients: true,
      components: [{ id: 'c-1', kind: 'recipe', recipeId: 'r-stirfry' }],
    },
    {
      id: 'pm-2',
      position: 1,
      includeInIngredients: true,
      components: [
        { id: 'c-2', kind: 'recipe', recipeId: 'r-tacos' },
        { id: 'c-3', kind: 'recipe', recipeId: 'r-salad' },
        { id: 'c-4', kind: 'item', name: 'Tortilla chips', quantity: 1, unit: 'bag' },
      ],
    },
  ],
}
