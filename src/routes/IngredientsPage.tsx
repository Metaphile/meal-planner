import { PageHeader } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import { useWantedIngredients } from '../store/selectors'

/**
 * Ingredients: everything the wanted recipes call for (each as many times
 * over as it's wanted), added up — on a notepad sheet. Read only; recipes
 * are wanted (and how many times) on their cards.
 */
/** The box on a recipe card, ticked, drawn inline in the text. */
function WantBoxPicture() {
  return (
    <span
      role="img"
      aria-label="the box on a recipe card"
      className="mx-0.5 inline-grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] border-kraft-edge bg-kraft align-[-3px] not-italic"
    >
      <svg
        viewBox="0 0 12 12"
        className="h-3 w-3 text-kraft-ink"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 6.2 5 8.5l4.5-5" />
      </svg>
    </span>
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
