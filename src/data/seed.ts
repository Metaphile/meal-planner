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
    // Longer family-style recipes (lots of ingredients + step-by-step notes),
    // handy for exercising scrolling cards.
    {
      id: 'r-lasagna',
      title: 'Grandma’s Sunday Lasagna',
      tags: ['dinner', 'italian', 'make-ahead'],
      ingredients: [
        { name: 'Lasagna noodles', quantity: 12 },
        { name: 'Ground beef', quantity: 1, unit: 'lb' },
        { name: 'Italian sausage', quantity: 0.5, unit: 'lb' },
        { name: 'Onion', quantity: 1 },
        { name: 'Garlic', quantity: 4, unit: 'clove' },
        { name: 'Crushed tomatoes', quantity: 28, unit: 'oz' },
        { name: 'Tomato paste', quantity: 6, unit: 'oz' },
        { name: 'Basil', quantity: 2, unit: 'tbsp' },
        { name: 'Oregano', quantity: 1, unit: 'tsp' },
        { name: 'Sugar', quantity: 1, unit: 'tbsp' },
        { name: 'Ricotta', quantity: 15, unit: 'oz' },
        { name: 'Eggs', quantity: 1 },
        { name: 'Parmesan', quantity: 0.75, unit: 'cup' },
        { name: 'Mozzarella', quantity: 1, unit: 'lb' },
        { name: 'Parsley', quantity: 0.25, unit: 'cup' },
        { name: 'Salt' },
        { name: 'Pepper' },
      ],
      notes:
        'Brown the beef and sausage with the onion. Add garlic for the last minute.\n\n' +
        'Stir in crushed tomatoes, paste, sugar, basil and oregano. Simmer, partly covered, for at least an hour — longer is better.\n\n' +
        'Boil the noodles until just shy of tender; rinse and lay flat on oiled foil.\n\n' +
        'Mix ricotta, egg, half the parmesan and the parsley.\n\n' +
        'Layer in a 9×13: sauce, noodles, ricotta, mozzarella. Repeat twice more, then finish with noodles, sauce, mozzarella and the rest of the parmesan.\n\n' +
        'Cover with foil (tent it so it doesn’t touch the cheese) and bake at 375°F for 25 minutes. Uncover and bake 25 more, until bubbling and browned.\n\n' +
        'Rest at least 15 minutes before cutting. Even better the next day.',
    },
    {
      id: 'r-potpie',
      title: 'Chicken Pot Pie',
      tags: ['dinner', 'comfort'],
      ingredients: [
        { name: 'Chicken breast', quantity: 1.5, unit: 'lb' },
        { name: 'Butter', quantity: 6, unit: 'tbsp' },
        { name: 'Onion', quantity: 1 },
        { name: 'Carrot', quantity: 2 },
        { name: 'Celery', quantity: 2, unit: 'stalk' },
        { name: 'Frozen peas', quantity: 1, unit: 'cup' },
        { name: 'Flour', quantity: 0.33, unit: 'cup' },
        { name: 'Chicken broth', quantity: 1.75, unit: 'cup' },
        { name: 'Milk', quantity: 0.66, unit: 'cup' },
        { name: 'Thyme', quantity: 1, unit: 'tsp' },
        { name: 'Pie crust', quantity: 2 },
        { name: 'Eggs', quantity: 1 },
        { name: 'Salt' },
        { name: 'Pepper' },
      ],
      notes:
        'Poach the chicken in salted water 15 minutes; cool and dice.\n\n' +
        'Melt butter, soften onion, carrot and celery (8 minutes). Stir in flour and cook 1 minute.\n\n' +
        'Whisk in broth and milk; simmer until thick. Season with thyme, salt and pepper. Fold in chicken and peas.\n\n' +
        'Line a pie dish with one crust, fill, top with the second crust. Crimp, cut vents, brush with beaten egg.\n\n' +
        'Bake at 425°F for 30–35 minutes until deep golden. Rest 10 minutes.',
    },
    {
      id: 'r-cookies',
      title: 'Chocolate Chip Cookies',
      tags: ['dessert', 'baking', 'kid-friendly'],
      ingredients: [
        { name: 'Butter', quantity: 1, unit: 'cup' },
        { name: 'Brown sugar', quantity: 1, unit: 'cup' },
        { name: 'Sugar', quantity: 0.5, unit: 'cup' },
        { name: 'Eggs', quantity: 2 },
        { name: 'Vanilla', quantity: 2, unit: 'tsp' },
        { name: 'Flour', quantity: 2.25, unit: 'cup' },
        { name: 'Baking soda', quantity: 1, unit: 'tsp' },
        { name: 'Salt', quantity: 1, unit: 'tsp' },
        { name: 'Chocolate chips', quantity: 2, unit: 'cup' },
        { name: 'Flaky salt' },
      ],
      notes:
        'Brown the butter and let it cool until just warm.\n\n' +
        'Whisk in both sugars, then the eggs and vanilla until glossy.\n\n' +
        'Fold in flour, soda and salt; stir in chips. Chill the dough at least an hour (overnight is best).\n\n' +
        'Scoop 2-tbsp balls onto a lined sheet. Bake at 350°F for 10–12 minutes — pull them while the centers look underdone.\n\n' +
        'Sprinkle with flaky salt. Cool 5 minutes on the sheet.',
    },
    {
      id: 'r-stew',
      title: 'Beef & Barley Stew',
      tags: ['dinner', 'soup', 'slow-cooker'],
      ingredients: [
        { name: 'Beef chuck', quantity: 2, unit: 'lb' },
        { name: 'Flour', quantity: 2, unit: 'tbsp' },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
        { name: 'Onion', quantity: 2 },
        { name: 'Carrot', quantity: 4 },
        { name: 'Celery', quantity: 3, unit: 'stalk' },
        { name: 'Garlic', quantity: 3, unit: 'clove' },
        { name: 'Tomato paste', quantity: 2, unit: 'tbsp' },
        { name: 'Beef broth', quantity: 8, unit: 'cup' },
        { name: 'Pearl barley', quantity: 0.75, unit: 'cup' },
        { name: 'Potatoes', quantity: 3 },
        { name: 'Bay leaves', quantity: 2 },
        { name: 'Thyme', quantity: 1, unit: 'tsp' },
        { name: 'Worcestershire', quantity: 1, unit: 'tbsp' },
        { name: 'Salt' },
        { name: 'Pepper' },
      ],
      notes:
        'Cube and dry the beef; toss with flour, salt and pepper. Brown in batches in hot oil.\n\n' +
        'Soften onion, carrot and celery in the same pot. Add garlic and tomato paste for 2 minutes.\n\n' +
        'Return the beef, add broth, bay, thyme and Worcestershire. Simmer covered 1½ hours.\n\n' +
        'Add barley and potatoes; simmer 40 minutes more until the barley is tender.\n\n' +
        'Slow cooker: everything but barley on low 7 hours, barley for the last hour.',
    },
    {
      id: 'r-shepherds',
      title: 'Shepherd’s Pie',
      tags: ['dinner', 'comfort', 'make-ahead'],
      ingredients: [
        { name: 'Ground lamb', quantity: 1.5, unit: 'lb' },
        { name: 'Onion', quantity: 1 },
        { name: 'Carrot', quantity: 2 },
        { name: 'Frozen peas', quantity: 1, unit: 'cup' },
        { name: 'Tomato paste', quantity: 2, unit: 'tbsp' },
        { name: 'Worcestershire', quantity: 1, unit: 'tbsp' },
        { name: 'Beef broth', quantity: 1, unit: 'cup' },
        { name: 'Rosemary', quantity: 1, unit: 'tsp' },
        { name: 'Potatoes', quantity: 2.5, unit: 'lb' },
        { name: 'Butter', quantity: 4, unit: 'tbsp' },
        { name: 'Milk', quantity: 0.5, unit: 'cup' },
        { name: 'Cheddar', quantity: 1, unit: 'cup' },
      ],
      notes:
        'Boil the potatoes until soft; mash with butter, milk, salt and half the cheddar.\n\n' +
        'Brown the lamb with onion and carrot. Stir in tomato paste, Worcestershire, rosemary and broth; simmer 10 minutes until thick. Add peas.\n\n' +
        'Spread the filling in a baking dish, top with the mash, rough it up with a fork, scatter the rest of the cheddar.\n\n' +
        'Bake at 400°F for 25 minutes, then broil 2 minutes to brown.',
    },
  ],
  // Nothing wanted yet: tick Want on a card.
  wants: [],
  addons: [],
  haves: [],
  favorites: [],
  people: [],
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
