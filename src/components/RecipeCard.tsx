import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useStore } from '../store/store'
import type { Ingredient, Recipe } from '../data/types'
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

function formatAmount(ing: Ingredient): string {
  if (ing.quantity === undefined) return ing.unit ?? ''
  return ing.unit ? `${ing.quantity} ${ing.unit}` : String(ing.quantity)
}

function IngredientLine({ ing }: { ing: Ingredient }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="truncate">{ing.name}</span>
      <span className="shrink-0 text-[#8a8170]">{formatAmount(ing)}</span>
    </li>
  )
}

function CardBody({ recipe }: { recipe: Recipe }) {
  return (
    <>
      <ul>
        {recipe.ingredients.length === 0 ? (
          <li className="italic text-[#8a8170]">No ingredients yet</li>
        ) : (
          recipe.ingredients.map((ing, i) => (
            <IngredientLine key={i} ing={ing} />
          ))
        )}
      </ul>
      {recipe.tags.length > 0 && (
        <p className="paper-serif mt-[22px] italic text-[#8a8170]">
          {recipe.tags.join(' · ')}
        </p>
      )}
      {recipe.notes && (
        <>
          <div className="h-[22px]" />
          <div className="paper-serif text-[13px] font-semibold uppercase tracking-wider text-[#8a8170]">
            Notes
          </div>
          <p className="whitespace-pre-wrap pb-[22px]">{recipe.notes}</p>
        </>
      )}
    </>
  )
}

type CardProps = {
  recipe: Recipe
  canEditPlan: boolean
  canEditRecipes: boolean
  /** Lets the body scroll (when the card is capped to the screen). */
  scrollable?: boolean
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
        className={`paper-card rolodex-card relative flex flex-col overflow-hidden text-left ${className}`}
        style={{ minHeight: CARD_H, ...style }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="paper-frame" />
          <div className="px-5 pt-3.5">
            <div className="paper-rule paper-serif pb-1.5 text-[19px] font-semibold leading-[25px]">
              {recipe.title}
            </div>
          </div>
          <div
            ref={bodyRef}
            className={`paper-lines mx-5 mb-2 min-h-0 flex-1 text-[15px] ${
              scrollable ? 'scroll-y no-scrollbar' : 'overflow-hidden'
            }`}
          >
            <CardBody recipe={recipe} />
          </div>
        </div>

        {hasActions && (
          // Taps here act on the buttons, not the card.
          <div
            className="flex shrink-0 gap-2 px-4 pb-3 pt-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {actions ?? (
              <>
                {canEditPlan && <AddToMealButton recipeId={recipe.id} />}
                {canEditRecipes && <EditRecipeLink recipeId={recipe.id} />}
              </>
            )}
          </div>
        )}

        {/* Shading as the card tips back in the rolodex (--shade on its wrapper). */}
        <span className="rolodex-dim" />
      </div>
    )
  },
)

export function EditRecipeLink({ recipeId }: { recipeId: string }) {
  return (
    <Link
      to={`/recipes/${recipeId}`}
      className="rounded-full border border-[#d8cdb6] px-4 py-1.5 text-sm font-medium leading-5 active:scale-95"
    >
      Edit
    </Link>
  )
}

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
  /** Its pose on the wheel, and stood upright in place (wrapper transforms). */
  wheelPose: string
  flatPose: string
  /** How shaded it is on the wheel (0–1). */
  shade: number
}

const EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.25, 1)'
const STAND = 'cubic-bezier(0.4, 0, 0.2, 1)' // standing up off / back onto the wheel

const pose = (dy: number) => `translate(0px, ${dy}px)`


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
 */
export function CardDetail({
  recipe,
  origin,
  getOrigin,
  getRolodexCard,
  canEditRecipes,
  canEditPlan,
  renderActions,
  onClosed,
}: {
  recipe: Recipe
  /** The card's slot at the moment it was tapped (fixes the card's width). */
  origin: CardOrigin
  /** Its slot now (for putting it back). */
  getOrigin: () => CardOrigin
  /** The card element in the rolodex (its parent rides the wheel). */
  getRolodexCard: () => HTMLElement | undefined
  canEditRecipes: boolean
  canEditPlan: boolean
  /** Replaces the card's usual actions. `dismiss` fades the card away instead
   *  of putting it back (for when it's leaving, e.g. removed from a meal);
   *  onClosed follows either way. */
  renderActions?: (dismiss: () => void) => ReactNode
  onClosed: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const shadeRef = useRef<HTMLDivElement>(null) // the shadow over the rolodex
  const scrollRef = useRef<HTMLDivElement>(null) // the card scrolls in this
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
    const tSwap = arc.apex
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

  // Fly out of the rolodex into place.
  useLayoutEffect(() => {
    const card = cardRef.current!
    // Measure the resting card with no animation applied (StrictMode re-runs
    // this effect in dev while the first one is already in flight).
    card.getAnimations().forEach((x) => x.cancel())
    restTop.current = card.getBoundingClientRect().top
    const anim = fly(
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
  const close = (fromY = 0) => {
    if (closing.current) return
    closing.current = true
    const card = cardRef.current!
    card.style.transform = ''
    scrollRef.current!.style.overflow = 'hidden' // hold still while it flies
    const base = card.getBoundingClientRect().top
    const o = getOrigin()
    const anim = fly(
      arcThrough(base + fromY, o.clearTop, o.slotTop),
      o,
      false,
      base,
    )
    anim.onfinish = () => onClosedRef.current()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // Fade away where it is (it's not going back into its slot).
  const dismiss = () => {
    if (closing.current) return
    closing.current = true
    const card = cardRef.current!
    const shade = shadeRef.current!
    card.getAnimations().forEach((a) => a.cancel())
    const from = card.style.transform || pose(0)
    card.style.transform = ''
    const timing = { duration: 220, easing: EASE_OUT, fill: 'forwards' as const }
    const anim = card.animate(
      [
        { opacity: 1, transform: from },
        { opacity: 0, transform: `${from} translateY(28px) scale(0.97)` },
      ],
      timing,
    )
    shade.animate(
      [{ opacity: Number(getComputedStyle(shade).opacity) }, { opacity: 0 }],
      timing,
    )
    anim.onfinish = () => onClosedRef.current()
  }

  // Escape puts the card back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
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
      x0: 0,
      y0: 0,
      dy: 0,
      lastY: 0,
      lastT: 0,
      v: 0,
    }
    const atTop = () =>
      !d.fromScroller || (scrollRef.current?.scrollTop ?? 0) <= 0

    const start = (x: number, y: number, target: EventTarget | null) => {
      if (closing.current) return
      d.active = false
      d.decided = false
      d.fromScroller = !!scrollRef.current?.contains(target as Node)
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
          card.getAnimations().forEach((a) => a.finish())
        } else if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          d.decided = true
          return false
        } else {
          // Undecided jitter at the top — hold it so the scroller can't bounce.
          return dy >= 0 && atTop()
        }
      }
      if (!d.active) return false
      const now = performance.now()
      d.v = (y - d.lastY) / Math.max(1, now - d.lastT)
      d.lastY = y
      d.lastT = now
      d.dy = Math.max(0, dy)
      card.style.transform = pose(d.dy)
      shade.style.opacity = String(1 - Math.min(0.7, d.dy / 450))
      return true
    }
    const end = () => {
      if (!d.active) return
      d.active = false
      // Far enough, or a real downward flick (not just a twitch).
      if (d.dy > 110 || (d.v > 0.5 && d.dy > 40)) {
        closeRef.current(d.dy)
        return
      }
      card.animate(
        [{ transform: card.style.transform }, { transform: pose(0) }],
        { duration: 220, easing: EASE_OUT },
      )
      shade.animate([{ opacity: shade.style.opacity }, { opacity: 1 }], {
        duration: 220,
      })
      card.style.transform = ''
      shade.style.opacity = ''
    }

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start(t.clientX, t.clientY, e.target)
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (move(t.clientX, t.clientY) && e.cancelable) e.preventDefault()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      start(e.clientX, e.clientY, e.target)
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

  return createPortal(
    <div className="fixed inset-0 z-50">
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
          if (!cardRef.current?.contains(e.target as Node)) close()
        }}
      >
        <div
          style={{
            paddingTop: '12vh',
            paddingBottom: 'calc(var(--safe-bottom) + 32px)',
          }}
        >
          <RecipeCard
            ref={cardRef}
            recipe={recipe}
            canEditPlan={canEditPlan}
            canEditRecipes={canEditRecipes}
            actions={renderActions?.(dismiss)}
            role="dialog"
            aria-modal="true"
            aria-label={recipe.title}
            className="select-none"
            style={{
              // Same column as in the rolodex, so nothing scales.
              marginLeft: origin.left,
              width: origin.width,
              willChange: 'transform',
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function AddToMealButton({ recipeId }: { recipeId: string }) {
  const addRecipeToPlan = useStore((s) => s.addRecipeToPlan)
  const [added, setAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <button
      onClick={() => {
        addRecipeToPlan(recipeId)
        setAdded(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setAdded(false), 1400)
      }}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold leading-5 transition active:scale-95 ${
        added
          ? 'border border-kraft-edge bg-surface-2 text-brand-ink'
          : 'border border-kraft-edge bg-brand text-on-brand'
      }`}
    >
      {added ? 'Added ✓' : 'Add to Meal'}
    </button>
  )
}
