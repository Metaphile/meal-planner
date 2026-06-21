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
    {
      id: 'm-spaghetti-night',
      name: 'Spaghetti Night',
      components: [
        { kind: 'recipe', recipeId: 'r-spaghetti' },
        { kind: 'recipe', recipeId: 'r-salad' },
        { kind: 'item', name: 'Garlic bread', quantity: 4, unit: 'slice' },
      ],
    },
    {
      id: 'm-stir-fry',
      name: 'Stir-Fry Dinner',
      components: [
        { kind: 'recipe', recipeId: 'r-stirfry' },
        { kind: 'item', name: 'Edamame', quantity: 1, unit: 'cup' },
      ],
    },
    {
      id: 'm-grilled-cheese-lunch',
      name: 'Grilled Cheese & Soup',
      components: [
        { kind: 'recipe', recipeId: 'r-grilledcheese' },
        { kind: 'item', name: 'Tomato soup', quantity: 2, unit: 'cup' },
      ],
    },
    {
      id: 'm-big-breakfast',
      name: 'Big Breakfast',
      components: [
        { kind: 'recipe', recipeId: 'r-pancakes' },
        { kind: 'item', name: 'Bacon', quantity: 6, unit: 'slice' },
        { kind: 'item', name: 'Orange juice', quantity: 2, unit: 'cup' },
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
