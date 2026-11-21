import { PageHeader } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import { useWantedIngredients } from '../store/selectors'

/**
 * Ingredients: everything the wanted recipes call for (each as many times
 * over as it's wanted), added up — on a notepad sheet. Read only; recipes
 * are wanted (and how many times) on their cards.
 */
/** The box on a recipe card (empty, to be ticked), drawn inline in the
 *  text. */
function WantBoxPicture() {
  return (
    <span
      role="img"
      aria-label="the box on a recipe card"
      className="mx-0.5 inline-block h-[18px] w-[18px] rounded-[4px] border-[1.5px] border-[#c9bda4] bg-paper align-[-3px]"
    />
  )
}

export default function IngredientsPage() {
  const ingredients = useWantedIngredients()
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ingredients" />
      <div className="scroll-y flex-1 px-4 pt-3 pb-6">
        <IngredientsList
          ingredients={ingredients}
          empty={
            <>
              Tick <WantBoxPicture /> to include that recipe’s ingredients.
            </>
          }
        />
      </div>
    </div>
  )
}
