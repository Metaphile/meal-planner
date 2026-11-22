import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type FocusEvent as ReactFocusEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useStore } from '../store/store'
import {
  useFavoritedBy,
  useIsFavorite,
  useOthersFavorites,
  useWantCount,
} from '../store/selectors'
import { useAuth } from '../auth/AuthProvider'
import {
  allIngredients,
  sectionLabels,
  hasAnything,
  sectionsOf,
  type Ingredient,
  type Recipe,
} from '../data/types'
import { QuantityInput } from './QuantityInput'
import { Amount } from './Unit'
import { OneLine } from './OneLine'
import { ConfirmDialog } from './ui'
import { arcThrough, sampleTimes, type Arc } from '../lib/arc'
import { useWakeLock } from '../lib/wakeLock'
import { loadDraft, saveDraft as keepDraft, type RecipeText } from '../lib/draft'
import {
  forgetDialog,
  keepDialog,
  keptDialog,
  useKeptDialog,
} from '../lib/dialogs'
import { DAY, bool, isObj, num, onLeave, save, type Slice } from '../lib/uiState'

/**
 * Paper recipe cards for the Recipes rolodex.
 *
 * There is one card, `RecipeCard`, used both in the rolodex and lifted out —
 * the whole card (every ingredient, notes, and the actions below the border)
 * is always there at its natural height; in the rolodex the cards in front
 * just hide most of it. So the card that slides out is exactly the card you
 * end up holding.
 */

/** Minimum card height (an index card), and where the rolodex rod sits. */
export const CARD_H = 216
/** Perspective used for the rolodex tilt. */
export const PERSPECTIVE = 900


function IngredientLine({ ing }: { ing: Ingredient }) {
  return (
    <li className="flex justify-between gap-3">
      {/* (Room for the handwriting's last letter, which reaches past its
          own width: else the clip that makes "…" cuts it.) */}
      <span className="-mr-1 truncate pr-1">{ing.name}</span>
      <span className="shrink-0 whitespace-nowrap text-[#8a8170]">
        <Amount quantity={ing.quantity} unit={ing.unit} />
      </span>
    </li>
  )
}

/** A heading on a card (a section's, Notes): larger than the lines under
 *  it, smaller than the title — still one ruled line high. (1.1em: 25px in
 *  the rolodex, 26px in hand; titles are 28 and 29.) */
const HEADING = 'text-[1.1em] font-semibold text-[#8a8170]'

/** Ingredient lines that can show on a peeking card (more than fit). */
const PEEK_LINES = 16

function CardBody({ recipe, peek }: { recipe: Recipe; peek: boolean }) {
  // Its sections — a titled one empty or not (a heading with nothing under
  // it), but not one with no heading and nothing in it: there's nothing to
  // show (older recipes may still have one). Each headed by its title, if
  // it has one (see sectionLabels).
  const sections = sectionsOf(recipe).filter(
    (s) => s.title.trim() || s.ingredients.length,
  )
  const heads = sectionLabels(sections.map((s) => s.title))
  // (Peeking: only as many lines as can show, headings included.)
  let room = peek ? PEEK_LINES : Infinity
  return (
    <>
      {allIngredients(recipe).length === 0 && !heads.some(Boolean) ? (
        <ul>
          <li className="text-[#8a8170]">No ingredients yet</li>
        </ul>
      ) : (
        sections.map((s, si) => {
          if (room <= 0) return null
          const gap = si > 0 ? 1 : 0 // (a line left blank before it)
          const head = heads[si] ? 1 : 0
          const lines = s.ingredients.slice(0, Math.max(0, room - gap - head))
          room -= gap + head + lines.length
          return (
            <section key={si} className={gap ? 'mt-[var(--rule)]' : ''}>
              {heads[si] && (
                <div className={HEADING}>{heads[si]}</div>
              )}
              <ul>
                {lines.map((ing, i) => (
                  <IngredientLine key={i} ing={ing} />
                ))}
              </ul>
            </section>
          )
        })
      )}
      {/* (Peeking, below what can show: not drawn.) */}
      {!peek && recipe.tags.length > 0 && (
        <p className="mt-[var(--rule)] text-[#8a8170]">
          {recipe.tags.join(' · ')}
        </p>
      )}
      {!peek && recipe.notes && (
        <>
          <div className="h-[var(--rule)]" />
          <div className={HEADING}>Notes</div>
          <p className="whitespace-pre-wrap pb-[var(--rule)]">{recipe.notes}</p>
        </>
      )}
      {!peek && <FavoritedBy recipeId={recipe.id} gap={!recipe.notes} />}
    </>
  )
}

/** At the foot of a card: who else has favorited it (a star, and their
 *  names — not yours: that's the star at the top). A line left blank above
 *  it — after the notes, they leave one. */
function FavoritedBy({ recipeId, gap }: { recipeId: string; gap: boolean }) {
  const { user } = useAuth()
  const names = useFavoritedBy(recipeId, user?.id)
  if (!names) return null
  return (
    <p
      className={`flex items-center gap-1.5 text-[#8a8170] ${gap ? 'mt-[var(--rule)]' : ''}`}
    >
      <span className="sr-only">Favorite of</span>
      {/* (Others' stars: no outline, as in the header — so a little larger,
          to look as big.) */}
      <StarIcon on outlined={false} size={19} />
      <span className="min-w-0">{names}</span>
    </p>
  )
}

type CardProps = {
  recipe: Recipe
  canEditPlan: boolean
  canEditRecipes: boolean
  /** Lets the body scroll (when the card is capped to the screen). */
  scrollable?: boolean
  /** In hand: written a little larger (the card is a little bigger). */
  large?: boolean
  /** In the box: drawn only as far down as can ever show (this tall at
   *  most; its notes and tags not at all) — a whole long card would be a
   *  lot to draw and keep for a strip of it. */
  peekHeight?: number
  /** Replaces the usual actions (Add to Meal · Edit) below the border. */
  actions?: ReactNode
  bodyRef?: Ref<HTMLDivElement>
} & HTMLAttributes<HTMLDivElement>

/**
 * The whole card: title over the red rule, the recipe on ruled lines inside
 * the decorative border, and the actions below the border. Natural height
 * (at least an index card); if its height is capped, the footer stays at the
 * bottom and the body scrolls.
 */
export const RecipeCard = forwardRef<HTMLDivElement, CardProps>(
  function RecipeCard(
    {
      recipe,
      canEditPlan,
      canEditRecipes,
      scrollable = false,
      large = false,
      peekHeight,
      actions,
      bodyRef,
      className = '',
      style,
      ...rest
    },
    ref,
  ) {
    const hasActions = actions !== undefined || canEditPlan || canEditRecipes
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
            {/* (The star and the box, centred on the title's line: midway
                between the frame and the rule.) */}
            <div className="paper-rule flex items-center gap-2 pb-1.5">
              <FavoriteStar recipeId={recipe.id} />
              <div
                className={`font-hand min-w-0 flex-1 text-center font-semibold text-black ${
                  large ? 'text-[29px] leading-[26px]' : 'text-[28px] leading-[25px]'
                }`}
              >
                {/* (Only swiped sideways, in the box or in hand: a vertical
                    drag on it is the drum's to turn, or the card's to pull
                    down and put back.) */}
                <OneLine text={recipe.title} panY={false} />
              </div>
              <WantBox recipeId={recipe.id} canEditPlan={canEditPlan} />
            </div>
          </div>
          <div
            ref={bodyRef}
            // Written by hand, sitting on the rules (3px down to meet them).
            // (Room inside its right edge for the handwriting, whose letters
            // reach past their own width — an amount ends flush against it.)
            className={`paper-lines font-hand mb-2 ml-5 mr-4 min-h-0 flex-1 pt-[3px] pr-1 [--rule:24px] ${
              large ? 'text-[24px]' : 'text-[23px]'
            } ${
              scrollable ? 'scroll-y no-scrollbar' : 'overflow-hidden'
            }`}
          >
            <CardBody recipe={recipe} peek={peekHeight !== undefined} />
          </div>
        </div>

        {hasActions && (
          // Taps here act on the buttons, not the card. (Controls, not
          // text: nothing in this row is selectable.)
          <div
            className="flex shrink-0 select-none gap-2 px-4 pb-3 pt-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {actions ?? (
              <>
                {canEditRecipes && <EditLabel />}
                <span className="flex-1" />
                {canEditPlan && (
                  <WantCount recipeId={recipe.id} interactive={false} />
                )}
              </>
            )}
          </div>
        )}

        {/* Shading as the card tips back in the rolodex (its opacity is set per frame; in a pocket, from --shade). */}
        <span className="rolodex-dim" />
      </div>
    )
  },
)

export const EDIT_CLASS =
  'rounded-full border border-[#d8cdb6] px-4 py-1.5 text-sm font-medium leading-5 active:scale-95'

/** Edit, on a card that isn't in hand (in the rolodex or a pocket): just
 *  the look of the Edit button the same card shows once it's taken out (so
 *  the two match exactly as one hands over to the other). Not a control:
 *  take the card out to edit it. */
export function EditLabel() {
  return (
    <span aria-hidden className={`${EDIT_CLASS} inline-block`}>
      Edit
    </span>
  )
}

/** Edit, on a card in hand: turns the card over to its back. (Looks exactly
 *  like EditLabel, which the same card shows in the rolodex.) */
export function EditButton({ onEdit }: { onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className={EDIT_CLASS}>
      Edit
    </button>
  )
}


/**
 * A favorite: a star before the title, everyone's own (readers too). Like
 * the Want box, it's marked right there in the box — and on a card's back
 * too, where (unlike the rest of the back) it's kept at once, not on Save.
 */
function FavoriteStar({ recipeId }: { recipeId: string }) {
  const { user } = useAuth()
  const on = useIsFavorite(user?.id, recipeId)
  // Others who've favorited it, under yours (two at most: enough to say a
  // recipe's liked; who, the foot of the card in hand says).
  const othersAll = useOthersFavorites(recipeId, user?.id)
  const others = Math.min(STACKED.length, othersAll)
  const setFavorite = useStore((s) => s.setFavorite)
  const starRef = useRef<HTMLSpanElement>(null)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={
        othersAll
          ? `Favorite (also ${othersAll === 1 ? 'one other’s' : `${othersAll} others’`})`
          : 'Favorite'
      }
      disabled={!user}
      onClick={(e) => {
        e.stopPropagation() // (not taking the card out)
        if (!user) return
        setFavorite(user.id, recipeId, !on)
        twinkle(starRef.current, !on)
      }}
      // A generous target around the small star, taking no room: in the row
      // it's as wide as the Want box (STAR_ROOM), so a title between them is
      // centred on the card. (The star itself a touch wider: a star looks
      // smaller than a square its size. It reaches a little past its room.)
      className="-m-2 flex shrink-0 justify-center p-2"
      style={{ width: STAR_ROOM + 16 }}
    >
      <span className="relative block">
        {/* Others' stars, under yours: filled (they're favorites), faded
            (not yours to change). See STACKED. */}
        {STACKED.slice(0, others)
          .map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute inset-0 block"
              style={{
                transform: `translate(${s.x}px, ${s.y}px) scale(${s.scale})`,
                opacity: s.opacity,
              }}
            >
              <StarIcon on outlined={false} size={22} />
            </span>
          ))
          .reverse()}
        <span ref={starRef} className="relative block">
          <StarIcon on={on} size={22} />
        </span>
      </span>
    </button>
  )
}

/** Where others' stars sit, under yours: a triangle — yours at the top
 *  (where it always is), the first other's down and to the left, the
 *  second's down and to the right, each partly under it. Upright, smaller,
 *  just their fill, the second a little fainter. Fixed: nothing per recipe
 *  or person, so a stack of so many always looks the same. */
const STACKED = [
  { x: -6, y: 3.2, scale: 0.82, opacity: 0.9 },
  { x: 6, y: 3.2, scale: 0.82, opacity: 0.45 },
]

/**
 * A star toggled by a tap: on, it pops — swelling with a little turn, and
 * springing back; off, it gives a small shrug. (Only when tapped: not when a
 * favorite arrives from another device. Not with reduced motion.)
 */
function twinkle(el: HTMLElement | null, on: boolean) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    on
      ? [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.4) rotate(-18deg)', offset: 0.35 },
          { transform: 'scale(0.92) rotate(4deg)', offset: 0.7 },
          { transform: 'scale(1) rotate(0deg)' },
        ]
      : [
          { transform: 'scale(1)' },
          { transform: 'scale(0.78)', offset: 0.4 },
          { transform: 'scale(1)' },
        ],
    { duration: on ? 450 : 260, easing: 'ease-out' },
  )
}

/** px: the star's room in a card's title row — the Want box's width. */
const STAR_ROOM = 18

/** The star's own bounds (its outline's, with room for the stroke): its
 *  picture is the star, no margin around it. */
const STAR_BOX = { x: 2.62, y: 2.3, w: 18.76, h: 17.93 }

/** A five-pointed star, filled (lavender, inked) when on. `size` is its
 *  width. */
export function StarIcon({
  on,
  size = 20,
  outlined = true,
}: {
  on: boolean
  size?: number
  /** (Off: just the fill — others' stars, under yours.) */
  outlined?: boolean
}) {
  return (
    <svg
      viewBox={`${STAR_BOX.x} ${STAR_BOX.y} ${STAR_BOX.w} ${STAR_BOX.h}`}
      width={size}
      height={(size * STAR_BOX.h) / STAR_BOX.w}
      className={`block shrink-0 ${on ? 'text-kraft-edge' : 'text-[#c9bda4]'}`}
      aria-hidden
    >
      <path
        d="M12 3.2l2.62 5.31 5.86.85-4.24 4.13 1 5.84L12 16.58l-5.24 2.75 1-5.84-4.24-4.13 5.86-.85z"
        fill={on ? 'var(--color-kraft)' : 'var(--color-paper)'}
        stroke={outlined ? 'currentColor' : 'none'}
        // (Drawn 1.5px wide whatever its size, like the Want box's border.)
        strokeWidth={(1.5 * STAR_BOX.w) / size}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Want, a box to tick in a card's top right corner: a recipe the household
 * wants to make (its ingredients go on the Ingredients list). Ticked or not
 * right there in the box — it doesn't take the card out.
 */
function WantBox({
  recipeId,
  canEditPlan,
}: {
  recipeId: string
  canEditPlan: boolean
}) {
  const count = useWantCount(recipeId)
  const on = count > 0
  const setWanted = useStore((s) => s.setWanted)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={count > 1 ? `Want (×${count})` : 'Want'}
      disabled={!canEditPlan}
      onClick={(e) => {
        e.stopPropagation() // (not taking the card out)
        setWanted(recipeId, !on)
      }}
      // A generous target around the small box. (No label: a box to tick
      // speaks for itself.) Not to be ticked here (a reader): faded, but
      // still showing what's wanted, and how many times.
      className="-m-2 flex shrink-0 items-center gap-1.5 p-2 disabled:cursor-default disabled:opacity-55"
    >
      {/* Wanted more than once: how many times, beside the box. */}
      {count > 1 && (
        <span className="font-hand text-[21px] font-semibold leading-[18px] text-brand-ink">
          ×{count}
        </span>
      )}
      <span
        className={`grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] ${
          on ? 'border-kraft-edge bg-kraft' : 'border-[#c9bda4] bg-paper'
        }`}
      >
        {on && (
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
        )}
      </span>
    </button>
  )
}

/**
 * How many times a recipe is wanted, in the card's footer: − ×n +. Always
 * there; ×0 is not wanted (+ from there wants it, − to there doesn't). Only
 * usable on a card in hand (in the box it's just its look).
 */
function WantCount({
  recipeId,
  interactive,
}: {
  recipeId: string
  interactive: boolean
}) {
  const count = useWantCount(recipeId)
  const setWantCount = useStore((s) => s.setWantCount)
  const setWanted = useStore((s) => s.setWanted)
  const set = (n: number) => {
    if (n <= 0) setWanted(recipeId, false)
    else if (count === 0) setWanted(recipeId, true, n) // (stepping up: ×1)
    else setWantCount(recipeId, n)
  }
  const step =
    'grid h-8 w-9 place-items-center text-lg leading-none active:opacity-60 disabled:opacity-35'
  return (
    <div
      aria-hidden={!interactive || undefined}
      className="flex items-center rounded-full border border-kraft-edge bg-brand text-on-brand"
    >
      <button
        type="button"
        tabIndex={interactive ? undefined : -1}
        aria-label="Want fewer"
        disabled={interactive && count === 0}
        onClick={interactive ? () => set(count - 1) : undefined}
        className={step}
      >
        −
      </button>
      <span
        aria-live={interactive ? 'polite' : undefined}
        aria-label={
          interactive
            ? count === 0
              ? 'Not wanted'
              : `Wanted ${count} times`
            : undefined
        }
        className="paper-serif min-w-[1.25rem] text-center text-[15px] font-semibold"
      >
        ×{count}
      </span>
      <button
        type="button"
        tabIndex={interactive ? undefined : -1}
        aria-label="Want more"
        onClick={interactive ? () => set(count + 1) : undefined}
        className={step}
      >
        +
      </button>
    </div>
  )
}

/** A section's heading, before one's written: it needn't be. */
const HEADING_HINT = 'Heading (optional)'

/** Units offered for an ingredient, in a fixed order (so they're always where
 *  you left them); any others your recipes use follow. */
export const COMMON_UNITS = [
  'tsp',
  'tsp heaping',
  'tbsp',
  'tbsp heaping',
  'cup',
  'oz',
  'lb',
  'g',
  'kg',
  'ml',
  'l',
  'pinch',
  'clove',
  'slice',
  'can',
  'stalk',
  'bunch',
  'pkg',
]

/** Close any unit menu that's open (e.g. its card being put away). */
export const CLOSE_PICKERS = 'meals:close-pickers'
export const closePickers = () =>
  document.dispatchEvent(new Event(CLOSE_PICKERS))

/**
 * An ingredient's unit, picked rather than typed: tapping it opens a small
 * paper menu of units (no keyboard, so nothing for the phone to autofill).
 * "Other…" writes one in; "None" clears it. The menu opens below its line,
 * or above it in the lower half of the screen, and stays open while you
 * scroll; a tap anywhere else closes it (and does nothing else).
 */
export function UnitCell({
  value,
  onChange,
  units,
  disabled = false,
  placeholder,
  className,
}: {
  value: string | undefined
  onChange: (unit: string | undefined) => void
  units: string[]
  disabled?: boolean
  /** A faint hint while there's no unit. */
  placeholder?: string
  className: string
}) {
  const [menu, setMenu] = useState<null | 'above' | 'below'>(null)
  const [typing, setTyping] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  /** Which side of its line the menu goes: below, if it fits there — in
   *  what can be seen (above any keyboard) of the layer it's in, which
   *  clips it — else whichever side has more room. */
  const side = (): 'above' | 'below' => {
    const el = ref.current!
    const r = el.getBoundingClientRect()
    const vv = window.visualViewport // (the part above the keyboard)
    let top = vv?.offsetTop ?? 0
    let bottom = top + (vv?.height ?? window.innerHeight)
    const layer = el.closest('.scroll-y')?.getBoundingClientRect()
    if (layer) {
      top = Math.max(top, layer.top)
      bottom = Math.min(bottom, layer.bottom)
    }
    const need = (menuRef.current?.offsetHeight ?? 220) + 4
    const below = bottom - r.bottom
    const above = r.top - top
    return below >= need || below >= above ? 'below' : 'above'
  }
  const toggle = () => setMenu(menu ? null : side())
  // Open, it goes where it fits — once it's drawn (its size known), and
  // again as what can be seen changes: tapped from a field, the keyboard
  // going away moves everything (the line ending up near the screen's
  // foot, say, where the menu below it would be out of sight).
  useLayoutEffect(() => {
    if (!menu) return
    const place = () => setMenu((m) => (m ? side() : m))
    place()
    const vv = window.visualViewport
    vv?.addEventListener('resize', place)
    vv?.addEventListener('scroll', place)
    window.addEventListener('resize', place)
    return () => {
      vv?.removeEventListener('resize', place)
      vv?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
    }
  }, [!!menu])

  // A tap anywhere else only closes the menu. (Scrolling makes no click, so
  // it leaves the menu open.)
  useEffect(() => {
    if (!menu) return
    const outside = (e: Event) => !ref.current?.contains(e.target as Node)
    // No focusing a field under the tap…
    const onMouseDown = (e: MouseEvent) => {
      if (outside(e)) e.preventDefault()
    }
    // …or acting on it.
    const onClick = (e: MouseEvent) => {
      if (!outside(e)) return
      e.preventDefault()
      e.stopPropagation()
      setMenu(null)
    }
    // (And closed, the card it's on being put away — before "Discard
    // changes?" asks: open still, the first tap there would only close it.)
    const close = () => setMenu(null)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener(CLOSE_PICKERS, close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener(CLOSE_PICKERS, close)
    }
  }, [menu])

  if (typing) {
    return (
      <input
        autoFocus
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={() => setTyping(false)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Unit"
        autoComplete="off"
        autoCapitalize="none"
        className={className}
      />
    )
  }

  const chip =
    'rounded-full border px-2.5 py-1 text-[21px] leading-5 active:scale-95'
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={!!menu}
        aria-label={value ? `Unit: ${value}` : 'Choose a unit'}
        // (Its menu open: tinted, as a field being written in is — the
        // line it's choosing for.)
        className={`${className} block w-full truncate text-left aria-expanded:bg-kraft/15`}
      >
        {value ?? (placeholder && <span className="text-pencil">{placeholder}</span>)}
      </button>
      {menu && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Units"
          className={`paper-card absolute right-0 z-20 flex w-[15.5rem] flex-wrap gap-1.5 p-2.5 ${
            menu === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {units.map((u) => (
            <button
              key={u}
              type="button"
              role="option"
              aria-selected={u === value}
              onClick={() => {
                onChange(u)
                setMenu(null)
              }}
              className={`${chip} ${
                u === value
                  ? 'border-kraft-edge bg-kraft text-kraft-ink'
                  : 'border-paper-edge bg-paper text-ink'
              }`}
            >
              {u}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setMenu(null)
              setTyping(true)
            }}
            className={`${chip} border-paper-edge bg-paper text-pencil`}
          >
            Other…
          </button>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined)
                setMenu(null)
              }}
              className={`${chip} border-paper-edge bg-paper text-pencil`}
            >
              None
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** An ingredient line on the back of a card; a crossed-out one goes when
 *  the card is saved. */
export type Row = Ingredient & {
  struck?: boolean
  /** Which line it is, while the card's being edited (not kept): lines
   *  come and go, and move, and the field being written in must stay with
   *  its line. */
  rid?: number
}
/** A new id for a line or a section being edited. */
let lastId = 0
const newEditId = () => ++lastId

const blank = (i: Row) =>
  !i.struck && !i.name.trim() && i.quantity === undefined && !i.unit
/** Always exactly one empty line at the end, to write the next one on —
 *  but `hold`, the one being written in, stays, empty or not: emptied just
 *  above the spare, both stay (till it's left — see IngredientTable); the
 *  spare itself, the other goes. */
const withSpareLine = (rows: Row[], hold?: number | null) => {
  const out = [...rows]
  while (
    out.length > 1 &&
    blank(out[out.length - 1]) &&
    blank(out[out.length - 2]) &&
    out[out.length - 2].rid !== hold
  )
    out.splice(out[out.length - 1].rid === hold ? -2 : -1, 1)
  if (!out.length || !blank(out[out.length - 1]))
    out.push({ name: '', rid: newEditId() })
  return out
}

export const MARK_BUTTON =
  // (The table's rule blue, at half its lightness.)
  'grid h-[30px] place-items-center text-[#457ca1] active:text-pen'

/** × (cross a line out), drawn so it's centred on the line, and ↺ (bring
 *  it back). */
export function RowMark({ kind }: { kind: 'cross' | 'restore' }) {
  if (kind === 'restore')
    // (The character itself, in the system's font: its tip and tail sit
    // well apart, so it reads at a glance.)
    return (
      <span
        aria-hidden
        className="text-[19px] leading-none"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        ↺
      </span>
    )
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={(1.6 * 24) / 14}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/**
 * Ingredients written on the back of a card: a ruled table (name · qty ·
 * unit) with no boxes, like the notes below it. The heading line doubles as
 * the column heads. There's always an empty line at the end; writing on it
 * starts another. × crosses a line out (↺ brings it back); it's only gone
 * once the card is saved.
 */
/** A section as it's written on the back of a card: its title, its lines
 *  (one spare, empty, at the end to write the next on). */
export type Group = {
  title: string
  rows: Row[]
  /** Crossed out, to go (on Save) — and with it every line in it, whatever
   *  each line's own mark (kept: brought back, the section's lines are as
   *  they were). */
  struck?: boolean
  /** Which section it is, while the card's being edited (not kept). */
  gid?: number
}

/** The groups as they should stand after a change: each with its spare
 *  line — and every section and line with an id of its own. */
const tidyGroups = (gs: Group[], hold?: number | null) =>
  gs.map((g) => ({
    ...g,
    gid: g.gid ?? newEditId(),
    rows: withSpareLine(
      g.rows.map((r) => (r.rid === undefined ? { ...r, rid: newEditId() } : r)),
      hold,
    ),
  }))

/**
 * The sections and lines, but none with nothing to it — however it came to
 * be empty (a line's last word rubbed out with the unit picker, a section's
 * last line dragged away, …), it goes. Not the one being written in, though
 * (it goes once it's left — see IngredientTable: the line with the focus,
 * or its unit being picked), nor any in `keep` (a line just opened, to be
 * written on next; the line being written in, the focus gone from it for
 * a tap within it); nor a section's spare line at the end
 * (where the next line's written), nor the only section: every recipe has a
 * first section. (A titled section stays, empty or not.)
 */
function withoutEmpties(
  gs: Group[],
  keep: (number | null | undefined)[] = [],
): Group[] {
  const active =
    typeof document === 'undefined' ? null : document.activeElement
  const here = active?.closest('[data-gid]')?.getAttribute('data-gid')
  const kept = new Set(keep.filter((k) => k != null).map(String))
  for (const el of [
    active,
    typeof document === 'undefined'
      ? null
      : document.querySelector('[data-rid] [aria-expanded="true"]'),
  ]) {
    const rid = el?.closest('[data-rid]')?.getAttribute('data-rid')
    if (rid != null) kept.add(rid)
  }
  const lines = gs.map((x) =>
    x.rows.some((r, i) => blank(r) && i < x.rows.length - 1)
      ? {
          ...x,
          rows: x.rows.filter(
            (r, i) =>
              !blank(r) ||
              i === x.rows.length - 1 ||
              kept.has(String(r.rid)),
          ),
        }
      : x,
  )
  if (lines.length < 2) return lines
  const sections = lines.filter(
    (x) =>
      x.struck ||
      x.title.trim() ||
      !x.rows.every(blank) ||
      (here != null && String(x.gid) === here) ||
      x.rows.some((r) => kept.has(String(r.rid))),
  )
  return sections.length ? sections : lines.slice(0, 1)
}

/**
 * A recipe's sections as written on the back of its card: crossed-out
 * sections gone (every line in them with them), crossed-out lines left off,
 * and lines with nothing on them (one with only an amount, or only a unit,
 * is kept). The first section kept is the recipe's first (its `ingredients`
 * and `ingredientsTitle`) — whichever it is: cross out the first, and the
 * next takes its place. (Crossed out, every one: a first section with
 * nothing in it, as every recipe has.) Every other section stays — but
 * an untitled one with nothing in it kept goes: with no heading and no
 * lines, there's nothing to it.
 */
export function sectionsFromGroups(
  groups: Group[],
): Pick<Recipe, 'ingredients' | 'ingredientsTitle' | 'sections'> {
  const lines = (rows: Row[]) =>
    rows
      .filter((i) => !i.struck)
      .map(({ struck: _, rid: __, ...i }) => ({ ...i, name: i.name.trim() }))
      .filter(hasAnything)
  // (A section with no heading and nothing in it kept — its only line
  // crossed out, say — is nothing: it goes. With a heading, it stays.)
  const [first, ...rest] = groups.filter(
    (g) => !g.struck && (!!g.title.trim() || lines(g.rows).length > 0),
  )
  const sections = rest.map((g) => ({
    title: g.title.trim(),
    ingredients: lines(g.rows),
  }))
  return {
    ingredients: first ? lines(first.rows) : [],
    ingredientsTitle: first?.title.trim() || undefined,
    sections: sections.length ? sections : undefined,
  }
}

/**
 * A drag by a grip is never a tap on what's under the finger when it lets
 * go — on iOS, lifting the finger can count as a tap there, which would put
 * the caret in the field now under it (after a drop, another line's name).
 * So the touch's end is the grip's alone (no tap made of it), any click it
 * makes is swallowed, and nothing in the table takes the focus meanwhile.
 * Returns what to call once the drag's over (it stands guard a moment
 * longer, for a tap that comes late).
 */
function guardDrag(handle: HTMLElement, table: HTMLElement) {
  const noTap = (ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault()
  }
  const noClick = (ev: MouseEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
  }
  const noFocus = (ev: FocusEvent) => (ev.target as HTMLElement).blur?.()
  handle.addEventListener('touchend', noTap, { passive: false })
  window.addEventListener('click', noClick, true)
  table.addEventListener('focusin', noFocus)
  return () =>
    setTimeout(() => {
      handle.removeEventListener('touchend', noTap)
      window.removeEventListener('click', noClick, true)
      table.removeEventListener('focusin', noFocus)
    }, 400)
}

/**
 * Dragging a whole section by its title's grip: up or down, among the
 * sections (it can go first: the first is the starter, whichever it is). It
 * lifts, title and lines together; the others slide aside to show where
 * it'd go. Let go, it settles there and the move is made (`onDrop`: to just
 * before the section at `to`, or last). As dragRow: transforms only, and
 * scrolling near the edges.
 */
function dragSection(
  e: ReactPointerEvent<HTMLElement>,
  onDrop: (to: number) => void,
) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const handle = e.currentTarget
  const table = handle.closest('[role=table]') as HTMLElement
  const block = handle.closest('[role=rowgroup]') as HTMLElement
  const unguard = guardDrag(handle, table)
  try {
    handle.setPointerCapture(e.pointerId)
  } catch {
    /* (gone) */
  }
  const id = e.pointerId
  // The sections, then "Add section…" (always after the last).
  const els = [...table.querySelectorAll<HTMLElement>(':scope > [role=rowgroup]')]
  const o = els.indexOf(block)
  const top0 = table.getBoundingClientRect().top
  const rel = els.map((el) => el.getBoundingClientRect().top - top0)
  const h = rel[o + 1] - rel[o] // (its height, and the space after it)
  const spots = els.map((_, k) => k).filter((k) => k !== o)
  const slot = (k: number) => rel[k] - (k > o ? h : 0)
  const minTop = Math.min(...spots.map(slot))
  const maxTop = Math.max(...spots.map(slot))
  const y0 = e.clientY - top0
  let lastY = e.clientY
  let target = o + 1
  Object.assign(block.style, {
    zIndex: '10',
    background: 'var(--color-paper)',
    boxShadow: '0 8px 18px -8px rgb(60 50 30 / 0.45)',
    transition: 'none',
  })
  els.forEach((el, k) => {
    if (k !== o) el.style.transition = 'transform 150ms ease'
  })
  const follow = (clientY: number) => {
    lastY = clientY
    const top = table.getBoundingClientRect().top
    const want = Math.min(maxTop, Math.max(minTop, rel[o] + (clientY - top - y0)))
    let bestD = Infinity
    for (const k of spots) {
      const d = Math.abs(slot(k) - want)
      if (d < bestD) {
        bestD = d
        target = k
      }
    }
    els.forEach((el, k) => {
      if (k === o) return
      const shift =
        target > o && k > o && k < target
          ? -h
          : target < o && k >= target && k < o
            ? h
            : 0
      el.style.transform = shift ? `translateY(${shift}px)` : ''
    })
    block.style.transform = `translateY(${want - rel[o]}px)`
  }
  const stopScrolling = scrollNearEdges(table, () => lastY, () => follow(lastY))
  const finish = (drop: boolean) => {
    stopScrolling()
    unguard()
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onCancel)
    const moved = drop && target !== o + 1
    block.style.transition = 'transform 120ms ease-out'
    block.style.transform = `translateY(${moved ? slot(target) - rel[o] : 0}px)`
    if (!moved) els.forEach((el, k) => k !== o && (el.style.transform = ''))
    setTimeout(() => {
      if (moved) flushSync(() => onDrop(target))
      for (const el of els) {
        el.style.transform = ''
        el.style.transition = ''
        el.style.zIndex = ''
        el.style.background = ''
        el.style.boxShadow = ''
      }
    }, 130)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId === id) follow(ev.clientY)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(true)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(false)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onCancel)
}

/** While dragging: near the top or bottom of what `inside` scrolls in, it
 *  scrolls (faster, nearer the edge), and `moved` is called as it does.
 *  Returns the stop. */
function scrollNearEdges(
  inside: HTMLElement,
  y: () => number,
  moved: () => void,
): () => void {
  let scroller: HTMLElement | null = inside.parentElement
  while (scroller) {
    const oy = getComputedStyle(scroller).overflowY
    if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight)
      break
    scroller = scroller.parentElement
  }
  const edge = 56
  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    if (!scroller) return
    const r = scroller.getBoundingClientRect()
    const at = y()
    const v =
      at < r.top + edge
        ? -((r.top + edge - at) / edge) * 10
        : at > r.bottom - edge
          ? ((at - (r.bottom - edge)) / edge) * 10
          : 0
    if (v) {
      scroller.scrollTop += v
      moved()
    }
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

/** Six dots: a line's handle, to drag it up or down by. */
function GripIcon() {
  return (
    <svg viewBox="0 0 8 14" width={8} height={14} aria-hidden fill="currentColor">
      {[2, 7, 12].map((y) =>
        [2, 6].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.25} />),
      )}
    </svg>
  )
}

/**
 * Dragging an ingredient line by its grip: up or down only, into any
 * section. It lifts and follows the finger; the lines it passes slide aside,
 * opening a gap where it would land (anywhere a line is, or before a
 * section's "Add ingredient…" — or under "Add section…", which then reads
 * as the new section it'll make). Let go, it settles into the gap and the
 * move is made (`onDrop`: to just before the line at `to`; a section past
 * the last is a new one). Near the top or
 * bottom of what scrolls, it scrolls. All by transforms on the lines, laid
 * out once at the start: no re-rendering mid-drag. (Not anywhere `goes`
 * says no to: a move that would change nothing.)
 */
function dragRow(
  e: ReactPointerEvent<HTMLElement>,
  onDrop: (to: { g: number; i: number }) => void,
  goes: (to: { g: number; i: number }) => boolean = () => true,
) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault() // (not focusing, not selecting)
  e.stopPropagation()
  const handle = e.currentTarget
  const origin = handle.closest('[role=row]') as HTMLElement
  const table = handle.closest('[role=table]') as HTMLElement
  const unguard = guardDrag(handle, table)
  try {
    handle.setPointerCapture(e.pointerId)
  } catch {
    /* (gone) */
  }
  const id = e.pointerId
  const els = [...table.querySelectorAll<HTMLElement>('[role=row]')]
  const o = els.indexOf(origin)
  const h = origin.offsetHeight
  const top0 = table.getBoundingClientRect().top
  const rel = els.map((el) => el.getBoundingClientRect().top - top0)
  // Where it could go: before any other ingredient line (spare ones too);
  // or, as the first line of a new section, under "Add section…" (the last
  // row: `add`).
  const add = els.findIndex((el) => el.dataset.newSection !== undefined)
  const spots = els
    .map((_, k) => k)
    .filter((k) =>
      k === add
        ? goes({ g: Number(els[k].dataset.newSection), i: 0 })
        : k !== o &&
          els[k].dataset.g !== undefined &&
          goes({ g: Number(els[k].dataset.g), i: Number(els[k].dataset.i) }),
    )
  // Its top, put there (the lines below where it was having closed up).
  const slot = (k: number) =>
    k === add
      ? rel[k] - h + els[k].offsetHeight // (under it)
      : rel[k] - (k > o ? h : 0)
  const addField = add >= 0 ? els[add].querySelector('input') : null
  const addHint = addField?.placeholder ?? ''
  const minTop = Math.min(...spots.map(slot))
  const maxTop = Math.max(...spots.map(slot))
  const y0 = e.clientY - top0
  let lastY = e.clientY
  let target = o + 1 // (just where it is: before the next line)

  // Lifted.
  Object.assign(origin.style, {
    zIndex: '10',
    background: 'var(--color-paper)',
    boxShadow: '0 6px 14px -6px rgb(60 50 30 / 0.45)',
    transition: 'none',
  })
  els.forEach((el, k) => {
    if (k !== o) el.style.transition = 'transform 150ms ease'
  })

  const follow = (clientY: number) => {
    lastY = clientY
    const top = table.getBoundingClientRect().top
    const want = Math.min(maxTop, Math.max(minTop, rel[o] + (clientY - top - y0)))
    let best = target
    let bestD = Infinity
    for (const k of spots) {
      const d = Math.abs(slot(k) - want)
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    target = best
    // (Headed for a new section: "Add section…" reads as it'll be named.)
    if (addField)
      addField.placeholder =
        target === add ? (els[add].dataset.newLabel ?? HEADING_HINT) : addHint
    els.forEach((el, k) => {
      if (k === o) return
      const shift =
        // (Under "Add section…": it too closes up.)
        target > o && k > o && (k < target || (target === add && k === add))
          ? -h
          : target < o && k >= target && k < o
            ? h
            : 0
      el.style.transform = shift ? `translateY(${shift}px)` : ''
    })
    origin.style.transform = `translateY(${want - rel[o]}px)`
  }

  const stopScrolling = scrollNearEdges(table, () => lastY, () => follow(lastY))

  const finish = (drop: boolean) => {
    stopScrolling()
    unguard()
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onCancel)
    const moved = drop && target !== o + 1
    const to = !moved
      ? null
      : target === add
        ? { g: Number(els[add].dataset.newSection), i: 0 }
        : { g: Number(els[target].dataset.g), i: Number(els[target].dataset.i) }
    if (addField) addField.placeholder = addHint
    // It settles into its place (or back where it was), then the move is
    // made and everything stands where it now is, in the same frame.
    origin.style.transition = 'transform 120ms ease-out'
    origin.style.transform = `translateY(${moved ? slot(target) - rel[o] : 0}px)`
    if (!moved) els.forEach((el, k) => k !== o && (el.style.transform = ''))
    setTimeout(() => {
      if (to) flushSync(() => onDrop(to))
      for (const el of els) {
        el.style.transform = ''
        el.style.transition = ''
        el.style.zIndex = ''
        el.style.background = ''
        el.style.boxShadow = ''
      }
    }, 130)
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId === id) follow(ev.clientY)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(true)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(false)
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onCancel)
}

function IngredientTable({
  groups,
  onChange,
  headClass,
}: {
  groups: Group[]
  onChange: (groups: Group[]) => void
  headClass: string
}) {
  // The common units, then any others your recipes use.
  const recipes = useStore((s) => s.recipes)
  const units = useMemo(() => {
    const extra = new Set<string>()
    for (const r of recipes)
      for (const ing of allIngredients(r))
        if (ing.unit && !COMMON_UNITS.includes(ing.unit)) extra.add(ing.unit)
    for (const g of groups)
      for (const row of g.rows)
        if (row.unit && !COMMON_UNITS.includes(row.unit)) extra.add(row.unit)
    return [...COMMON_UNITS, ...[...extra].sort()]
  }, [recipes, groups])
  const set = (gs: Group[], keep?: number) =>
    onChange(
      withoutEmpties(tidyGroups(gs, held.current), [keep, held.current]),
    )
  // The line being written in: from its taking the focus till it's left
  // (see whenLeft) — kept, empty or not, all the while. (The focus can go
  // from it to nowhere for a tap within it: its unit, say, on iOS.)
  const held = useRef<number | null>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const rid = held.current
      if (rid === null) return
      const row = document.querySelector(`[data-rid="${rid}"]`)
      if (row?.contains(e.target as Node)) return
      // (A tap elsewhere: left — the focus with it, or none was there.)
      held.current = null
      setTimeout(() => {
        if (!row?.contains(document.activeElement)) dropIfEmptyLine(rid)
      }, 300)
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () =>
      window.removeEventListener('pointerdown', onDown, { capture: true })
  })
  // The ids the next section made here will have, and its first line:
  // "Add section…" (and the line under it) carry them already, so writing
  // there — making the section — keeps the caret where it is.
  const pending = useRef({ gid: newEditId(), rid: newEditId() })
  const renewPending = () => {
    pending.current = { gid: newEditId(), rid: newEditId() }
  }
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // Left — written in, then the focus gone from it (to anywhere outside it,
  // or nowhere: the keyboard put away) — `act` is done. But not for a tap
  // within it: on iOS a tap on a button, like a unit's, takes no focus, so
  // it too leaves the field for nowhere.
  // (What's being tapped, while it is — a line inside a section: a tap on
  // it is one within both.)
  const tapping = useRef<Node | null>(null)
  const whenLeft = (act: () => void) => ({
    onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => {
      const target = e.target as Node
      if (tapping.current === target) return
      tapping.current = target
      const done = () =>
        setTimeout(() => {
          if (tapping.current === target) tapping.current = null
        })
      window.addEventListener('click', done, { capture: true, once: true })
      setTimeout(done, 1000)
    },
    onBlur: (e: ReactFocusEvent<HTMLElement>) => {
      const area = e.currentTarget
      const to = e.relatedTarget as Node | null
      if (to && area.contains(to)) return
      setTimeout(() => {
        const t = tapping.current
        if ((t && area.contains(t)) || area.contains(document.activeElement))
          return
        act()
      })
    },
  })
  // An empty line, left: gone. (Not the spare one at the end — that's
  // where the next line's written.)
  const dropIfEmptyLine = (rid: number | undefined) => {
    if (held.current === rid) held.current = null
    const gs = groupsRef.current
    const g = gs.findIndex((x) => x.rows.some((r) => r.rid === rid))
    if (g < 0) return
    const rows = gs[g].rows
    const i = rows.findIndex((r) => r.rid === rid)
    if (!blank(rows[i]) || i === rows.length - 1) return
    set(gs.map((x, k) => (k === g ? { ...x, rows: rows.filter((_, j) => j !== i) } : x)))
  }
  // A section with no heading and nothing in it, left: gone. (Not the only
  // one: every recipe has a first section.)
  const dropIfEmptySection = (gid: number | undefined) => {
    const gs = groupsRef.current
    const g = gs.findIndex((x) => x.gid === gid)
    if (g < 0 || gs.length < 2) return
    const x = gs[g]
    if (x.struck || x.title.trim() || !x.rows.every(blank)) return
    set(gs.filter((_, k) => k !== g))
  }
  // "Add section…" being written in (nothing yet): shown as a section's
  // title already.
  const [addingSection, setAddingSection] = useState(false)
  // (…till a tap lands anywhere else.)
  const addRef = useRef<HTMLDivElement>(null)
  const tappingAdd = useRef(false) // (a tap within it, under way)
  useEffect(() => {
    if (!addingSection) return
    const onDown = (e: PointerEvent) => {
      if (!addRef.current?.contains(e.target as Node)) setAddingSection(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [addingSection])
  // (A title just written in "Add section…", rubbed out before anything's
  // written under it: back to "Add section…" — undone, not left an empty
  // section.)
  const setTitle = (g: number, title: string) => {
    const x = groups[g]
    if (
      title === '' &&
      g > 0 &&
      g === groups.length - 1 &&
      x.title !== '' &&
      x.rows.every(blank)
    ) {
      // (Still being written in: shown with its column heads, as before —
      // and with its ids, so the caret stays.)
      setAddingSection(true)
      pending.current = { gid: x.gid ?? newEditId(), rid: newEditId() }
      return set(groups.slice(0, -1))
    }
    set(groups.map((y, i) => (i === g ? { ...y, title } : y)))
  }
  const update = (g: number, r: number, patch: Partial<Row>) => {
    // (The line under "Add section…": written on, it's a new section —
    // untitled, this its first line. A new "Add section…" below, not being
    // written in.)
    if (g === groups.length) {
      setAddingSection(false)
      const { gid, rid } = pending.current
      renewPending()
      return set([...groups, { title: '', rows: [{ name: '', rid, ...patch }], gid }])
    }
    const next = groups.map((x, i) =>
      i === g
        ? {
            ...x,
            rows: x.rows.map((row, j) => (j === r ? { ...row, ...patch } : row)),
          }
        : x,
    )
    // (The last section, untitled, its lines all rubbed out again — just
    // made, from "Add section…": back to that, still being written in.)
    const was = groups[g]
    if (
      g > 0 &&
      g === groups.length - 1 &&
      !was.title.trim() &&
      !was.struck &&
      was.rows.some((x) => !blank(x)) &&
      next[g].rows.every(blank)
    ) {
      setAddingSection(true)
      pending.current = {
        gid: was.gid ?? newEditId(),
        rid: was.rows[r]?.rid ?? newEditId(),
      }
      return set(groups.slice(0, -1))
    }
    set(next)
  }
  // (Moving a line: from where it was to just before another — see dragRow.
  // Only into the draft: nothing's kept until Save.)
  const moveRow = (
    from: { g: number; i: number },
    to: { g: number; i: number },
  ) => {
    const gs = groups.map((x) => ({ ...x, rows: [...x.rows] }))
    const [row] = gs[from.g].rows.splice(from.i, 1)
    // (Onto "Add section…": a new section, untitled.)
    if (to.g >= gs.length) {
      gs.push({ title: '', rows: [], gid: pending.current.gid })
      renewPending()
    }
    const at = to.g === from.g && to.i > from.i ? to.i - 1 : to.i
    gs[to.g].rows.splice(at, 0, row)
    set(gs)
  }
  // (Whether a move would change anything. Not the one line in the last
  // section, untitled, to a new section after it: that section would go,
  // empty, and the new one — untitled too, with just that line — would be
  // it all over again.)
  const changes = (
    from: { g: number; i: number },
    to: { g: number; i: number },
  ) => {
    const x = groups[from.g]
    return !(
      to.g >= groups.length &&
      from.g === groups.length - 1 &&
      !x.struck &&
      !x.title.trim() &&
      x.rows.every((r, j) => j === from.i || blank(r))
    )
  }
  // Return on a line with something on it: a new line opens just after it,
  // to write the next on — or, the line after it empty already (the spare
  // one at the end, say), on to that. On an empty line: nothing. (A new
  // line left empty goes again — see dropIfEmptyLine.)
  const focusRid = useRef<number | null>(null)
  const newLineAfter = (
    e: ReactKeyboardEvent<HTMLInputElement>,
    g: number,
    i: number,
  ) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const rows = groups[g]?.rows
    if (!rows || blank(rows[i])) return
    const next = rows[i + 1]
    if (next && blank(next)) {
      focusRid.current = next.rid ?? null
    } else {
      const rid = newEditId()
      focusRid.current = rid
      set(
        groups.map((x, k) =>
          k === g
            ? { ...x, rows: [...rows.slice(0, i + 1), { name: '', rid }, ...rows.slice(i + 1)] }
            : x,
        ),
        rid,
      )
    }
    if (next && blank(next)) focusLine()
  }
  const tableRef = useRef<HTMLDivElement>(null)
  const focusLine = () => {
    const rid = focusRid.current
    if (rid === null) return
    focusRid.current = null
    tableRef.current
      ?.querySelector<HTMLInputElement>(`[data-rid="${rid}"] input`)
      ?.focus()
  }
  // (A line just opened: written on, once it's drawn.)
  useLayoutEffect(() => {
    focusLine()
  })
  const setStruck = (g: number, struck: boolean) =>
    set(groups.map((x, i) => (i === g ? { ...x, struck } : x)))
  // (A whole section moved: to just before the section at `to`, or last.)
  const moveSection = (from: number, to: number) => {
    const gs = [...groups]
    const [x] = gs.splice(from, 1)
    gs.splice(to > from ? to - 1 : to, 0, x)
    set(gs)
  }
  // (A grip to drag each line by, then its writing.)
  const cols =
    'grid grid-cols-[1rem_minmax(0,1fr)_3.25rem_4.25rem_1.75rem]'
  const grip =
    'grid h-[30px] cursor-grab touch-none select-none place-items-center text-pencil active:cursor-grabbing'
  const stroke = (
    // A pen stroke through a line (from its writing to its mark).
    <span
      aria-hidden
      className="pointer-events-none absolute left-[0.875rem] right-8 top-[calc(50%-0.5px)] h-px rounded-full bg-pen"
      style={{ transform: 'rotate(-0.5deg)' }}
    />
  )
  const cell =
    // Taller than the card's 22px ruled lines, so each line (and its ✕) is
    // easy to hit with a finger. The middle of its lowercase letters (most
    // of the writing) is the line's middle — level with the grip and the ✕,
    // so a stroke through them meets those. (A field centres its writing in
    // what its padding leaves: so, padded below, the writing's 2px high.)
    'h-[30px] min-w-0 bg-transparent pt-0 pb-[4px] leading-[24px] focus:bg-kraft/15 focus:outline-none'
  const rule = 'border-l border-line-blue'
  // A section's title, written in (a heading, across the whole line). Its
  // key is its place among the sections — and "Add section…" takes the next
  // place's, so typing there becomes the new section's title without losing
  // the caret.
  const titleField = (
    value: string,
    onTitle: (t: string) => void,
    placeholder: string,
    readOnly = false,
    focusProps?: { onFocus: () => void; onBlur: () => void },
  ) => (
    <input
      value={value}
      onChange={(e) => onTitle(e.target.value)}
      {...focusProps}
      // Return: on to the section's first line (its "Add ingredient…", if
      // it has none), to write it.
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        e.currentTarget
          .closest('[role=rowgroup]')
          ?.querySelector<HTMLInputElement>('[role=row][data-g] input:not([readonly])')
          ?.focus()
      }}
      enterKeyHint="next"
      readOnly={readOnly}
      // (Crossed out: not to be written in — nor tapped into, nor tabbed
      // to: a tap goes through it.)
      tabIndex={readOnly ? -1 : undefined}
      placeholder={placeholder}
      aria-label="Section"
      autoComplete="off"
      autoCapitalize="words"
      className={`${headClass} h-[34px] min-w-0 bg-transparent pt-0 pb-[4px] placeholder:font-normal placeholder:text-pencil focus:bg-kraft/15 focus:outline-none ${
        readOnly ? 'pointer-events-none' : ''
      }`}
    />
  )

  // An ingredient line, `i` in section `g`. (Under "Add section…" being
  // written in, a line for the new section's first ingredient, `g` past the
  // last: built just as the line it'll become, so writing on it — making
  // the section — keeps the caret where it is.)
  const lineRow = (g: number, group: Group, i: number, row: Row) => {
      const spare = i === group.rows.length - 1 && blank(row)
      // (In a crossed-out section: struck with it, and fixed — though
      // its own mark is kept for if the section's brought back.)
      const struck = row.struck || group.struck
      if (spare && group.struck) return null
      return (
        <div
          key={row.rid ?? i}
          role="row"
          data-g={g}
          data-i={i}
          data-rid={row.rid}
          {...(g < groups.length ? whenLeft(() => dropIfEmptyLine(row.rid)) : {})}
          onFocus={() => {
            if (row.rid !== undefined) held.current = row.rid
          }}
          className={`${cols} relative items-center border-b border-line-blue`}
        >
          {spare ? (
            <span />
          ) : (
            <span
              role="button"
              aria-label={`Move ${row.name || 'ingredient'}`}
              data-drag-handle
              onPointerDown={(e) =>
                dragRow(
                  e,
                  (to) => moveRow({ g, i }, to),
                  (to) => changes({ g, i }, to),
                )
              }
              className={grip}
            >
              <GripIcon />
            </span>
          )}
          <input
            value={row.name}
            onChange={(e) => update(g, i, { name: e.target.value })}
            onKeyDown={(e) => newLineAfter(e, g, i)}
            enterKeyHint="next"
            readOnly={struck}
            // (Crossed out: not to be written in — nor tapped into, nor
            // tabbed to: a tap goes through it.)
            tabIndex={struck ? -1 : undefined}
            // (Only on the spare line: where the next is written. Not on
            // a line emptied, or opened with Return — it's being written
            // in already; nor on one with something on it but no name — a
            // name isn't needed.)
            placeholder={spare ? 'Add ingredient…' : ''}
            // (No "name" in the label: Safari would offer to AutoFill a
            // contact.)
            aria-label="Ingredient"
            autoComplete="off"
            className={`${cell} pr-1 ${struck ? 'pointer-events-none' : ''}`}
          />
          <QuantityInput
            value={row.quantity}
            onChange={(quantity) => update(g, i, { quantity })}
            onKeyDown={(e) => newLineAfter(e, g, i)}
            enterKeyHint="next"
            placeholder=""
            readOnly={struck}
            // (Fitted to its figures, set against the cell's right: so
            // the last one's stroke isn't cut off — see QuantityInput.
            // The cell's padding less the room past the figures, so
            // they end where they did. Tinted, being written in, as a
            // field is: the whole cell.)
            fitClassName={`${cell} ${rule} flex justify-end pr-px focus-within:bg-kraft/15`}
            className="h-full min-w-[4px] bg-transparent p-0 text-left focus:outline-none"
          />
          <UnitCell
            value={row.unit}
            onChange={(unit) => update(g, i, { unit })}
            units={units}
            disabled={struck}
            className={`${cell} ${rule} pl-1.5`}
          />
          {/* (Its mark: none on the spare line, nor in a section crossed
              out — nor on a line emptied: there's nothing to cross out, and
              an empty line goes anyway, on Save.) */}
          {spare || group.struck || blank(row) ? (
            <span />
          ) : row.struck ? (
            <button
              type="button"
              onClick={() => update(g, i, { struck: false })}
              aria-label={`Bring back ${row.name || 'ingredient'}`}
              className={MARK_BUTTON}
            >
              <RowMark kind="restore" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => update(g, i, { struck: true })}
              aria-label={`Cross out ${row.name || 'ingredient'}`}
              className={MARK_BUTTON}
            >
              <RowMark kind="cross" />
            </button>
          )}
          {struck && stroke}
        </div>
      )
  }

  return (
    <div ref={tableRef} role="table" aria-label="Ingredients">
      {[...groups, null].map((group, g) =>
        group === null ? (
          // "Add section…": a title written here starts a new section (with
          // a line to write its first ingredient on). (Built like a
          // section's title row — a cell where the grip goes, then the
          // field — in the next section's place: see titleField.)
          <div
            key={`t${pending.current.gid}`}
            role="rowgroup"
            ref={addRef}
            className="relative mt-3"
            // (Being written in — its heading, or the line under it: going
            // from one to the other, it stays open. Focus going elsewhere,
            // or nowhere — the keyboard put away — it closes; and at a tap
            // anywhere else (see addRef). But not for a tap within it: on
            // iOS a tap on a button, like a unit's, takes no focus, so it
            // too leaves the field for nowhere.)
            onPointerDownCapture={() => {
              tappingAdd.current = true
              const done = () => setTimeout(() => (tappingAdd.current = false))
              window.addEventListener('click', done, { capture: true, once: true })
              setTimeout(() => (tappingAdd.current = false), 1000)
            }}
            onFocus={() => setAddingSection(true)}
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null
              const area = e.currentTarget
              if (to) {
                if (!area.contains(to)) setAddingSection(false)
              } else
                setTimeout(() => {
                  if (!tappingAdd.current && !area.contains(document.activeElement))
                    setAddingSection(false)
                })
            }}
          >
            {/* (Tapped into, before anything's written: already laid out as
                a section — its column heads beside its heading, a line under
                it for its first ingredient — as it will be once it's one;
                no grips yet: there's nothing to move.) */}
            <div
              role="row"
              data-new-section={g}
              data-new-label={HEADING_HINT}
              className={`${
                addingSection ? cols : 'grid grid-cols-[1rem_minmax(0,1fr)]'
              } items-end border-b border-line-blue`}
            >
              <span />
              <div className="grid">
                {titleField(
                  '',
                  (t) => {
                    // (A section now, the field its title: a new "Add
                    // section…" below, not being written in.)
                    setAddingSection(false)
                    const { gid } = pending.current
                    renewPending()
                    set([...groups, { title: t, rows: [], gid }])
                  },
                  // (Being written in: what's written here is its heading.)
                  addingSection ? HEADING_HINT : 'Add section…',
                )}
              </div>
              {addingSection && (
                <>
                  <span role="columnheader" className={`${headClass} pb-[6px] pr-1 text-right`}>
                    Qty
                  </span>
                  <span role="columnheader" className={`${headClass} pb-[6px] pl-1.5`}>
                    Unit
                  </span>
                  <span />
                </>
              )}
            </div>
            {addingSection
              ? (() => {
                  const first = { name: '', rid: pending.current.rid }
                  return [lineRow(g, { title: '', rows: [first] }, 0, first)]
                })()
              : []}
          </div>
        ) : (
        <div
          key={`t${group.gid ?? g}`}
          role="rowgroup"
          data-gid={group.gid}
          className={`relative ${g > 0 ? 'mt-3' : ''}`}
          {...whenLeft(() => dropIfEmptySection(group.gid))}
        >
          {/* The section's title, beside its column headings: its grip, to
              drag the whole section by (when there's more than one), and its
              mark, to cross the whole section out. */}
          <div
            role="row"
            className={`${cols} relative items-end border-b border-line-blue`}
          >
            {groups.length > 1 ? (
              <span
                role="button"
                aria-label={`Move ${group.title || 'section'}`}
                data-drag-handle
                onPointerDown={(e) => dragSection(e, (to) => moveSection(g, to))}
                className={`${grip} h-[34px]`}
              >
                <GripIcon />
              </span>
            ) : (
              <span />
            )}
            <div className="grid">
              {titleField(
                group.title,
                (t) => setTitle(g, t),
                // (Untitled: that a heading's optional.)
                HEADING_HINT,
                group.struck,
              )}
            </div>
            {/* (Raised as the title is: written on the same line.) */}
            <span role="columnheader" className={`${headClass} pb-[6px] pr-1 text-right`}>
              Qty
            </span>
            <span role="columnheader" className={`${headClass} pb-[6px] pl-1.5`}>
              Unit
            </span>
            {/* (Its mark — none on a section with no heading and nothing in
                it: there's nothing to cross out, and it goes anyway, on
                Save.) */}
            {!group.struck && !group.title.trim() && group.rows.every(blank) ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() => setStruck(g, !group.struck)}
                aria-label={
                  group.struck
                    ? `Bring back ${group.title || 'section'}`
                    : `Cross out ${group.title || 'section'}`
                }
                className={`${MARK_BUTTON} self-center`}
              >
                <RowMark kind={group.struck ? 'restore' : 'cross'} />
              </button>
            )}
            {group.struck && stroke}
          </div>
          {group.rows.map((row, i) => lineRow(g, group, i, row))}
        </div>
        ),
      )}
    </div>
  )
}

// Fetch the handwriting now, so it's ready the first time a card turns over
// (it's set to show nothing rather than a stand-in font while loading).
if (typeof document !== 'undefined') void document.fonts?.load('22px Caveat')

const NOTES_MIN_LINES = 6
const NOTES_HINT = 'Prep tips, substitutions…'
/** How far the notes' writing is set down from the top of its lines: so
 *  little it stands a touch clear of each line's rule (resting right on it,
 *  the caret dips below the rule, and looks wrong). */
const NOTES_DROP = 0

/** What a recipe says (its words, nothing else). */
const textOf = (r: RecipeText): RecipeText => ({
  title: r.title,
  ingredients: r.ingredients,
  ingredientsTitle: r.ingredientsTitle,
  sections: r.sections,
  notes: r.notes,
  tags: r.tags,
})
/** What a recipe says, as saving would leave it — blank lines, stray
 *  spaces and empty untitled sections set aside (to tell whether a draft
 *  says anything different: whether saving would change anything). */
const sameText = (a: RecipeText, b: RecipeText) => {
  const key = (r: RecipeText) => {
    const kept = sectionsFromGroups(
      sectionsOf(r as Recipe).map((s) => ({ title: s.title, rows: s.ingredients })),
    )
    return JSON.stringify([
      r.title.trim(),
      [
        { title: kept.ingredientsTitle ?? '', ingredients: kept.ingredients },
        ...(kept.sections ?? []),
      ].map((s) => [
        s.title,
        s.ingredients.map((i) => [i.name, i.quantity ?? null, i.unit || null]),
      ]),
      (r.notes ?? '').trim(),
      r.tags.map((t) => t.trim()).filter(Boolean),
    ])
  }
  return key(a) === key(b)
}

/**
 * The back of a card: the recipe written out on paper fields to edit. Nothing
 * reaches the store until Save.
 */
const RecipeCardBack = forwardRef<
  HTMLDivElement,
  {
    recipe: Recipe
    /** Not saved yet (nothing to delete). */
    isNew?: boolean
    onCancel: () => void
    onSaved: () => void
    onDeleted: () => void
    /** Kept current: whether the draft differs from the recipe as stored. */
    changedRef?: MutableRefObject<boolean>
    /** Kept current: keeps the draft (as Save does, but nothing more —
     *  where the card goes next is the caller's); none while it can't be
     *  saved (no title). */
    saveDraftRef?: MutableRefObject<(() => void) | null>
    /** Kept current: whether someone else has changed the recipe since its
     *  editing began (saving would write over that). */
    conflictRef?: MutableRefObject<boolean>
    /** Keep the draft on the device as it's written (and take it up again,
     *  if one was kept for this recipe): it outlives leaving the app. */
    remember?: boolean
    /** Taken up as it was left (the app opened again): any dialog it had
     *  open is open again. */
    resumed?: boolean
  } & HTMLAttributes<HTMLDivElement>
>(function RecipeCardBack(
  {
    recipe,
    isNew = false,
    onCancel,
    onSaved,
    onDeleted,
    changedRef,
    saveDraftRef,
    conflictRef,
    remember = false,
    resumed = false,
    className = '',
    style,
    ...rest
  },
  ref,
) {
  const upsertRecipe = useStore((s) => s.upsertRecipe)
  const deleteRecipe = useStore((s) => s.deleteRecipe)
  // An edit of this recipe kept from before (the app left, or a new version
  // put in place, mid-edit): taken up where it was.
  const [kept] = useState(() => {
    if (!remember) return null
    const k = loadDraft()
    return k && 'draft' in k && k.draft.recipeId === recipe.id ? k.draft : null
  })
  // What the recipe said when its editing began.
  const [base] = useState<RecipeText>(() => kept?.base ?? textOf(recipe))
  const [title, setTitle] = useState(kept?.title ?? recipe.title)
  const titleTapIn = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const [titleFocused, setTitleFocused] = useState(false)
  const [groups, setGroups] = useState<Group[]>(() =>
    withoutEmpties(
      tidyGroups(
        kept
          ? kept.groups
          : sectionsOf(recipe).map((s) => ({
              title: s.title,
              rows: s.ingredients,
            })),
      ),
    ),
  )
  const [notes, setNotes] = useState(kept?.notes ?? recipe.notes ?? '')
  const [tagsText, setTagsText] = useState(
    kept?.tagsText ?? recipe.tags.join(', '),
  )
  // (Kept on the device, if the edit is: the app opened again, it's still
  // asking.)
  const [confirmingDelete, setConfirmingDelete] = useKeptDialog(
    remember ? `card:delete:${recipe.id}` : null,
    resumed,
  )
  const [confirmingOverwrite, setConfirmingOverwrite] = useKeptDialog(
    remember ? `card:overwrite:${recipe.id}` : null,
    resumed,
  )
  // Kept as it's written. (Forgotten by the card in hand once editing's
  // over: saved, or the changes let go.)
  useEffect(() => {
    if (remember)
      keepDraft({ recipeId: recipe.id, isNew, base, title, tagsText, notes, groups })
  }, [remember, recipe.id, isNew, base, title, tagsText, notes, groups])

  // The ruled line `text` (the notes' writing, from the start) ends on —
  // laid out in the copy beside the field, as in it: wrapped lines and all.
  // (Measured there, never by changing the field's own size: that shrinks
  // the card for a moment, and the card jumps.)
  const notesMirrorRef = useRef<HTMLSpanElement>(null)
  const lineAfter = (text: string) => {
    const mirror = notesMirrorRef.current
    if (!mirror) return 0
    mirror.textContent = text
    const mark = document.createElement('span')
    mark.textContent = '\u200b'
    mirror.appendChild(mark)
    // (By its middle: the handwriting's taller than its lines, so its top
    // edge rides up into the line above.)
    const mid = mark.offsetTop + mark.offsetHeight / 2
    mirror.textContent = ''
    return Math.max(0, Math.floor((mid - NOTES_DROP) / 22))
  }
  /** How many ruled lines the notes' writing takes up. */
  const notesLines = (text: string) => lineAfter(text) + 1

  // Notes grow a ruled line at a time as you write, so they never scroll.
  // (The writing is set NOTES_DROP down from the top of its lines.)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = notesRef.current
    if (!el) return
    // (No more lines than written, or the fewest: tapping a line below the
    // writing goes on from there — but never adds to them. More room is
    // typed in: Return.)
    el.style.height = `${
      Math.max(NOTES_MIN_LINES, notesLines(el.value)) * 22 + NOTES_DROP
    }px`
  }, [notes])
  // Tapped on an empty line below what's written: the writing goes on from
  // that line, as on paper — the lines between left blank (no need to type
  // them in first). (Blank lines left at the end go when it's saved.)
  // The line the caret's on (null: not writing in the notes).
  const [notesLine, setNotesLine] = useState<number | null>(null)
  const findNotesLine = () => {
    const el = notesRef.current
    if (!el || document.activeElement !== el) return setNotesLine(null)
    setNotesLine(lineAfter(el.value.slice(0, el.selectionEnd)))
  }
  const findNotesLineRef = useRef(findNotesLine)
  findNotesLineRef.current = findNotesLine
  useLayoutEffect(() => {
    findNotesLineRef.current()
  }, [notes])
  // (The caret moved some other way — dragged, say: still followed.)
  useEffect(() => {
    const onSelection = () => {
      if (document.activeElement === notesRef.current) findNotesLineRef.current()
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [])
  const caretTo = useRef<number | null>(null)
  const onNotesClick = (e: ReactMouseEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const line = Math.floor(
      (e.clientY - el.getBoundingClientRect().top - NOTES_DROP) / 22,
    )
    const last = notesLines(el.value) - 1 // the line the writing ends on
    if (line <= last) return
    const value = el.value + '\n'.repeat(line - last)
    caretTo.current = value.length
    setNotes(value)
  }
  useLayoutEffect(() => {
    const el = notesRef.current
    if (!el || caretTo.current === null) return
    el.setSelectionRange(caretTo.current, caretTo.current)
    caretTo.current = null
  }, [notes])

  // The recipe as drafted (see sectionsFromGroups).
  const draft = (): Recipe => ({
    ...recipe,
    title: title.trim(),
    ...sectionsFromGroups(groups),
    notes: notes.trim() || undefined,
    tags: tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  })
  // Changed: saving would leave it saying something different. (Lines or
  // sections crossed out that change nothing saved — a new section's, say —
  // aren't a change.)
  const dirty = !sameText(draft(), recipe)
  if (changedRef) changedRef.current = dirty
  // Where the asterisk goes: just past the end of the title (centred in its
  // box), or — the title filling the box — just past the box.
  const titleBoxRef = useRef<HTMLDivElement>(null)
  const titleMeasureRef = useRef<HTMLSpanElement>(null)
  const [asteriskAt, setAsteriskAt] = useState(0)
  useLayoutEffect(() => {
    const place = () => {
      const box = titleBoxRef.current?.clientWidth ?? 0
      const text = titleMeasureRef.current?.offsetWidth ?? 0
      setAsteriskAt(Math.min(box + 2, (box + text) / 2 + 5))
    }
    place()
    // (Once the handwriting's in: it's wider than what stood in for it.)
    void document.fonts?.ready.then(place)
    const ro = new ResizeObserver(place)
    if (titleBoxRef.current) ro.observe(titleBoxRef.current)
    return () => ro.disconnect()
  }, [title, dirty])

  // Someone else has saved a change to it since its editing began: saving
  // now writes over theirs. (A new recipe has no one else's.)
  const conflict = !isNew && !sameText(base, recipe)
  if (conflictRef) conflictRef.current = conflict
  const save = () => {
    if (conflict && !confirmingOverwrite) return setConfirmingOverwrite(true)
    setConfirmingOverwrite(false)
    upsertRecipe(draft())
    onSaved()
  }
  if (saveDraftRef)
    saveDraftRef.current = title.trim() ? () => upsertRecipe(draft()) : null

  const label = 'block text-[22px] font-semibold leading-[26px]'

  return (
    <div
      ref={ref}
      {...rest}
      className={`paper-card relative flex flex-col text-left ${className}`}
      style={{ minHeight: CARD_H, ...style }}
    >
      {/* Written by hand: a draft, before it's typed up on the front. */}
      <div className="handwritten relative flex flex-1 flex-col">
        {/* (Underlined in the same pen as the writing.) */}
        <div className="mx-5 mt-3.5 flex items-center gap-2 border-b-[1.5px] border-pen pb-0.5">
          {/* The favorite star, as on the front — kept at once. (Not on a
              new card until it's saved: there's no recipe yet.) */}
          {isNew ? (
            // (Room the star would take, so the title sits centred between
            // it and the asterisk's room.)
            <span aria-hidden className="shrink-0" style={{ width: STAR_ROOM }} />
          ) : (
            <FavoriteStar recipeId={recipe.id} />
          )}
          {/* Not being written in, the title is shown as on the front (a
              long one cut off, feathered, dragged sideways to read); tapped,
              it's written in, the caret at its end. */}
          <div ref={titleBoxRef} className="relative flex min-w-0 flex-1">
          {/* With changes not yet saved: an asterisk just past the title's
              end — beside it, not in it (in red, not the pen's blue, so it's
              not taken for part of it). A title that fills the line: past
              its edge, in the room beside it. */}
          {dirty && (
            <span
              role="img"
              aria-label="Unsaved changes"
              title="Unsaved changes"
              // (Over the title's line — whose fading end reaches past the
              // title — and with room round the stroke, which reaches past
              // its own width: either would cut it off on iOS.)
              className="pointer-events-none absolute top-0 z-[1] px-[0.2em] text-[30px] font-semibold leading-[30px] text-danger"
              style={{ left: `calc(${asteriskAt}px - 0.2em)` }}
            >
              *
            </span>
          )}
          {/* (The title's width as written, to put the asterisk past it —
              measured in a box of no size, so a long one widens nothing:
              the card would scroll sideways.) */}
          <span aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
            <span
              ref={titleMeasureRef}
              className="invisible absolute whitespace-pre text-[30px] font-semibold leading-[30px]"
            >
              {/* (No title yet: past the hint, which is showing.) */}
              {title || 'Recipe'}
            </span>
          </span>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
            // Tapped into, the caret goes to the end of the title (not where
            // the tap fell). Only on the tap that brings it in: once it's
            // being written in, a tap places the caret as usual.
            onPointerDown={(e) => {
              titleTapIn.current = document.activeElement !== e.currentTarget
            }}
            onClick={(e) => {
              if (!titleTapIn.current) return
              titleTapIn.current = false
              const end = e.currentTarget.value.length
              e.currentTarget.setSelectionRange(end, end)
              e.currentTarget.scrollLeft = e.currentTarget.scrollWidth
            }}
            // (No "name" or "title" here: Safari would offer to AutoFill a
            // contact.)
            placeholder="Recipe"
            aria-label="Recipe"
            autoComplete="off"
            // (A title: each word capitalised, as the keyboard types it.)
            autoCapitalize="words"
            className="min-w-0 flex-1 bg-transparent text-center text-[30px] font-semibold leading-[30px] focus:outline-none"
            // (Shown by the line over it while not being written in.)
            style={!titleFocused && title ? { color: 'transparent' } : undefined}
          />
          {!titleFocused && title && (
            <div
              aria-hidden
              className="absolute inset-0 flex cursor-text items-center"
              onClick={() => {
                const field = titleRef.current
                if (!field) return
                field.focus()
                setTitleFocused(true) // (whether or not the window has focus)
                const end = field.value.length
                field.setSelectionRange(end, end)
                field.scrollLeft = field.scrollWidth
              }}
            >
              <div className="min-w-0 flex-1 text-center text-[30px] font-semibold leading-[30px]">
                {/* (A vertical drag on it is the card's, as on the front.) */}
                <OneLine text={title} panY={false} />
              </div>
            </div>
          )}
          </div>
          {/* (Balancing the star, so the title sits centred.) */}
          <span aria-hidden className="shrink-0" style={{ width: STAR_ROOM }} />
        </div>
        <div className="mx-5 mt-3.5 mb-4 flex flex-col gap-4">
          <IngredientTable
            groups={groups}
            onChange={setGroups}
            headClass={label}
          />
          <label className="block">
            <span className={label}>Tags</span>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="dinner, kid-friendly"
              autoComplete="off"
              // (Tags are written lowercase.)
              autoCapitalize="none"
              className="block h-[25px] w-full border-b border-line-blue bg-transparent pt-[3px] pr-1 leading-[21px] focus:bg-kraft/15 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className={label}>Notes</span>
            <span className="relative block">
              {/* The line being written on, tinted as a field is (the caret
                  dips below its line's rule, so it's hard to tell which line
                  it's on by itself): the room above its rule. */}
              {notesLine !== null && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bg-kraft/15"
                  style={{ top: notesLine * 22, height: 21 }}
                />
              )}
              {/* The hint, while nothing's written — blank lines are nothing:
                  a tap on a line further down fills them in. (Not the field's
                  own, which any of them would hide.) A space typed is
                  something: that's written. */}
              {/^[\r\n]*$/.test(notes) && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 truncate pr-1 leading-[22px] text-pencil"
                  style={{ paddingTop: NOTES_DROP }}
                >
                  {NOTES_HINT}
                </span>
              )}
              {/* (The writing up to the caret, laid out as in the field, to
                  find the line the caret's on — wrapped lines and all.) */}
              <span
                ref={notesMirrorRef}
                aria-hidden
                className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words pr-1 leading-[22px]"
                style={{ paddingTop: NOTES_DROP }}
              />
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onClick={onNotesClick}
                onSelect={findNotesLine}
                onFocus={findNotesLine}
                onBlur={() => setNotesLine(null)}
                rows={NOTES_MIN_LINES}
                aria-placeholder={NOTES_HINT}
                autoComplete="off"
                // (Over the tint: the rules drawn on it, the writing clear.)
                className="paper-lines relative block w-full resize-none overflow-hidden bg-transparent pr-1 leading-[22px] focus:outline-none"
                style={{ paddingTop: NOTES_DROP }}
              />
            </span>
          </label>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-1.5">
        {!isNew && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="px-1 py-1.5 text-sm font-medium leading-5 text-danger active:opacity-60"
          >
            Delete
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className={EDIT_CLASS}>
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim()}
          className="rounded-full border border-kraft-edge bg-brand px-4 py-1.5 text-sm font-semibold leading-5 text-on-brand transition active:scale-95 disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {/* (On the body: a fixed dialog inside a turned card would be placed
          relative to the card.) */}
      {confirmingDelete &&
        createPortal(
          <ConfirmDialog
            title="Delete recipe?"
            message={
              <>
                “{recipe.title}” will be deleted for everyone. This can’t be
                undone.
              </>
            }
            confirmLabel="Delete"
            onConfirm={() => {
              setConfirmingDelete(false)
              deleteRecipe(recipe.id)
              onDeleted()
            }}
            onCancel={() => setConfirmingDelete(false)}
          />,
          document.body,
        )}
      {confirmingOverwrite &&
        createPortal(
          <ConfirmDialog
            title="Overwrite changes?"
            message={
              <>
                Someone else has changed “{recipe.title}” since you started
                editing it. Saving will replace their changes with yours.
              </>
            }
            confirmLabel="Save anyway"
            cancelLabel="Keep editing"
            onConfirm={save}
            onCancel={() => setConfirmingOverwrite(false)}
          />,
          document.body,
        )}
    </div>
  )
})

/** Where the card sits in the rolodex (screen space). */
export interface CardOrigin {
  /** Top of its slot (stood upright where it hangs on the wheel), and where
   *  it's clear of the cards in front. */
  slotTop: number
  clearTop: number
  left: number
  width: number
  /** Its natural height (as it is in the rolodex). */
  height: number
  /** The rolodex layer's top edge (the top of the page): a card rising past
   *  it is clipped there — the foreground card's layer starts at the same
   *  edge, so it's clipped identically. */
  viewTop: number
  /** Where a card lifting out goes out of sight behind something (the
   *  header), if that's below `viewTop`. */
  hiddenAbove?: number
  /** How it leans on the wheel: degrees toward you (positive: low on the
   *  wheel, leaning in), its rod's depth, and how far its top is above the
   *  rod — in the wheel's units (see PERSPECTIVE). (None: it stands flat.) */
  lean?: { deg: number; z: number; rodOffset: number }
  /** Its pose on the wheel, and stood upright in place (wrapper transforms). */
  wheelPose: string
  flatPose: string
  /** How shaded it is on the wheel (0–1). */
  shade: number
}

/** The face not showing: out of the layout, over the other (inline, so it
 *  beats a card's own `relative`). */
const OFF_LAYOUT = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
} as const

const EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.25, 1)'
const STAND = 'cubic-bezier(0.4, 0, 0.2, 1)' // standing up off / back onto the wheel

const pose = (dy: number) => `translate(0px, ${dy}px)`
/**
 * A card pulled `fromY` down, going at `v` px/ms, caught and pulled back to
 * its place as by an elastic: a damped spring — on a little way with the
 * pull, back past its place, and settling. (Keyframes, a frame apart.)
 */
const CAUGHT_MS = 640
function caught(fromY: number, v: number): Keyframe[] {
  const zeta = 0.5 // (a bounce, then still)
  const w0 = 2 * Math.PI * 3 // (three swings a second, undamped)
  const wd = w0 * Math.sqrt(1 - zeta * zeta)
  const v0 = Math.min(0.7, Math.max(0, v)) * 1000 // px/s, down; not flung far
  const b = (v0 + zeta * w0 * fromY) / wd
  const frames: Keyframe[] = []
  for (let t = 0; t <= CAUGHT_MS; t += 16) {
    const s = t / 1000
    const x =
      Math.exp(-zeta * w0 * s) * (fromY * Math.cos(wd * s) + b * Math.sin(wd * s))
    frames.push({ offset: t / CAUGHT_MS, transform: pose(x) })
  }
  frames[frames.length - 1] = { offset: 1, transform: pose(0) }
  return frames
}
/** A card in hand (or one beside it) slid `dx` sideways. */
const sideways = (dx: number) => `translate(${dx}px, 0px)`
/** How much of the cards either side of the card in hand shows, at the
 *  screen's edges — just a sliver, saying there's more to swipe to. */
const BESIDE_PEEK = 5
/** How far they slide (off the screen, shadow and all) as it's put away. */
const BESIDE_AWAY = 60
/** …and how long that takes, coming in (in place as the card in hand is)
 *  and going (as it's put away). */
const BESIDE_IN_MS = 650
const BESIDE_OUT_MS = 750
/** How much sooner than the card in hand they're in place. */
const BESIDE_LEAD_MS = 175
const BESIDE_EASE = 'cubic-bezier(0.3, 0, 0.5, 1)'
/** Room around a card in hand, in the layer it rests in (and so in those
 *  beside it). */
const HAND_PADDING = {
  paddingTop: '12vh',
  paddingBottom: 'max(12vh, calc(var(--safe-bottom) + 32px))',
}
/** How much wider a card in hand is than its column, each side. (None: just
 *  room enough either side for the slivers of the cards beside it.) */
const HAND_GROW = 0

/** Leaving the back with changes, to go on to: turning it back over, or
 *  putting it away. */
type Discarding = 'cancel' | 'putAway'

/** The card in hand, as kept on the device (see CardDetail's `remember`). */
export interface Hand {
  recipeId: string
  /** A new recipe, never saved (its edit's kept as a draft). */
  isNew: boolean
  scroll: number
  editing: boolean
}
export const HAND: Slice<Hand> = {
  key: 'hand',
  version: 1,
  maxAgeMs: DAY,
  parse: (x) =>
    isObj(x) && typeof x.recipeId === 'string'
      ? {
          recipeId: x.recipeId,
          isNew: bool(x.isNew),
          scroll: num(x.scroll) ?? 0,
          editing: bool(x.editing),
        }
      : null,
}

/** How a card comes out of the rolodex (or a pocket) into your hand:
 *  - 'arc': it slides up out of its slot and hands over, mid-flight, to the
 *    card in hand, on one continuous arc.
 *  - 'lift': it lifts straight up out of its slot and off the screen, as
 *    the card in hand slides up from below the screen to where it rests
 *    (putting it back, the card in hand fades out as the other drops back
 *    into its slot). */
// ('arc' predates the Recipes rolodex being drawn scaled down: its flight
// would need converting to the stage's units before being used there again.)
const TAKE_OUT: 'arc' | 'lift' = 'lift'
const LIFT_MS = 409 // the card lifting out of the box (after its sink)
/** Taking a card out, it first sinks a little into the box, as if pressed,
 *  then springs out; putting it back, it drops in past its place, then
 *  settles back up to it. */
const SINK_PX = 14
const SINK_MS = 130
const SETTLE_MS = 140
const SETTLE = 'cubic-bezier(0.3, 0, 0.3, 1)' // back up to its place
const SINK = 'cubic-bezier(0.25, 0.6, 0.4, 1)' // easing into the bottom
const DROP_MS = 300 // …and dropping back in
const RISE_DELAY_MS = SINK_MS + 200 // the card in hand starts sliding up from below (a moment after the other springs out)…
const RISE_MS = 500 // …over this (the shade darkening with it)
const RISE_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)' // quick, then settling into place (as one put back drops in)
const FADE_MS = 225 // putting it back: fading out
/** Let go of while moving, a card coasts on, slowing as it goes. */
const COAST_TAU = 500 // ms; the same slowing as scrolling (0.998 per ms)

/** Keyframes for the card in hand fading away from `fromY` below its place,
 *  coasting on from `v` px/ms (if it was flung) as it fades. */
function fadingAway(fromY: number, v: number, opacity: number): Keyframe[] {
  const frames: Keyframe[] = []
  const n = 12
  for (let i = 0; i <= n; i++) {
    const k = i / n
    const t = k * FADE_MS
    frames.push({
      offset: k,
      transform: pose(fromY + v * COAST_TAU * (1 - Math.exp(-t / COAST_TAU))),
      opacity: opacity * (1 - k * k), // easing in
    })
  }
  return frames
}

const LIFT_FADE_MS = 504 // …fading out as it goes (still fading once out of sight)
const LIFT_FADE = 'cubic-bezier(0.5, 0, 0.75, 0)' // ease-in (quartic): barely fading at first, then quickly gone
const LIFT_UP = 'cubic-bezier(0.32, 0, 0.67, 0)' // slow to start, gathering speed
const DROP_IN = 'cubic-bezier(0.33, 1, 0.68, 1)' // the take-out's curve, reversed: fast, then settling

/**
 * The lifted card. One continuous motion takes the card from wherever it
 * hangs on the wheel to its place near the top of the screen: inside the
 * rolodex it stands upright where it is and slides up out of its slot (the
 * cards in front still hide it), then this card takes over mid-flight, on the
 * same clock, so the motion never stops. The card is always its full height —
 * a long one scrolls, the whole card, on the shade. Putting it back flies the
 * same kind of path in reverse and lays it back onto the wheel. Tap the shade
 * or pull the card down to put it back. All motion is keyframes — nothing
 * renders mid-flight.
 *
 * Edit turns the card over: its back has the recipe on paper fields. Save or
 * Cancel turns it back. Turned over, tapping the shade or pulling it down
 * puts it away as it is — once you've confirmed it, if the draft
 * says anything different from the recipe (as does Cancel, or Escape).
 */
export function CardDetail({
  recipe,
  origin,
  getOrigin,
  getRolodexCard,
  canEditRecipes,
  canEditPlan,
  renderActions,
  isNew = false,
  step,
  remember = false,
  resume,
  onClosed,
}: {
  recipe: Recipe
  /** The card's slot at the moment it was tapped (fixes the card's width). */
  origin: CardOrigin
  /** Its slot now (for putting it back). */
  getOrigin: () => CardOrigin | null
  /** The card element in the rolodex (its parent rides the wheel). */
  getRolodexCard: () => HTMLElement | undefined
  canEditRecipes: boolean
  canEditPlan: boolean
  /** Replaces the card's usual actions (Add to Meal · Edit). `dismiss` fades
   *  the card away instead of putting it back (for when it's leaving, e.g.
   *  removed from a meal; onClosed follows either way); `edit` turns it over. */
  renderActions?: (api: { dismiss: () => void; edit: () => void }) => ReactNode
  /** A new recipe: the card rises into view from below already turned over
   *  to its (empty) back. Cancel lets it fall away; Save turns it to its
   *  front, a recipe like any other. */
  isNew?: boolean
  /** Swiping it sideways (its front): the recipes either side of it in the
   *  box (just off the screen, sliding in as it's swiped), and taking one in
   *  hand instead — `dir` 1 the next, -1 the one before (`recipe` then
   *  changes under this card). */
  /** Keep it on the device — which card's in hand, how far down it's
   *  scrolled, whether it's turned over to edit (and the edit itself) — so
   *  leaving the app, or a new version of it, comes back to it. Forgotten
   *  once it's put away. */
  remember?: boolean
  /** Taken up as it was kept: how far down, and whether turned over. */
  resume?: { scroll: number; editing: boolean }
  step?: {
    prev: Recipe
    next: Recipe
    /** The ones beyond those (two along: off the screen till swiped to). */
    before: Recipe
    after: Recipe
    go: (dir: 1 | -1) => void
    /** Swiped `p` of the way toward the one beside it `dir` (0: not at
     *  all): whatever's behind follows along. */
    preview: (dir: 1 | -1, p: number) => void
  }
  onClosed: () => void
}) {
  const stepRef = useRef(step)
  stepRef.current = step
  const prevRef = useRef<HTMLDivElement>(null) // the card before it, off left
  const nextRef = useRef<HTMLDivElement>(null) // and after it, off right
  // (Their layers: slid off as it comes and goes.)
  const prevLayerRef = useRef<HTMLDivElement>(null)
  const nextLayerRef = useRef<HTMLDivElement>(null)
  // And the cards beyond those, further off: swiped, the one coming next
  // is already there, coming into view behind it.
  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const beforeLayerRef = useRef<HTMLDivElement>(null)
  const afterLayerRef = useRef<HTMLDivElement>(null)
  // How far they've gone (0: in place, 1: off the screen).
  const besideGone = useRef(0)
  // How far down each card was scrolled, swiping from one to the next —
  // shown that way beside it, and again in hand. (Forgotten once it's put
  // away: this card goes, and it with it.)
  const scrolls = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    if (!step) return
    // (Their layers lay them out just as the card in hand's does: scrolled
    // the same, they show what it would.)
    if (prevLayerRef.current)
      prevLayerRef.current.scrollTop = scrolls.current.get(step.prev.id) ?? 0
    if (nextLayerRef.current)
      nextLayerRef.current.scrollTop = scrolls.current.get(step.next.id) ?? 0
    if (beforeLayerRef.current)
      beforeLayerRef.current.scrollTop =
        scrolls.current.get(step.before.id) ?? 0
    if (afterLayerRef.current)
      afterLayerRef.current.scrollTop = scrolls.current.get(step.after.id) ?? 0
  }, [step?.prev.id, step?.next.id, step?.before.id, step?.after.id])
  // In hand, you're cooking from it: the screen stays on till it's put back.
  useWakeLock()
  // Show the recipe as it is now (it may be edited while in hand).
  const live = useStore((s) => s.recipes.find((r) => r.id === recipe.id))
  const shown = live ?? recipe
  const cardRef = useRef<HTMLDivElement>(null) // flies (wraps both faces)
  const flipRef = useRef<HTMLDivElement>(null) // turns over
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  // (Comes out already turned over: a new card, or one left mid-edit.)
  const onBack = isNew || !!resume?.editing
  const [editing, setEditing] = useState(onBack) // the back is there
  const [facing, setFacing] = useState<'front' | 'back'>(
    onBack ? 'back' : 'front',
  )
  const editingRef = useRef(onBack)
  const unsaved = useRef(isNew) // a new card not yet saved
  const changed = useRef(false) // its back says something different
  // Leaving the back, waiting on "Discard changes?" — then going on as you
  // were: turning it back over ('cancel') or putting it away ('putAway').
  // (Kept on the device: the app opened again, it's still asking.)
  const discardId = (k: Discarding) => `card:discard:${k}:${recipe.id}`
  const [discarding, setDiscardingState] = useState<Discarding | null>(() => {
    if (!remember || !resume) return null
    const kept = keptDialog()
    return (['cancel', 'putAway'] as const).find((k) => kept === discardId(k)) ?? null
  })
  // (Asking again on opening: once more, once its back's drawn — what it
  // says, and whether it can be saved, are only known then.)
  const [, redraw] = useState(0)
  useLayoutEffect(() => {
    if (discarding) redraw(1) // (before it's drawn)
  }, [])
  const setDiscarding = (k: Discarding | null) => {
    setDiscardingState(k)
    if (!remember) return
    if (k) keepDialog(discardId(k))
    else if (discarding) forgetDialog(discardId(discarding))
  }
  const saveDraft = useRef<(() => void) | null>(null)
  const conflict = useRef(false) // someone else has changed it meanwhile
  const discardingRef = useRef(false)
  discardingRef.current = !!discarding
  const flipping = useRef(false)
  const shadeRef = useRef<HTMLDivElement>(null) // the shadow over the rolodex
  const scrollRef = useRef<HTMLDivElement>(null) // the card scrolls in this
  const rootRef = useRef<HTMLDivElement>(null)
  const restTop = useRef(0)
  const closing = useRef(false)
  const onClosedRef = useRef(onClosed)
  onClosedRef.current = onClosed

  /**
   * Fly the card along `arc`. `base` is the screen top of the card's layout
   * box (poses are offsets from it). The rolodex card flies until the swap
   * (opening) or from it (closing) and this card the rest; while the rolodex
   * card is flying it also stands up off the wheel (or lies back onto it).
   */
  const fly = (arc: Arc, o: CardOrigin, opening: boolean, base: number) => {
    const card = cardRef.current!
    const shade = shadeRef.current!
    const rdxCard = getRolodexCard()
    const rdxWrap = rdxCard?.parentElement ?? undefined
    const rdxDim =
      rdxCard?.querySelector<HTMLElement>('.rolodex-dim') ?? undefined
    const T = arc.duration
    // Swap when the card is clear of the cards in front — and not before it
    // has had time to stand up (a card with nothing in front clears at once).
    const minStand = Math.min(0.35 * T, 160)
    // (No card in the rolodex — e.g. a new one rising from below: this card
    // flies the whole way.)
    const tSwap = !rdxCard
      ? opening
        ? 0
        : T
      : arc.apex
        ? arc.tHand
        : opening
          ? Math.max(arc.tHand, minStand)
          : Math.min(arc.tHand, T - minStand)
    const ySwap = arc.y(tSwap)
    const inFg = (t: number) => (opening ? t >= tSwap : t < tSwap)
    const times = [...new Set([...sampleTimes(arc), tSwap])].sort(
      (a, b) => a - b,
    )

    const fgFrames: Keyframe[] = []
    const rdxFrames: Keyframe[] = []
    const push = (offset: number, fg: boolean, y: number) => {
      const yf = fg ? y : ySwap
      const yr = fg ? ySwap : y
      fgFrames.push({
        offset,
        opacity: fg ? 1 : 0,
        // Transform only (it runs on the compositor). The card is clipped by
        // the edge of the layer it's in — never by an animated clip, which
        // would run on the main thread and lag the motion.
        transform: pose(yf - base),
      })
      rdxFrames.push({
        offset,
        opacity: fg ? 0 : 1,
        transform: `translateY(${yr - o.slotTop}px)`,
      })
    }
    // Keyframe offsets must stay within [0, 1] exactly.
    const at = (t: number) => Math.min(1, Math.max(0, t / T))
    times.forEach((t, i) => {
      const offset = at(t)
      // The swap is a step: duplicate the instant on each side.
      if (t === tSwap && i > 0) push(offset, !inFg(t), ySwap)
      push(offset, inFg(t), arc.y(t))
    })

    const s = at(tSwap)
    const wrapFrames: Keyframe[] = opening
      ? [
          { offset: 0, transform: o.wheelPose, easing: STAND },
          { offset: s, transform: o.flatPose },
          { offset: 1, transform: o.flatPose },
        ]
      : [
          { offset: 0, transform: o.flatPose },
          { offset: s, transform: o.flatPose, easing: STAND },
          { offset: 1, transform: o.wheelPose },
        ]
    const dimFrames: Keyframe[] = opening
      ? [
          { offset: 0, opacity: o.shade, easing: STAND },
          { offset: s, opacity: 0 },
          { offset: 1, opacity: 0 },
        ]
      : [
          { offset: 0, opacity: 0 },
          { offset: s, opacity: 0, easing: STAND },
          { offset: 1, opacity: o.shade },
        ]
    const shadeFrames: Keyframe[] = opening
      ? [
          { offset: 0, opacity: 0 },
          { offset: s, opacity: 0 },
          { offset: 1, opacity: 1 },
        ]
      : [
          { offset: 0, opacity: Number(getComputedStyle(shade).opacity) },
          { offset: Math.max(0.01, s), opacity: 0 },
          { offset: 1, opacity: 0 },
        ]

    const timing = { duration: T, easing: 'linear', fill: 'both' as const }
    for (const el of [card, rdxCard, rdxWrap, rdxDim])
      el?.getAnimations().forEach((a) => a.cancel())
    const anims = [
      card.animate(fgFrames, timing),
      rdxCard?.animate(rdxFrames, timing),
      rdxWrap?.animate(wrapFrames, timing),
      rdxDim?.animate(dimFrames, timing),
      shade.animate(shadeFrames, timing),
    ]
    // Same clock, to the frame.
    const now = document.timeline.currentTime
    for (const a of anims) if (a) a.startTime = now
    return anims[0]!
  }

  /**
   * 'lift' (see TAKE_OUT): the card in the rolodex lifts straight up out of
   * its slot and off the top of the screen (keeping its tilt) while this
   * card fades in where it rests — or, putting it back,
   * fades out where it is (`fromY` below its place) while the other drops
   * back into its slot.
   */
  const liftFade = (
    o: CardOrigin,
    rdxCard: HTMLElement,
    opening: boolean,
    fromY = 0,
    fromV = 0,
  ) => {
    const card = cardRef.current!
    const shade = shadeRef.current!
    // (Pulled down, it's already partly faded.)
    const cardOpacity = Number(card.style.opacity || 1)
    card.style.opacity = ''
    for (const el of [card, rdxCard]) el.getAnimations().forEach((a) => a.cancel())
    // It keeps its tilt on the wheel and slides straight up along its own
    // face, out of its slot, until it's out of sight (behind the header, or
    // past the top of the page; shadow and all). Tilted, it covers less of
    // the screen for the same slide, so measure how far that is.
    //
    // A card leaning toward you comes closer as it slides up its face; a
    // long one would reach the eye of the perspective (and vanish) before
    // it was out of sight. So it slides no closer than halfway there — and
    // if that's short of out of sight, it's faded out by the time it stops.
    const lean = o.lean
    const maxSlide =
      lean && lean.deg > 1
        ? (PERSPECTIVE / 2 - lean.z) / Math.sin((lean.deg * Math.PI) / 180) -
          lean.rodOffset
        : Infinity
    const clearOf = (o.hiddenAbove ?? o.viewTop) - 24
    const inline = rdxCard.style.transform
    const bottomAt = (d: number) => {
      rdxCard.style.transform = `translateY(${d}px)`
      return rdxCard.getBoundingClientRect().bottom
    }
    const b0 = bottomAt(0)
    const within = (d: number) => Math.max(d, -maxSlide)
    let d = within(clearOf - b0)
    for (let i = 0; i < 4; i++) {
      const b = bottomAt(d)
      if (b <= clearOf || d <= -maxSlide) break
      d = within(d * ((b0 - clearOf) / Math.max(1, b0 - b)) * 1.1)
    }
    rdxCard.style.transform = inline
    // (Stopped short of out of sight: gone by the time it stops.)
    const fadesWithSlide = d <= -maxSlide
    const gone = `translateY(${d}px)`
    const home = 'translateY(0px)'
    const lift = {
      duration: opening ? LIFT_MS : DROP_MS,
      fill: 'both' as const,
    }
    const fade = { duration: FADE_MS, fill: 'both' as const }
    const rise = {
      duration: RISE_MS,
      delay: RISE_DELAY_MS,
      fill: 'both' as const,
    }
    // (From just out of sight below the screen, shadow and all.)
    const below = window.innerHeight + 24 - restTop.current
    const anims = opening
      ? [
          // It sinks a little into its slot, then springs up out of it;
          // and fades out as it goes, gently at first.
          rdxCard.animate(
            [
              { offset: 0, transform: home, easing: SINK },
              {
                offset: SINK_MS / (SINK_MS + LIFT_MS),
                transform: `translateY(${SINK_PX}px)`,
                easing: LIFT_UP,
              },
              { offset: 1, transform: gone },
            ],
            { ...lift, duration: SINK_MS + LIFT_MS },
          ),
          rdxCard.animate([{ opacity: 1 }, { opacity: 0 }], {
            ...lift,
            delay: SINK_MS,
            duration: fadesWithSlide ? LIFT_MS : LIFT_FADE_MS,
            easing: LIFT_FADE,
          }),
          card.animate(
            [{ transform: pose(below) }, { transform: pose(0) }],
            { ...rise, easing: RISE_EASE },
          ),
          // The shade darkens as it comes.
          shade.animate([{ opacity: 0 }, { opacity: 1 }], {
            ...rise,
            easing: 'linear',
          }),
        ]
      : [
          // (From where it stopped short of out of sight, it fades in as
          // it drops — not appearing there all at once.)
          rdxCard.animate(
            [
              {
                offset: 0,
                transform: gone,
                opacity: fadesWithSlide ? 0 : 1,
                easing: DROP_IN,
              },
              {
                offset: DROP_MS / (DROP_MS + SETTLE_MS),
                transform: `translateY(${SINK_PX}px)`,
                opacity: 1,
                easing: SETTLE,
              },
              { offset: 1, transform: home, opacity: 1 },
            ],
            { ...lift, duration: DROP_MS + SETTLE_MS },
          ),
          card.animate(
            fadingAway(fromY, fromV, cardOpacity),
            { ...fade, easing: 'linear' },
          ),
          shade.animate(
            [
              { opacity: Number(getComputedStyle(shade).opacity) },
              { opacity: 0 },
            ],
            { ...fade, easing: 'ease-in' },
          ),
        ]
    // Same clock, to the frame.
    const now = document.timeline.currentTime
    for (const a of anims) if (a) a.startTime = now
    // Opening: the rise (only it is on this card, so its fill is what's
    // dropped once it ends). Closing: whichever ends last.
    if (opening) return anims[2]
    return FADE_MS > DROP_MS ? anims[1] : anims[0]
  }

  // Fly out of the rolodex into place.
  useLayoutEffect(() => {
    const card = cardRef.current!
    // A new card arrives turned over, drawn flat (its front hidden).
    if (onBack && frontRef.current) frontRef.current.style.visibility = 'hidden'
    // (Left scrolled: as it was.)
    if (resume?.scroll && scrollRef.current)
      scrollRef.current.scrollTop = resume.scroll
    // Measure the resting card with no animation applied (StrictMode re-runs
    // this effect in dev while the first one is already in flight).
    card.getAnimations().forEach((x) => x.cancel())
    restTop.current = card.getBoundingClientRect().top
    const rdxCard = TAKE_OUT === 'lift' ? getRolodexCard() : undefined
    if (resume) {
      // Taken up as it was left: already in hand — nothing to see happen.
      // (Its card in the box: out of sight in its slot, as once lifted out;
      // putting it back drops it in from there.)
      rdxCard?.animate([{ opacity: 0 }, { opacity: 0 }], {
        duration: 1,
        fill: 'forwards',
      })
      return
    }
    // (Fading in is the only part on this card, and the first to finish.)
    const anim = rdxCard
      ? liftFade(origin, rdxCard, true)
      : fly(
          arcThrough(origin.slotTop, origin.clearTop, restTop.current),
          origin,
          true,
          restTop.current,
        )
    // Once settled, drop the fill so the card is plain CSS again.
    anim.onfinish = () => {
      if (!closing.current) anim.cancel()
    }
    // The cards either side slide in from off the screen as it fades in.
    besideGone.current = 1
    // (Arriving as it does: in place just before it's fully faded in.)
    void besideTo(
      0,
      BESIDE_IN_MS,
      BESIDE_EASE,
      rdxCard
        ? Math.max(0, RISE_DELAY_MS + RISE_MS - BESIDE_IN_MS - BESIDE_LEAD_MS)
        : 0,
    )
    return () => {
      for (const el of [card, shadeRef.current])
        el?.getAnimations().forEach((x) => x.cancel())
    }
  }, [])

  // Kept on the device as it changes (see `remember`): which card, how far
  // down, whether turned over. Put away, it's forgotten — and any edit with
  // it; taken away otherwise (another tab), it's kept, to come back to.
  const scrolled = useRef(resume?.scroll ?? 0)
  const keepHand = () => {
    if (!remember || closing.current) return
    save(HAND, {
      recipeId: shown.id,
      isNew: isNew && unsaved.current,
      scroll: scrolled.current,
      editing: editingRef.current,
    })
  }
  const keepHandRef = useRef(keepHand)
  keepHandRef.current = keepHand
  useEffect(() => {
    keepHand()
  }, [shown.id, editing])
  useEffect(() => {
    if (!remember) return
    const sc = scrollRef.current!
    const onScroll = () => {
      scrolled.current = sc.scrollTop
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    const stop = onLeave(() => keepHandRef.current())
    return () => {
      sc.removeEventListener('scroll', onScroll)
      stop()
      if (closing.current) {
        save(HAND, null)
        keepDraft(null)
        if (keptDialog()?.startsWith('card:')) keepDialog(null)
      } else keepHandRef.current()
    }
  }, [])
  // Editing over (saved, or the changes let go): the edit's no longer kept.
  const wasEditing = useRef(onBack)
  useEffect(() => {
    if (remember && wasEditing.current && !editing) keepDraft(null)
    wasEditing.current = editing
  }, [editing])

  // Put back: fly from where it is now (after any scrolling or drag) back
  // into its slot.
  const close = (fromY = 0, fromV = 0) => {
    if (closing.current) return
    closing.current = true
    const card = cardRef.current!
    card.style.transform = ''
    scrollRef.current!.style.overflow = 'hidden' // hold still while it flies
    const base = card.getBoundingClientRect().top
    const o = getOrigin()
    if (!o) {
      // Nowhere in view to go back to (e.g. it doesn't match the search):
      // let it fade away instead.
      closing.current = false
      dismiss(fromY, fromV)
      return
    }
    const rdxCard = TAKE_OUT === 'lift' ? getRolodexCard() : undefined
    // Its slot still out of sight (the box turned to it as far as it
    // goes — see getOrigin): it fades away where it is (carrying on down,
    // if pulled), as a card going back does — not flying off the screen.
    if (!rdxCard && TAKE_OUT === 'lift') {
      closing.current = false
      dismiss(fromY, fromV)
      return
    }
    const away = besideAway()
    const anim = rdxCard
      ? liftFade(o, rdxCard, false, fromY, fromV)
      : fly(arcThrough(base + fromY, o.clearTop, o.slotTop), o, false, base)
    // (Done once the cards beside it are gone too.)
    anim.onfinish = () => void away.then(() => onClosedRef.current())
  }
  /** The cards either side of it, `p` of the way gone: slid off the screen,
   *  each the way it is. (Just slid: not faded.) */
  const besideFrame = (p: number): Keyframe[] =>
    [-1, 1].map((side) => ({ transform: sideways(side * p * BESIDE_AWAY) }))
  const besideLayers = () =>
    [prevLayerRef.current, nextLayerRef.current] as const
  /** Set them `p` of the way gone (following a finger). */
  const besideAt = (p: number) => {
    besideGone.current = p
    const frame = besideFrame(p)
    besideLayers().forEach((el, i) => {
      if (!el) return
      el.style.transform = p ? String(frame[i].transform) : ''
    })
  }
  /** Move them from where they are to `p` of the way gone, over `ms`
   *  (resolves when they're there). */
  const besideTo = (p: number, ms: number, easing: string, delay = 0) => {
    const from = besideFrame(besideGone.current)
    const to = besideFrame(p)
    besideAt(p)
    const anims = besideLayers().map((el, i) =>
      el?.animate([from[i], to[i]], {
        duration: ms,
        delay,
        easing,
        fill: 'backwards',
      }),
    )
    return Promise.all(anims.map((a) => a?.finished.catch(() => {})))
  }
  /** Put away (back in its slot, or fading away): they slide off — from
   *  wherever pulling it down has got them to. */
  const besideAtRef = useRef(besideAt)
  besideAtRef.current = besideAt
  const besideToRef = useRef(besideTo)
  besideToRef.current = besideTo
  const besideGoneRef = useRef(() => besideGone.current)
  const besideAway = () =>
    besideTo(
      1,
      BESIDE_OUT_MS * Math.max(0.4, 1 - besideGone.current),
      BESIDE_EASE,
    )
  const closeRef = useRef(close)
  closeRef.current = close
  const dismissRef = useRef<(fromY?: number, v?: number) => void>(() => {})

  // Fade away where it is (it's not going back into its slot), the same
  // fade as putting a card back — from `fromY` below its place, coasting on
  // at `v`, if it was pulled down.
  const dismiss = (fromY = 0, v = 0) => {
    if (closing.current) return
    closing.current = true
    const away = besideAway()
    const card = cardRef.current!
    const shade = shadeRef.current!
    card.getAnimations().forEach((a) => a.cancel())
    const fromOpacity = Number(card.style.opacity || 1)
    card.style.transform = ''
    card.style.opacity = ''
    const timing = { duration: FADE_MS, fill: 'forwards' as const }
    const anim = card.animate(fadingAway(fromY, v, fromOpacity), {
      ...timing,
      easing: 'linear',
    })
    shade.animate(
      [{ opacity: Number(getComputedStyle(shade).opacity) }, { opacity: 0 }],
      { ...timing, easing: 'ease-in' },
    )
    anim.onfinish = () => void away.then(() => onClosedRef.current())
  }
  dismissRef.current = dismiss

  /**
   * Turn the card over (to its back, to edit) or back. It turns about its
   * vertical centre line, speeding up into edge-on and slowing out of it;
   * the faces swap places in the layout at the edge-on instant, where a
   * change of height can't be seen. At rest the turned card is drawn flat
   * (no 3D transforms on its fields, so typing in them is ordinary).
   */
  const flip = (toBack: boolean) => {
    if (flipping.current || closing.current) return
    if (toBack === editingRef.current) return
    flipping.current = true
    const flipper = flipRef.current!
    if (toBack) {
      editingRef.current = true
      flushSync(() => setEditing(true)) // mount the back, out of the layout
    }
    const front = frontRef.current!
    const back = backRef.current!
    // Into 3D: both faces present, the back turned away.
    front.style.visibility = ''
    back.style.visibility = ''
    back.style.transform = 'rotateY(180deg)'
    flipper.style.transform = toBack ? '' : 'rotateY(180deg)'
    const from = toBack ? 0 : 180
    const mid = toBack ? 90 : 90
    const to = toBack ? 180 : 0
    const first = flipper.animate(
      [
        { transform: `rotateY(${from}deg)` },
        { transform: `rotateY(${mid}deg)` },
      ],
      {
        duration: 210,
        easing: 'cubic-bezier(0.55, 0, 1, 0.45)',
        fill: 'forwards',
      },
    )
    first.onfinish = () => {
      // Edge-on: swap which face holds the layout.
      flushSync(() => setFacing(toBack ? 'back' : 'front'))
      const second = flipper.animate(
        [
          { transform: `rotateY(${mid}deg)` },
          { transform: `rotateY(${to}deg)` },
        ],
        {
          duration: 270,
          easing: 'cubic-bezier(0, 0.55, 0.45, 1)',
          fill: 'forwards',
        },
      )
      first.cancel()
      second.onfinish = () => {
        // At rest, flat: the facing side untransformed, the other hidden.
        flipper.style.transform = ''
        back.style.transform = ''
        second.cancel()
        if (toBack) {
          front.style.visibility = 'hidden'
        } else {
          back.style.visibility = 'hidden'
          editingRef.current = false
          flushSync(() => setEditing(false))
        }
        flipping.current = false
      }
    }
  }
  const flipRefFn = useRef(flip)
  flipRefFn.current = flip
  const edit = () => flipRefFn.current(true)
  const unedit = () => flipRefFn.current(false)
  // A new card never saved just goes (fades away from where it is).
  const letGo = (fromY = 0, v = 0) => {
    editingRef.current = false
    dismissRef.current(fromY, v)
  }
  // Leaving the back: straight away if the draft is unchanged, else once
  // you've agreed to lose the changes.
  const goOn = (k: Discarding) =>
    k === 'cancel'
      ? unsaved.current
        ? letGo()
        : flipRefFn.current(false)
      : putAwayRef.current()
  const leave = (k: Discarding) => {
    // (Any unit menu open on it closes first: it's going.)
    closePickers()
    if (changed.current) setDiscarding(k)
    else goOn(k)
  }
  // Cancel: turn back over (or let a new card go).
  const cancel = () =>
    leave('cancel')
  // Put away from the back, as it is (no turning it over first: it fades
  // away as the card in the box drops back in) — from `fromY` below its
  // place, coasting on at `v`, if it was pulled down.
  const putAway = (fromY = 0, v = 0) =>
    unsaved.current ? letGo(fromY, v) : closeRef.current(fromY, v)
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  const putAwayRef = useRef(putAway)
  putAwayRef.current = putAway
  const leaveRef = useRef(leave)
  leaveRef.current = leave

  /** The card in hand and those beside it (and beyond), side by side. */
  const stripCards = () => [
    cardRef.current,
    prevRef.current,
    nextRef.current,
    beforeRef.current,
    afterRef.current,
  ]
  /** Slide the card in hand, and the cards either side of it, `dx` along
   *  (inline: an animation of the slide overrides it while it runs). */
  const slideAll = (dx: number) => {
    const t = dx ? sideways(dx) : ''
    for (const el of stripCards())
      if (el) el.style.transform = t
  }
  const animateAll = (fromX: number, toX: number, opts: KeyframeAnimationOptions) => {
    slideAll(toX)
    const frames = [{ transform: sideways(fromX) }, { transform: sideways(toX) }]
    const anims = stripCards().map(
      (el) => el?.animate(frames, opts),
    )
    // Same clock, to the frame.
    const now = document.timeline.currentTime
    for (const a of anims) if (a) a.startTime = now
    return anims[0]!
  }
  // Between the card in hand and those either side of it: what's left of
  // its margin once their slivers show.
  const besideGap = Math.max(6, origin.left - HAND_GROW - BESIDE_PEEK)
  /** Tell what's behind how far it's been swiped: slid `dx`, as a part of
   *  the way to the card beside it. */
  const reportSlide = (dx: number) => {
    const w = pitch()
    if (w > 0)
      stepRef.current?.preview(dx < 0 ? 1 : -1, Math.min(1, Math.abs(dx) / w))
  }
  const reportSlideRef = useRef(reportSlide)
  reportSlideRef.current = reportSlide
  /** While `anim` slides the cards from `fromX` to `toX`, report how far
   *  each frame — from its own clock (its eased progress), not read back
   *  from the page (which would make it work out its styles every frame). */
  const followRaf = useRef(0)
  const follow = (anim: Animation, fromX: number, toX: number) => {
    cancelAnimationFrame(followRaf.current)
    const tick = () => {
      const p = anim.effect?.getComputedTiming().progress
      reportSlide(p == null ? toX : fromX + (toX - fromX) * p)
      if (anim.playState === 'running')
        followRaf.current = requestAnimationFrame(tick)
    }
    followRaf.current = requestAnimationFrame(tick)
  }
  /** One card's width and the gap to the next, side by side. */
  const pitch = () => (cardRef.current?.offsetWidth ?? 0) + besideGap

  /**
   * Swiped sideways far enough (from `fromX`, at `v` px/ms): the cards slide
   * on together until the one beside it is in its place — then it's the
   * card in hand. (The list wraps: the last is beside the first.)
   */
  const stepTo = (dir: 1 | -1, fromX = 0, v = 0) => {
    const card = cardRef.current!
    if (closing.current || flipping.current || editingRef.current) return
    if (!stepRef.current) return
    flipping.current = true // (no taps, pulls or swipes till it's in)
    card.getAnimations().forEach((a) => a.finish())
    // (Each card keeps its place, scrolled, till it's put away.)
    const into = dir === 1 ? stepRef.current.next : stepRef.current.prev
    scrolls.current.set(shown.id, scrollRef.current?.scrollTop ?? 0)
    const toX = -dir * pitch()
    const dist = Math.abs(toX - fromX)
    const ms = Math.min(380, Math.max(200, dist / 1.4))
    // Carrying on at the finger's speed (if it was going that way), easing
    // into place. (From a standstill — a key — it eases out too.)
    const along = Math.sign(v) === Math.sign(toX - fromX) ? Math.abs(v) : 0
    const k = Math.min(3, along / (dist / ms))
    const anim = animateAll(fromX, toX, {
      duration: ms,
      easing: `cubic-bezier(0.3, ${(0.3 * k).toFixed(3)}, 0.35, 1)`,
    })
    follow(anim, fromX, toX)
    anim.onfinish = () => {
      cancelAnimationFrame(followRaf.current)
      // The one beside it, in its place, becomes the card in hand (all in
      // one frame: the cards and their places swap under the same picture).
      flushSync(() => stepRef.current?.go(dir))
      if (scrollRef.current)
        scrollRef.current.scrollTop = scrolls.current.get(into.id) ?? 0
      for (const el of stripCards())
        el?.getAnimations().forEach((a) => a.cancel())
      slideAll(0)
      flipping.current = false
    }
  }
  /** Let go short of swiping it away: back to its place. */
  const springBack = (fromX: number) => {
    const anim = animateAll(fromX, 0, { duration: 240, easing: EASE_OUT })
    follow(anim, fromX, 0)
    anim.onfinish = () => {
      cancelAnimationFrame(followRaf.current)
      slideAll(0)
      reportSlide(0)
    }
  }
  const stepToRef = useRef(stepTo)
  stepToRef.current = stepTo
  const springBackRef = useRef(springBack)
  springBackRef.current = springBack
  const slideAllRef = useRef(slideAll)
  slideAllRef.current = slideAll

  // Escape puts the card back (or, turned over, cancels the edit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ← → (a keyboard's swipe): the recipe before or after it.
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !editingRef.current &&
        !(e.target as Element | null)?.closest?.('input, textarea')
      ) {
        stepToRef.current(e.key === 'ArrowRight' ? 1 : -1)
        return
      }
      if (e.key !== 'Escape') return
      // (A dialog over the card handles its own Escape.)
      if (document.querySelector('[role="alertdialog"]')) return
      if (editingRef.current) cancelRef.current()
      else closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Drag down to dismiss. Touch uses non-passive listeners so a pull-down at
  // the top of the card's scroll area drags the card instead of bouncing the
  // scroller; mouse uses pointer events (for desktop testing).
  useEffect(() => {
    const card = cardRef.current!
    const shade = shadeRef.current!
    const d = {
      active: false,
      decided: false,
      fromScroller: false,
      // Started on a cut-off title (or name), swiped sideways to read.
      onLine: false,
      // Swiping it sideways, to the recipe beside it (not pulling it down).
      side: false,
      mouse: false,
      dx: 0,
      lastX: 0,
      vx: 0,
      x0: 0,
      y0: 0,
      dy: 0,
      lastY: 0,
      lastT: 0,
      v: 0,
    }
    const atTop = () =>
      !d.fromScroller || (scrollRef.current?.scrollTop ?? 0) <= 0

    const start = (
      x: number,
      y: number,
      target: EventTarget | null,
      mouse: boolean,
    ) => {
      // On the back, a drag in a field is about its text: with a mouse, any
      // field; by touch, the one you're writing in (e.g. moving the caret).
      const field = (target as Element | null)?.closest?.('input, textarea')
      const inText =
        (editingRef.current &&
          !!field &&
          (mouse || field === document.activeElement)) ||
        // (A line's grip: dragging the line, not the card.)
        !!(target as Element | null)?.closest?.('[data-drag-handle]')
      if (
        closing.current ||
        flipping.current ||
        discardingRef.current ||
        inText
      ) {
        d.active = false
        d.decided = true
        return
      }
      d.active = false
      d.decided = false
      d.side = false
      d.mouse = mouse
      d.dx = 0
      d.lastX = x
      d.vx = 0
      d.fromScroller = !!scrollRef.current?.contains(target as Node)
      d.onLine = !!(target as Element | null)?.closest?.('.one-line-cut')
      d.x0 = x
      d.y0 = y
      d.dy = 0
      d.lastY = y
      d.lastT = performance.now()
      d.v = 0
    }
    // Returns true when the card is being dragged (caller should preventDefault).
    const move = (x: number, y: number): boolean => {
      if (closing.current) return false
      const dx = x - d.x0
      const dy = y - d.y0
      if (!d.decided) {
        if (dy > 0 && dy >= Math.abs(dx) && atTop()) {
          d.decided = true
          d.active = true
          // Pulling it away isn't selecting its text.
          window.getSelection()?.removeAllRanges()
          card.style.userSelect = 'none'
          card.getAnimations().forEach((a) => a.finish())
        } else if (
          Math.abs(dx) > 3 &&
          Math.abs(dx) > Math.abs(dy) &&
          stepRef.current &&
          !editingRef.current &&
          !d.onLine
        ) {
          // Sideways: on to the recipe beside it.
          d.decided = true
          d.active = true
          d.side = true
          window.getSelection()?.removeAllRanges()
          card.style.userSelect = 'none'
          for (const el of stripCards())
            el?.getAnimations().forEach((a) => a.finish())
        } else if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          d.decided = true
          return false
        } else {
          // Undecided jitter at the top — hold it so the scroller can't bounce.
          // (Not on a cut-off title: iOS settles on the first moves whether
          // a swipe scrolls, so holding them would stop it being swiped
          // sideways. It takes only sideways swipes itself, so there's no
          // bounce to stop.)
          return !d.onLine && dy >= 0 && atTop()
        }
      }
      if (!d.active) return false
      const now = performance.now()
      if (d.side) {
        const stepV = (x - d.lastX) / Math.max(1, now - d.lastT)
        d.vx = 0.7 * stepV + 0.3 * d.vx
        d.lastX = x
        d.lastT = now
        d.dx = dx
        slideAllRef.current(dx)
        reportSlideRef.current(dx)
        return true
      }
      // (Smoothed: a single step is jittery.)
      const step = (y - d.lastY) / Math.max(1, now - d.lastT)
      d.v = 0.7 * step + 0.3 * d.v
      d.lastY = y
      d.lastT = now
      d.dy = Math.max(0, dy)
      card.style.transform = pose(d.dy)
      // It fades as you pull it, telling you it's on its way back (and the
      // cards beside it slide away: they're going too).
      card.style.opacity = String(1 - 0.65 * Math.min(1, d.dy / 280))
      // (Gently: only a long pull takes them all the way, as with the shade.)
      besideAtRef.current(Math.min(1, d.dy / 450))
      shade.style.opacity = String(1 - Math.min(0.7, d.dy / 450))
      return true
    }
    const end = () => {
      if (!d.active) return
      d.active = false
      card.style.userSelect = ''
      if (d.side) {
        d.side = false
        // (A mouse lets go anywhere — maybe off the card, on the shade,
        // whose click would put the card back: that click is swallowed.)
        if (d.mouse) {
          const swallow = (c: MouseEvent) => {
            c.preventDefault()
            c.stopPropagation()
          }
          window.addEventListener('click', swallow, { capture: true, once: true })
          setTimeout(() => window.removeEventListener('click', swallow, true), 0)
        }
        const dir = d.dx < 0 ? 1 : -1
        const v = performance.now() - d.lastT > 80 ? 0 : d.vx
        // Far enough, or flicked that way.
        const far =
          Math.abs(d.dx) > card.offsetWidth * 0.3 ||
          (Math.abs(d.dx) > 20 && Math.abs(v) > 0.4 && Math.sign(v) === Math.sign(d.dx))
        if (far) stepToRef.current(dir, d.dx, v)
        else springBackRef.current(d.dx)
        return
      }
      // Far enough, or a real downward flick (not just a twitch — nor a
      // finger held still before letting go).
      const flick = d.v > 0.5 && performance.now() - d.lastT <= 80
      const far = d.dy > 110 || (flick && d.dy > 40)
      if (far && !editingRef.current) {
        // It carries on from the finger: never stopping dead, nor (held
        // still before letting go) flying off.
        const held = performance.now() - d.lastT > 80
        closeRef.current(d.dy, Math.max(0.5, held ? 0 : d.v))
        return
      }
      if (far && !changed.current) {
        const held = performance.now() - d.lastT > 80
        putAwayRef.current(d.dy, Math.max(0.5, held ? 0 : d.v))
        return
      }
      // (Turned over with changes: it springs back while you decide.)
      // Not pulled far enough — or stopped short by "Discard changes?": it
      // springs back, caught like an elastic — on a moment with the pull,
      // back past its place, and settling.
      if (far) leaveRef.current('putAway')
      const held = performance.now() - d.lastT > 80
      card.animate(caught(d.dy, held ? 0 : d.v), {
        duration: CAUGHT_MS,
        easing: 'linear',
      })
      card.animate([{ opacity: card.style.opacity }, { opacity: 1 }], {
        duration: 200,
        easing: EASE_OUT,
      })
      shade.animate([{ opacity: shade.style.opacity }, { opacity: 1 }], {
        duration: 220,
      })
      if (besideGoneRef.current()) void besideToRef.current(0, 220, EASE_OUT)
      card.style.transform = ''
      card.style.opacity = ''
      shade.style.opacity = ''
    }

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start(t.clientX, t.clientY, e.target, false)
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (move(t.clientX, t.clientY) && e.cancelable) e.preventDefault()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      start(e.clientX, e.clientY, e.target, true)
      const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY)
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        end()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    card.addEventListener('touchstart', onTouchStart, { passive: true })
    card.addEventListener('touchmove', onTouchMove, { passive: false })
    card.addEventListener('touchend', end)
    card.addEventListener('touchcancel', end)
    card.addEventListener('pointerdown', onPointerDown)
    return () => {
      card.removeEventListener('touchstart', onTouchStart)
      card.removeEventListener('touchmove', onTouchMove)
      card.removeEventListener('touchend', end)
      card.removeEventListener('touchcancel', end)
      card.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  // A drag on the shade with nothing to scroll (a card shorter than the
  // screen, or the strip above the card's layer) would otherwise reach the
  // page under it, which iOS then drags about. Only the card's own layer
  // scrolls, and only when there's more card than screen.
  useEffect(() => {
    const root = rootRef.current!
    const onTouchMove = (e: TouchEvent) => {
      const sc = scrollRef.current
      const target = e.target as Element
      if (sc?.contains(target) && sc.scrollHeight > sc.clientHeight + 1)
        return
      // (Leave a field's own touches alone: selecting, moving the caret.)
      if (target.closest?.('input, textarea')) return
      if (e.cancelable) e.preventDefault()
    }
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => root.removeEventListener('touchmove', onTouchMove)
  }, [])

  // A card's usual actions in hand: Edit, and how many times it's wanted.
  // (A reader: nothing to do here — no footer at all.)
  const frontActions = (r: Recipe) =>
    canEditRecipes || canEditPlan ? (
      <>
        {canEditRecipes && <EditButton onEdit={edit} />}
        <span className="flex-1" />
        {canEditPlan && <WantCount recipeId={r.id} interactive />}
      </>
    ) : undefined

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50">
      <div
        ref={shadeRef}
        className="absolute inset-0 bg-[rgb(20_24_22/0.55)]"
      />
      {/* The cards either side of it, a sliver of each at the screen's
          edges: swiped, they slide in with it (each where it'll rest once
          it's in hand). They slide in from off the screen as it comes out,
          and away as it's put back (with it, as it's pulled down); turned
          over to edit (no swiping then), they fade away. */}
      {step && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{ opacity: editing ? 0 : 1 }}
        >
          {([
            [beforeLayerRef, beforeRef, step.before, -2],
            [prevLayerRef, prevRef, step.prev, -1],
            [nextLayerRef, nextRef, step.next, 1],
            [afterLayerRef, afterRef, step.after, 2],
          ] as const).map(([layerRef, ref, r, side]) => (
            <div
              key={side}
              ref={layerRef}
              className="absolute inset-x-0 bottom-0 overflow-hidden"
              style={{ top: origin.viewTop, willChange: 'transform' }}
            >
              <div className="flex min-h-full flex-col" style={HAND_PADDING}>
                <div
                  ref={ref}
                  className="shrink-0"
                  style={{
                    marginTop: 'auto',
                    marginBottom: 'auto',
                    marginLeft:
                      origin.left -
                      HAND_GROW +
                      side * (origin.width + 2 * HAND_GROW + besideGap),
                    width: origin.width + 2 * HAND_GROW,
                    willChange: 'transform',
                  }}
                >
                  <RecipeCard
                    recipe={r}
                    large
                    canEditPlan={canEditPlan}
                    canEditRecipes={canEditRecipes}
                    actions={frontActions(r)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* The card scrolls, whole, on the shade; tapping the shade (anywhere
          off the card) puts it back. This layer starts where the rolodex
          layer does (the top of the page), so a card flying above it is
          clipped at exactly the same edge in both. */}
      <div
        ref={scrollRef}
        // (Up and down only: a card in hand never scrolls sideways.)
        className="scroll-y no-scrollbar absolute inset-x-0 bottom-0 overflow-x-hidden"
        style={{ top: origin.viewTop }}
        onClick={(e) => {
          if (cardRef.current?.contains(e.target as Node)) return
          if (closing.current || flipping.current) return
          if (editingRef.current) leave('putAway')
          else close()
        }}
      >
        {/* A card shorter than the screen rests centred on it (its front:
            turned over to write on, it sits near the top, so it doesn't
            creep up the screen as it grows). The switch happens edge-on,
            mid-turn, where it can't be seen. */}
        <div className="flex min-h-full flex-col" style={HAND_PADDING}>
          <div
            ref={cardRef}
            // (The one place outside fields where text can be selected.)
            className="selectable shrink-0"
            role="dialog"
            aria-modal="true"
            aria-label={shown.title}
            style={{
              marginTop: facing === 'front' ? 'auto' : 0,
              marginBottom: 'auto',
              // The rolodex's column, a little wider: in hand, closer to you.
              marginLeft: origin.left - HAND_GROW,
              width: origin.width + 2 * HAND_GROW,
              willChange: 'transform',
              perspective: '1600px',
            }}
          >
            <div
              ref={flipRef}
              className="relative"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <RecipeCard
                ref={frontRef}
                recipe={shown}
                large
                canEditPlan={canEditPlan}
                canEditRecipes={canEditRecipes}
                actions={
                  renderActions
                    ? renderActions({ dismiss: () => dismiss(), edit })
                    : frontActions(shown)
                }
                aria-hidden={facing === 'back' || undefined}
                style={{
                  backfaceVisibility: 'hidden',
                  ...(facing === 'front' ? {} : OFF_LAYOUT),
                }}
              />
              {editing && (
                <RecipeCardBack
                  ref={backRef}
                  recipe={shown}
                  isNew={isNew && unsaved.current}
                  onCancel={cancel}
                  changedRef={changed}
                  saveDraftRef={saveDraft}
                  conflictRef={conflict}
                  remember={remember}
                  resumed={!!resume}
                  onSaved={() => {
                    unsaved.current = false
                    unedit()
                  }}
                  onDeleted={() => {
                    editingRef.current = false
                    dismiss()
                  }}
                  style={{
                    backfaceVisibility: 'hidden',
                    ...(facing === 'back' ? {} : OFF_LAYOUT),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      {discarding && (
        <ConfirmDialog
          title={unsaved.current ? 'Discard this recipe?' : 'Discard changes?'}
          message={
            unsaved.current ? (
              <>It hasn’t been saved.</>
            ) : (
              <>
                Your changes to “{shown.title}” haven’t been saved.
                {conflict.current &&
                  ' (Someone else has changed it since you started: saving will replace their changes with yours.)'}
              </>
            )
          }
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setDiscarding(null)
            goOn(discarding)
          }}
          onCancel={() => setDiscarding(null)}
          // Or keep the changes, then go on as you were going (turned back
          // over, or put back in the box). (Not without a title to save.)
          saveLabel="Save"
          onSave={
            saveDraft.current
              ? () => {
                  saveDraft.current?.()
                  unsaved.current = false
                  changed.current = false
                  setDiscarding(null)
                  goOn(discarding)
                }
              : undefined
          }
        />
      )}
    </div>,
    document.body,
  )
}
