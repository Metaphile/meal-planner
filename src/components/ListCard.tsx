import { forwardRef, type HTMLAttributes } from 'react'
import { useWantedIngredients } from '../store/selectors'
import { AddOnsList } from './AddOnsList'
import { IngredientsList } from './IngredientsList'
import { CARD_H } from './RecipeCard'

/**
 * The shopping list: a card at the back of the recipe box with everything
 * the wanted recipes call for (each as many times over as it's wanted),
 * added up — ticked off as it's on hand — then Add-ons: anything else
 * wanted, written in by hand. (What the Ingredients tab shows.)
 *
 * It's not taken out: it's worked on right there in the box. Turned all the
 * way to the back, it stands facing you, and scrolling on carries on down it
 * (see RecipesPage).
 */

/** Its key in the box. */
export const LIST_KEY = 'list'

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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="paper-frame" />
        <div className="px-5 pt-3.5">
          <div className="paper-rule pb-1.5">
            <div className="font-hand text-center text-[28px] font-semibold leading-[25px] text-black">
              Shopping list
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-4 pt-1 pb-4">
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
          <div className="font-hand mt-4 border-b border-line-blue pb-0.5 text-[25px] font-semibold leading-[26px] text-[#8a8170]">
            Add-ons
          </div>
          <AddOnsList canEdit={canEdit} bare />
        </div>
      </div>
      <span className="rolodex-dim" />
    </div>
  )
})
