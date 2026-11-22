import { forwardRef, useLayoutEffect, useRef, type HTMLAttributes } from 'react'
import type { Recipe } from '../data/types'
import { useWantedIngredients } from '../store/selectors'
import { AddOnsList } from './AddOnsList'
import { IngredientsList } from './IngredientsList'
import { CARD_H } from './RecipeCard'

/**
 * The list: a card at the back of the recipe box with everything the wanted
 * recipes call for (each as many times over as it's wanted), added up —
 * ticked off as it's on hand — then Add-ons: anything else wanted, written
 * in by hand. (What the Ingredients tab shows.) Taken out, it's in hand like
 * any recipe card: scrolled, pulled down to put back.
 */

/** Its key in the box, and the id it's kept in hand by. */
export const LIST_KEY = 'list'
/** What it goes by as a card in hand (it isn't a recipe: nothing's looked
 *  up by it). */
export const LIST_CARD: Recipe = {
  id: LIST_KEY,
  title: 'Ingredients',
  tags: [],
  ingredients: [],
}

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

type Props = {
  canEdit: boolean
  /** In the box: only so much of it shows (the rest is behind the cards in
   *  front), and it's not written on there — take it out for that. */
  peekHeight?: number
} & HTMLAttributes<HTMLDivElement>

export const ListCard = forwardRef<HTMLDivElement, Props>(function ListCard(
  { canEdit, peekHeight, className = '', style, ...rest },
  ref,
) {
  const ingredients = useWantedIngredients()
  const peek = peekHeight !== undefined
  // (In the box, nothing on it can be reached: not tapped, not tabbed to.)
  const bodyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.inert = peek
  }, [peek])
  return (
    <div
      ref={ref}
      {...rest}
      className={`paper-card rolodex-card relative flex flex-col text-left ${className}`}
      style={{ minHeight: CARD_H, maxHeight: peekHeight, ...style }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="paper-frame" />
        <div className="px-5 pt-3.5">
          <div className="paper-rule pb-1.5">
            <div
              className={`font-hand text-center font-semibold text-black ${
                peek ? 'text-[28px] leading-[25px]' : 'text-[29px] leading-[26px]'
              }`}
            >
              Ingredients
            </div>
          </div>
        </div>
        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 px-4 pt-1 pb-4 ${peek ? 'overflow-hidden' : ''}`}
        >
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
