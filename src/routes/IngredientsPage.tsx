import { PageHeader } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import { useWantedIngredients } from '../store/selectors'

/**
 * Ingredients: everything the wanted recipes call for (each as many times
 * over as it's wanted), added up — on a notepad sheet. Read only; recipes
 * are wanted (and how many times) on their cards.
 */
export default function IngredientsPage() {
  const ingredients = useWantedIngredients()
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ingredients" />
      <div className="scroll-y flex-1 px-4 pt-3 pb-6">
        <IngredientsList
          ingredients={ingredients}
          empty="Tick Want on a recipe to see what it needs."
        />
      </div>
    </div>
  )
}
