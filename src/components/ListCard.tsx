import { forwardRef, type HTMLAttributes } from 'react'
import { useWantedIngredients } from '../store/selectors'
import { AddOnsList } from './AddOnsList'
import { IngredientsList } from './IngredientsList'
import { ReconcileButton } from './Reconcile'
import { CARD_H } from './RecipeCard'

/**
 * The shopping list: a card at the back of the recipe box — scratch work,
 * written by hand like the back of a card being edited — with everything
 * the wanted recipes call for (each as many times over as it's wanted),
 * added up — ticked off as it's on hand — then Add-ons: anything else
 * wanted, written in by hand.
 *
 * It's not in the box, nor taken out like a card: it's a sheet waiting
 * just below the screen, the top of it peeking over the bottom edge; turned
 * to the end of the box, scrolling on slides it up (see RecipesPage), and
 * it's worked on right there.
 */

/** The box on a recipe card (empty, to be ticked), drawn inline in the
 *  text. */
export function WantBoxPicture() {
  return (
    <span
      role="img"
      aria-label="the box on a recipe card"
      className="mx-0.5 inline-block h-[18px] w-[18px] rounded-[4px] border-[1.5px] border-[#c9bda4] bg-paper align-[-3px]"
    />
  )
}

type Props = { canEdit: boolean } & HTMLAttributes<HTMLDivElement>

export const ListCard = forwardRef<HTMLDivElement, Props>(function ListCard(
  { canEdit, className = '', style, ...rest },
  ref,
) {
  const ingredients = useWantedIngredients()
  return (
    <div
      ref={ref}
      {...rest}
      className={`paper-card rolodex-card relative flex flex-col text-left ${className}`}
      style={{ minHeight: CARD_H, ...style }}
    >
      {/* Scratch work, written by hand — like the back of a card (no frame,
          the title underlined in the same pen). */}
      <div className="handwritten relative flex flex-1 flex-col">
        <div className="mx-5 mt-3.5 border-b-[1.5px] border-pen pb-0.5 text-[32px] font-semibold leading-[32px]">
          Shopping list
        </div>
        <div className="mx-5 mt-2 mb-4 flex flex-col gap-4">
          <IngredientsList
            ingredients={ingredients}
            checkable
            canEdit={canEdit}
            bare
            empty={
              <>
                Tick <WantBoxPicture /> to include that recipe’s ingredients.
              </>
            }
          />
          <div>
            <span className="block text-[26px] font-semibold leading-[30px]">
              Add-ons
            </span>
            <AddOnsList canEdit={canEdit} bare />
            <ReconcileButton ingredients={ingredients} canEdit={canEdit} />
          </div>
        </div>
      </div>
      <span className="rolodex-dim" />
    </div>
  )
})
