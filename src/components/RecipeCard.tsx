import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type MutableRefObject,
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
  STARTER_TITLE,
  allIngredients,
  sectionsOf,
  type Ingredient,
  type Recipe,
} from '../data/types'
import { QuantityInput } from './QuantityInput'
import { Amount } from './Unit'
import { OneLine } from './OneLine'
import { ConfirmDialog } from './ui'
import { arcThrough, sampleTimes, type Arc } from '../lib/arc'

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
      <span className="truncate">{ing.name}</span>
      <span className="shrink-0 whitespace-nowrap text-[#8a8170]">
        <Amount quantity={ing.quantity} unit={ing.unit} />
      </span>
    </li>
  )
}

/** Ingredient lines that can show on a peeking card (more than fit). */
const PEEK_LINES = 16

function CardBody({ recipe, peek }: { recipe: Recipe; peek: boolean }) {
  // Its sections (the first, and any others with lines). Headed only when
  // there's more than one, or the first is called something else — else
  // it's just the lines, as a card always was.
  const sections = sectionsOf(recipe).filter(
    (s, i) => i === 0 || s.ingredients.length > 0,
  )
  const headed = sections.length > 1 || !!recipe.ingredientsTitle
  // (Peeking: only as many lines as can show, headings included.)
  let room = peek ? PEEK_LINES : Infinity
  return (
    <>
      {allIngredients(recipe).length === 0 ? (
        <ul>
          <li className="text-[#8a8170]">No ingredients yet</li>
        </ul>
      ) : (
        sections.map((s, si) => {
          if (room <= 0) return null
          const gap = si > 0 ? 1 : 0 // (a line left blank before it)
          const head = headed ? 1 : 0
          const lines = s.ingredients.slice(0, Math.max(0, room - gap - head))
          room -= gap + head + lines.length
          return (
            <section key={si} className={gap ? 'mt-[22px]' : ''}>
              {headed && (
                <div className="font-semibold text-[#8a8170]">{s.title}</div>
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
        <p className="mt-[22px] text-[#8a8170]">
          {recipe.tags.join(' · ')}
        </p>
      )}
      {!peek && recipe.notes && (
        <>
          <div className="h-[22px]" />
          <div className="font-semibold text-[#8a8170]">Notes</div>
          <p className="whitespace-pre-wrap pb-[22px]">{recipe.notes}</p>
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
      className={`flex items-center gap-1.5 text-[#8a8170] ${gap ? 'mt-[22px]' : ''}`}
    >
      <span className="sr-only">Favorite of</span>
      <StarIcon on size={17} />
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
            className={`paper-lines font-hand mx-5 mb-2 min-h-0 flex-1 pt-[3px] ${
              large ? 'text-[22px]' : 'text-[21px]'
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
            (not yours to change), fainter the deeper. Each depth always in
            the same place, so a stack of so many looks the same anywhere. */}
        {STACKED.slice(0, others)
          .map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute inset-0 block"
              style={{
                transform: `translate(${s.x}px, ${s.y}px) rotate(${s.turn}deg) scale(${s.scale})`,
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

/** Degrees the spiral sweeps from one star to the next (anticlockwise). */
const SPIRAL_STEP = 85

/** Where others' stars sit under yours, by depth (first: just under it):
 *  a spiral — each deeper one further round (anticlockwise: up and to the
 *  left, then down and to the left — away from the title), further out,
 *  turned as the spiral turns, smaller and fainter, and unoutlined (just
 *  their fill). Fixed: nothing per
 *  recipe or person, so a stack of so many always looks the same. */
const STACKED = [1, 2].map((depth) => {
  const angle = ((-65 - SPIRAL_STEP * depth) * Math.PI) / 180 // (screen: y down)
  const out = [7, 9.5][depth - 1] // px
  return {
    x: out * Math.cos(angle),
    y: out * Math.sin(angle),
    // Turned as far as the spiral has swept to reach it: following it.
    turn: -SPIRAL_STEP * depth,
    scale: 1 - 0.06 * depth,
    opacity: [0.55, 0.32][depth - 1],
  }
})

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

  const toggle = () => {
    if (menu) return setMenu(null)
    const r = ref.current!.getBoundingClientRect()
    const vv = window.visualViewport // (the part above the keyboard)
    const mid = r.top + r.height / 2 - (vv?.offsetTop ?? 0)
    setMenu(mid > (vv?.height ?? window.innerHeight) / 2 ? 'above' : 'below')
  }

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
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('click', onClick, true)
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
        className={`${className} block w-full truncate text-left`}
      >
        {value ?? (placeholder && <span className="text-pencil">{placeholder}</span>)}
      </button>
      {menu && (
        <div
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
type Row = Ingredient & { struck?: boolean }

const blank = (i: Row) =>
  !i.struck && !i.name.trim() && i.quantity === undefined && !i.unit
/** Always exactly one empty line at the end, to write the next one on. */
const withSpareLine = (rows: Row[]) => {
  const out = [...rows]
  while (
    out.length > 1 &&
    blank(out[out.length - 1]) &&
    blank(out[out.length - 2])
  )
    out.pop()
  if (!out.length || !blank(out[out.length - 1])) out.push({ name: '' })
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
type Group = { title: string; rows: Row[] }

/** The groups as they should stand after a change: each with its spare line;
 *  and a section after the first that's been emptied — no title, nothing
 *  written in it — gone (back to "Add section…", which is where it came
 *  from). */
const tidyGroups = (gs: Group[]) => {
  const out = gs.map((g) => ({ ...g, rows: withSpareLine(g.rows) }))
  const last = out[out.length - 1]
  if (out.length > 1 && last.title === '' && last.rows.every(blank)) out.pop()
  return out
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
  const set = (gs: Group[]) => onChange(tidyGroups(gs))
  const setTitle = (g: number, title: string) =>
    set(groups.map((x, i) => (i === g ? { ...x, title } : x)))
  const update = (g: number, r: number, patch: Partial<Row>) =>
    set(
      groups.map((x, i) =>
        i === g
          ? {
              ...x,
              rows: x.rows.map((row, j) => (j === r ? { ...row, ...patch } : row)),
            }
          : x,
      ),
    )
  const cols = 'grid grid-cols-[minmax(0,1fr)_3.25rem_4.25rem_1.75rem]'
  const cell =
    // Taller than the card's 22px ruled lines, so each line (and its ✕) is
    // easy to hit with a finger. The writing sits low, on its line.
    'h-[30px] min-w-0 bg-transparent pt-[6px] leading-[24px] focus:bg-kraft/15 focus:outline-none'
  const rule = 'border-l border-line-blue'
  // A section's title, written in (a heading, across the whole line). Its
  // key is its place among the sections — and "Add section…" takes the next
  // place's, so typing there becomes the new section's title without losing
  // the caret.
  const titleField = (
    value: string,
    onTitle: (t: string) => void,
    placeholder: string,
  ) => (
    <input
      value={value}
      onChange={(e) => onTitle(e.target.value)}
      placeholder={placeholder}
      aria-label="Section"
      autoComplete="off"
      autoCapitalize="words"
      className={`${headClass} h-[34px] min-w-0 bg-transparent pt-[8px] placeholder:font-normal placeholder:text-pencil focus:bg-kraft/15 focus:outline-none`}
    />
  )

  return (
    <div role="table" aria-label="Ingredients">
      {[...groups, null].map((group, g) =>
        group === null ? (
          // "Add section…": a title written here starts a new section (with
          // a line to write its first ingredient on). (Built like a
          // section's title row, in the next section's place: see
          // titleField.)
          <div key={`t${g}`} role="rowgroup" className="mt-3">
            <div role="row" className="grid items-end border-b border-line-blue">
              {titleField(
                '',
                (t) => set([...groups, { title: t, rows: [] }]),
                'Add section…',
              )}
            </div>
          </div>
        ) : (
        <div key={`t${g}`} role="rowgroup" className={g > 0 ? 'mt-3' : ''}>
          {/* The section's title: the first's beside the column headings. */}
          <div
            role="row"
            className={`${g === 0 ? cols : 'grid'} items-end border-b border-line-blue`}
          >
            {titleField(
              group.title,
              (t) => setTitle(g, t),
              g === 0 ? STARTER_TITLE : 'Section',
            )}
            {g === 0 && (
              <>
                <span role="columnheader" className={`${headClass} pr-1 text-right`}>
                  Qty
                </span>
                <span role="columnheader" className={`${headClass} pl-1.5`}>
                  Unit
                </span>
                <span />
              </>
            )}
          </div>
          {group.rows.map((row, i) => {
            const spare = i === group.rows.length - 1 && blank(row)
            return (
              <div
                key={i}
                role="row"
                className={`${cols} relative items-center border-b border-line-blue`}
              >
                <input
                  value={row.name}
                  onChange={(e) => update(g, i, { name: e.target.value })}
                  readOnly={row.struck}
                  placeholder={spare ? 'Add ingredient…' : 'Ingredient'}
                  // (No "name" in the label: Safari would offer to AutoFill a
                  // contact.)
                  aria-label="Ingredient"
                  autoComplete="off"
                  className={`${cell} pr-1`}
                />
                <QuantityInput
                  value={row.quantity}
                  onChange={(quantity) => update(g, i, { quantity })}
                  placeholder=""
                  readOnly={row.struck}
                  className={`${cell} ${rule} pr-1 text-right`}
                />
                <UnitCell
                  value={row.unit}
                  onChange={(unit) => update(g, i, { unit })}
                  units={units}
                  disabled={row.struck}
                  className={`${cell} ${rule} pl-1.5`}
                />
                {spare ? (
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
                {row.struck && (
                  // A pen stroke through the line.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -left-0.5 right-8 top-[62%] h-[1.5px] rounded-full bg-pen"
                    style={{ transform: 'rotate(-0.5deg)' }}
                  />
                )}
              </div>
            )
          })}
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
const NOTES_DROP = 3

type RecipeText = Pick<
  Recipe,
  'title' | 'ingredients' | 'ingredientsTitle' | 'sections' | 'notes' | 'tags'
>
/** What a recipe says, ignoring blank lines and stray spaces (to tell
 *  whether a draft says anything different). */
const sameText = (a: RecipeText, b: RecipeText) => {
  const key = (r: RecipeText) =>
    JSON.stringify([
      r.title.trim(),
      [
        { title: r.ingredientsTitle || STARTER_TITLE, ingredients: r.ingredients },
        ...(r.sections ?? []),
      ].map((s) => [
        s.title.trim(),
        s.ingredients
          .filter((i) => i.name.trim())
          .map((i) => [i.name.trim(), i.quantity ?? null, i.unit || null]),
      ]),
      (r.notes ?? '').trim(),
      r.tags.map((t) => t.trim()).filter(Boolean),
    ])
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
  } & HTMLAttributes<HTMLDivElement>
>(function RecipeCardBack(
  {
    recipe,
    isNew = false,
    onCancel,
    onSaved,
    onDeleted,
    changedRef,
    className = '',
    style,
    ...rest
  },
  ref,
) {
  const upsertRecipe = useStore((s) => s.upsertRecipe)
  const deleteRecipe = useStore((s) => s.deleteRecipe)
  const [title, setTitle] = useState(recipe.title)
  const titleTapIn = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const [titleFocused, setTitleFocused] = useState(false)
  const [groups, setGroups] = useState<Group[]>(() =>
    tidyGroups(
      sectionsOf(recipe).map((s) => ({ title: s.title, rows: s.ingredients })),
    ),
  )
  const [notes, setNotes] = useState(recipe.notes ?? '')
  const [tagsText, setTagsText] = useState(recipe.tags.join(', '))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Notes grow a ruled line at a time as you write, so they never scroll.
  // (The writing is set NOTES_DROP lower than the rules, to sit on them.)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = '0px'
    const lines = Math.max(
      NOTES_MIN_LINES,
      Math.ceil((el.scrollHeight - NOTES_DROP) / 22),
    )
    el.style.height = `${lines * 22 + NOTES_DROP}px`
  }, [notes])

  // The recipe as drafted (crossed-out and empty lines left off; and
  // sections after the first left with no lines).
  const lines = (rows: Row[]) =>
    rows
      .filter((i) => !i.struck)
      .map(({ struck: _, ...i }) => ({ ...i, name: i.name.trim() }))
      .filter((i) => i.name.length > 0)
  const starterTitle = groups[0].title.trim()
  const sections = groups
    .slice(1)
    .map((g) => ({ title: g.title.trim(), ingredients: lines(g.rows) }))
    .filter((s) => s.ingredients.length > 0)
  const draft = (): Recipe => ({
    ...recipe,
    title: title.trim(),
    ingredients: lines(groups[0].rows),
    ingredientsTitle:
      starterTitle && starterTitle !== STARTER_TITLE ? starterTitle : undefined,
    sections: sections.length ? sections : undefined,
    notes: notes.trim() || undefined,
    tags: tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  })
  if (changedRef) changedRef.current = !sameText(draft(), recipe)

  const save = () => {
    upsertRecipe(draft())
    onSaved()
  }

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
          {!isNew && (
            <FavoriteStar recipeId={recipe.id} />
          )}
          {/* Not being written in, the title is shown as on the front (a
              long one cut off, feathered, dragged sideways to read); tapped,
              it's written in, the caret at its end. */}
          <div className="relative flex min-w-0 flex-1">
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
          {!isNew && (
            <span aria-hidden className="shrink-0" style={{ width: STAR_ROOM }} />
          )}
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
              className="block h-[25px] w-full border-b border-line-blue bg-transparent pt-[3px] leading-[21px] focus:bg-kraft/15 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className={label}>Notes</span>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={NOTES_MIN_LINES}
              placeholder="Prep tips, substitutions…"
              autoComplete="off"
              className="paper-lines block w-full resize-none overflow-hidden bg-transparent pt-[3px] leading-[22px] focus:outline-none"
            />
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
/** How much wider a card in hand is than its column, each side. */
const HAND_GROW = 8

/** How a card comes out of the rolodex (or a pocket) into your hand:
 *  - 'arc': it slides up out of its slot and hands over, mid-flight, to the
 *    card in hand, on one continuous arc.
 *  - 'lift': it lifts straight up out of its slot and off the screen, and
 *    after a pause the card in hand fades in where it rests (putting it back, the
 *    card in hand fades out as the other drops back into its slot). */
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
const FADE_IN_DELAY_MS = 400 // the card in hand (and the shade) start fading in…
const FADE_IN_MS = 375 // …over this
const HAND_FROM = 0.93 // …growing from this size to its own
const HAND_GROW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)' // fast, then easing in
const FADE_IN_EASE = 'linear' // steady, start to finish
const FADE_MS = 225 // …and fading out
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
  onClosed: () => void
}) {
  // Show the recipe as it is now (it may be edited while in hand).
  const live = useStore((s) => s.recipes.find((r) => r.id === recipe.id))
  const shown = live ?? recipe
  const cardRef = useRef<HTMLDivElement>(null) // flies (wraps both faces)
  const flipRef = useRef<HTMLDivElement>(null) // turns over
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(isNew) // the back is there
  const [facing, setFacing] = useState<'front' | 'back'>(
    isNew ? 'back' : 'front',
  )
  const editingRef = useRef(isNew)
  const unsaved = useRef(isNew) // a new card not yet saved
  const changed = useRef(false) // its back says something different
  // Leaving the back, waiting on "Discard changes?".
  const [discarding, setDiscarding] = useState<null | (() => void)>(null)
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
    const fade = {
      duration: opening ? FADE_IN_MS : FADE_MS,
      fill: 'both' as const,
    }
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
            [
              { opacity: 0, transform: pose(0) },
              { opacity: 1, transform: pose(0) },
            ],
            // After a fixed pause (wherever the card coming out has got to).
            { ...fade, delay: FADE_IN_DELAY_MS, easing: FADE_IN_EASE },
          ),
          // The shade darkens with it.
          shade.animate([{ opacity: 0 }, { opacity: 1 }], {
            ...fade,
            delay: FADE_IN_DELAY_MS,
            easing: FADE_IN_EASE,
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
    // Opening: the fade (only it is on this card, so its fill is what's
    // dropped once it ends). Closing: whichever ends last.
    if (opening) {
      // It grows to full size as it comes, as if raised to you: quickly at
      // first, then easing into it. (Its own animation, on `scale`, so its
      // curve isn't the fade's; dropped once done, like the fade.)
      const grow = card.animate([{ scale: HAND_FROM }, { scale: 1 }], {
        ...fade,
        delay: FADE_IN_DELAY_MS,
        easing: HAND_GROW_EASE,
      })
      grow.startTime = now
      grow.onfinish = () => {
        if (!closing.current) grow.cancel()
      }
      return anims[2]
    }
    return FADE_MS > DROP_MS ? anims[1] : anims[0]
  }

  // Fly out of the rolodex into place.
  useLayoutEffect(() => {
    const card = cardRef.current!
    // A new card arrives turned over, drawn flat (its front hidden).
    if (isNew && frontRef.current) frontRef.current.style.visibility = 'hidden'
    // Measure the resting card with no animation applied (StrictMode re-runs
    // this effect in dev while the first one is already in flight).
    card.getAnimations().forEach((x) => x.cancel())
    restTop.current = card.getBoundingClientRect().top
    const rdxCard = TAKE_OUT === 'lift' ? getRolodexCard() : undefined
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
    return () => {
      for (const el of [card, shadeRef.current])
        el?.getAnimations().forEach((x) => x.cancel())
    }
  }, [])

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
    const anim = rdxCard
      ? liftFade(o, rdxCard, false, fromY, fromV)
      : fly(arcThrough(base + fromY, o.clearTop, o.slotTop), o, false, base)
    anim.onfinish = () => onClosedRef.current()
  }
  const closeRef = useRef(close)
  closeRef.current = close
  const dismissRef = useRef<(fromY?: number, v?: number) => void>(() => {})

  // Fade away where it is (it's not going back into its slot), the same
  // fade as putting a card back — from `fromY` below its place, coasting on
  // at `v`, if it was pulled down.
  const dismiss = (fromY = 0, v = 0) => {
    if (closing.current) return
    closing.current = true
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
    anim.onfinish = () => onClosedRef.current()
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
  const leave = (go: () => void) => {
    if (changed.current) setDiscarding(() => go)
    else go()
  }
  // Cancel: turn back over (or let a new card go).
  const cancel = () =>
    leave(() => (unsaved.current ? letGo() : flipRefFn.current(false)))
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

  // Escape puts the card back (or, turned over, cancels the edit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        editingRef.current &&
        !!field &&
        (mouse || field === document.activeElement)
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
      // (Smoothed: a single step is jittery.)
      const step = (y - d.lastY) / Math.max(1, now - d.lastT)
      d.v = 0.7 * step + 0.3 * d.v
      d.lastY = y
      d.lastT = now
      d.dy = Math.max(0, dy)
      card.style.transform = pose(d.dy)
      // It fades as you pull it, telling you it's on its way back.
      card.style.opacity = String(1 - 0.65 * Math.min(1, d.dy / 280))
      shade.style.opacity = String(1 - Math.min(0.7, d.dy / 450))
      return true
    }
    const end = () => {
      if (!d.active) return
      d.active = false
      card.style.userSelect = ''
      // Far enough, or a real downward flick (not just a twitch).
      const far = d.dy > 110 || (d.v > 0.5 && d.dy > 40)
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
      if (far) leaveRef.current(() => putAwayRef.current())
      card.animate(
        [
          { transform: card.style.transform, opacity: card.style.opacity },
          { transform: pose(0), opacity: 1 },
        ],
        { duration: 220, easing: EASE_OUT },
      )
      shade.animate([{ opacity: shade.style.opacity }, { opacity: 1 }], {
        duration: 220,
      })
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

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50">
      <div
        ref={shadeRef}
        className="absolute inset-0 bg-[rgb(20_24_22/0.55)]"
      />
      {/* The card scrolls, whole, on the shade; tapping the shade (anywhere
          off the card) puts it back. This layer starts where the rolodex
          layer does (the top of the page), so a card flying above it is
          clipped at exactly the same edge in both. */}
      <div
        ref={scrollRef}
        className="scroll-y no-scrollbar absolute inset-x-0 bottom-0"
        style={{ top: origin.viewTop }}
        onClick={(e) => {
          if (cardRef.current?.contains(e.target as Node)) return
          if (closing.current || flipping.current) return
          if (editingRef.current) leave(() => putAway())
          else close()
        }}
      >
        {/* A card shorter than the screen rests centred on it (its front:
            turned over to write on, it sits near the top, so it doesn't
            creep up the screen as it grows). The switch happens edge-on,
            mid-turn, where it can't be seen. */}
        <div
          className="flex min-h-full flex-col"
          style={{
            paddingTop: '12vh',
            paddingBottom: 'max(12vh, calc(var(--safe-bottom) + 32px))',
          }}
        >
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
                  renderActions ? (
                    renderActions({ dismiss: () => dismiss(), edit })
                  ) : canEditRecipes || canEditPlan ? (
                    <>
                      {canEditRecipes && <EditButton onEdit={edit} />}
                      <span className="flex-1" />
                      {canEditPlan && <WantCount recipeId={shown.id} interactive />}
                    </>
                  ) : // (A reader: nothing to do here — no footer at all.)
                  undefined
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
              <>Your changes to “{shown.title}” haven’t been saved.</>
            )
          }
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setDiscarding(null)
            discarding()
          }}
          onCancel={() => setDiscarding(null)}
        />
      )}
    </div>,
    document.body,
  )
}
