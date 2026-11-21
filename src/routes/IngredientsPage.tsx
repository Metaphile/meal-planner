import { PageHeader } from '../components/ui'
import { IngredientsList } from '../components/IngredientsList'
import { useWantedIngredients } from '../store/selectors'
import { AddOnsList } from '../components/AddOnsList'
import { useAuth } from '../auth/AuthProvider'

/**
 * Ingredients: everything the wanted recipes call for (each as many times
 * over as it's wanted), added up — on a notepad sheet (read only; recipes
 * are wanted, and how many times, on their cards). Then Add-ons: anything
 * else wanted, written in by hand.
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
  const { hasCapability } = useAuth()
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ingredients" />
      <div className="scroll-y flex-1 px-4 pt-3 pb-6">
        <IngredientsList
          ingredients={ingredients}
          checkable
          canEdit={hasCapability('edit_plan')}
          empty={
            <>
              Tick <WantBoxPicture /> to include that recipe’s ingredients.
            </>
          }
        />

        {/* Add-ons: anything else, jotted on a sheet of its own, behind a
            divider tab. */}
        <div className="relative mt-7 h-[30px]">
          <span className="paper-serif absolute bottom-[-1px] left-[18px] z-[1] rounded-t-lg border border-b-0 border-kraft-edge bg-kraft px-3 pt-1 pb-[5px] text-sm font-semibold text-kraft-ink">
            Add-ons
          </span>
        </div>
        <div className="kraft-pocket rounded-tl-none p-2">
          <AddOnsList canEdit={hasCapability('edit_plan')} />
        </div>
      </div>
    </div>
  )
}
