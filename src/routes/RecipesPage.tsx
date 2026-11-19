import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { useStore } from '../store/store'
import { useAuth } from '../auth/AuthProvider'
import { EmptyState, PageHeader } from '../components/ui'
import {
  CARD_H,
  CardDetail,
  RecipeCard,
  PERSPECTIVE,
  type CardOrigin,
} from '../components/RecipeCard'
import type { Recipe } from '../data/types'

/*
 * Recipes — a rolodex of paper cards on a wheel.
 *
 * Every card hangs from the wheel by its rod and lies against the drum, so its
 * tilt, height on screen and depth all follow from where it is around the
 * wheel: facing you at the front line, tipping back (and shrinking, and
 * shading) toward the top until it goes edge-on over it, leaning toward you
 * below. The set is a loop — a card that goes over the top comes back in at
 * the bottom (we cheat the circumference), so Z is followed by A again.
 *
 * Scrolling is the browser's own (real momentum): a tall spacer scrolls under
 * a pinned stage, and each frame we turn scrollTop into the wheel's rotation
 * and write one transform per card. No React renders while it spins. When it
 * comes to rest far from the middle of the spacer, it quietly re-centres
 * (invisible, since the wheel repeats every lap).
 */

const STRIP = 92 // arc between recipe cards: title + ~2 ingredients show
const TAB_H = 26 // divider tab height (sticks up above the divider card)
const DIVIDER_STRIP = TAB_H + 12 // tab + a sliver of the divider's edge
// Empty letters pack tightly: their tabs are staggered across the width, so
// they still don't collide — you just see a staircase of tabs.
const EMPTY_DIVIDER_STRIP = 13
const LAP_GAP = 0 // Z runs straight into A where the loop joins
const SIDE = 16 // horizontal inset
const TAB_W = 44 // divider tab width

// The visible part of the wheel, as angles from the front line (where a card
// faces you): the top of the screen is far round, the bottom a little past.
const DEG = Math.PI / 180
const PHI_TOP = -72 * DEG
const PHI_BOTTOM = 45 * DEG
const SPACER = 1_000_000 // scroll range; re-centred when idle
const SPIN_MS = 260 // spinning a tapped card to the front (max)

/** Divider tabs stagger across five positions. */
const tabLeftFrac = (n: number) => ((n % 5) * 19 + 3) / 100

type Item =
  | { kind: 'divider'; key: string; letter: string; n: number; rod: number }
  | { kind: 'card'; key: string; recipe: Recipe; rod: number }

/** How far below an item's top its rod (where it hangs from the wheel) is. */
const rodOffset = (it: Item) => (it.kind === 'card' ? CARD_H : TAB_H + CARD_H)

function letterOf(title: string): string {
  const c = title
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .charAt(0)
    .toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

/** Dividers (A–Z, plus # if needed; or, for search results, just the letters
 *  that have cards) and cards, with their rods' positions along the wheel's
 *  rim, and the length of one lap. */
function layout(
  recipes: Recipe[],
  onlyUsedLetters = false,
): { items: Item[]; lap: number } {
  const byLetter = new Map<string, Recipe[]>()
  for (const r of [...recipes].sort((a, b) => a.title.localeCompare(b.title))) {
    const l = letterOf(r.title)
    byLetter.set(l, [...(byLetter.get(l) ?? []), r])
  }
  const letters = [
    ...(byLetter.has('#') ? ['#'] : []),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ].filter((l) => !onlyUsedLetters || byLetter.has(l))

  const items: Item[] = []
  let top = 0 // where each item's top edge would sit, laid out flat
  letters.forEach((letter, n) => {
    const group = byLetter.get(letter) ?? []
    items.push({ kind: 'divider', key: `div-${letter}`, letter, n, rod: 0 })
    items[items.length - 1].rod = top + TAB_H + CARD_H
    top += group.length > 0 ? DIVIDER_STRIP : EMPTY_DIVIDER_STRIP
    for (const recipe of group) {
      items.push({ kind: 'card', key: recipe.id, recipe, rod: top + CARD_H })
      top += STRIP
    }
  })
  if (onlyUsedLetters) {
    // The back of the box: a plain divider, so the last match always has
    // something in front of it (as every card in the full box does).
    items.push({
      kind: 'divider',
      key: 'div-end',
      letter: '',
      n: 0,
      rod: top + TAB_H + CARD_H,
    })
    top += DIVIDER_STRIP
  }
  return { items, lap: top + LAP_GAP }
}

/** The wheel, fitted to the stage: radius, front line, and the arc on screen. */
interface Wheel {
  R: number
  /** Stage y of the rod of a card at the front line. */
  front: number
  /** Rim distance from the top of the screen to the front line. */
  toFront: number
  /** Rim on screen, plus margins where cards go over the top / come in below. */
  visible: number
  overTop: number
  underBottom: number
  lap: number
}

/** Screen offset (from the front line) of a rod at angle `phi` on a wheel of
 *  radius R, seen in perspective from the front line's height. */
const projected = (phi: number, R: number) =>
  (R * Math.sin(phi) * PERSPECTIVE) / (PERSPECTIVE + R * (1 - Math.cos(phi)))

function fitWheel(stageH: number, lap: number): Wheel {
  // The top card's rod a little below the top edge (it's tipped far back),
  // the bottom cards' rods a little below the bottom edge. Perspective pulls
  // far-round cards toward the front line, so solve for the radius in
  // projected terms.
  const topRod = CARD_H * 0.3
  const span = stageH + 40 - topRod
  let lo = 100
  let hi = 20000
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (projected(PHI_BOTTOM, mid) - projected(PHI_TOP, mid) < span) lo = mid
    else hi = mid
  }
  const R = (lo + hi) / 2
  const visible = R * (PHI_BOTTOM - PHI_TOP)
  const overTop = R * (90 * DEG + PHI_TOP) // until edge-on
  const underBottom = CARD_H * 1.2
  return {
    R,
    front: topRod - projected(PHI_TOP, R),
    toFront: -PHI_TOP * R,
    visible,
    overTop,
    underBottom,
    // A lap must be longer than what's on screen, or cards would show twice.
    lap: Math.max(lap, visible + overTop + underBottom + STRIP),
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n

export default function RecipesPage() {
  const recipes = useStore((s) => s.recipes)
  const { hasCapability } = useAuth()
  const canEditRecipes = hasCapability('edit_recipes')
  const canEditPlan = hasCapability('edit_plan')

  // Search narrows the rolodex to the cards that match (title, tag or
  // ingredient); the dividers stay, so it's still the same box.
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      q
        ? recipes.filter(
            (r) =>
              r.title.toLowerCase().includes(q) ||
              r.tags.some((t) => t.toLowerCase().includes(q)) ||
              r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
          )
        : recipes,
    [recipes, q],
  )
  const { items, lap: rawLap } = useMemo(
    () => (matches.length ? layout(matches, !!q) : { items: [], lap: 0 }),
    [matches, q],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemEls = useRef<(HTMLDivElement | null)[]>([])
  const lastPose = useRef<string[]>([])
  const lastZ = useRef<number[]>([])
  const shown = useRef<boolean[]>([])
  // The rolodex layer covers the whole page, header included (so a card
  // being taken out passes over the header rather than behind it); the wheel
  // itself sits below the header, and no resting card ever reaches up into it.
  const [pageH, setPageH] = useState(0)
  const [headerH, setHeaderH] = useState(0)
  const headerRef = useRef<HTMLDivElement>(null)
  const wheel = useMemo(
    () => fitWheel(pageH - headerH || 600, rawLap),
    [pageH, headerH, rawLap],
  )
  const [open, setOpen] = useState<{
    index: number
    recipe: Recipe
    origin: CardOrigin
  } | null>(null)

  /** Rim distance of item i below the top of the screen (negative = going
   *  over the top), for the wheel's current rotation. */
  const rimPos = useCallback(
    (i: number, scrollTop: number) => {
      const u = mod(items[i].rod - scrollTop, wheel.lap)
      return u > wheel.lap - wheel.overTop ? u - wheel.lap : u
    },
    [items, wheel],
  )

  // Per frame: place every card on the wheel. Transform/opacity-only writes,
  // skipped when unchanged.
  const raf = useRef(0)
  const lifted = useRef(-1) // the card being taken out / put back / held
  const paint = useCallback(() => {
    raf.current = 0
    const scroller = scrollRef.current
    if (!scroller || items.length === 0) return
    const st = scroller.scrollTop
    const n = items.length
    // The top-most card on screen paints first; each one below in front.
    let first = 0
    let best = Infinity
    for (let i = 0; i < n; i++) {
      const v = rimPos(i, st)
      if (v < best) {
        best = v
        first = i
      }
    }
    for (let i = 0; i < n; i++) {
      const el = itemEls.current[i]
      if (!el || i === lifted.current) continue
      const v = rimPos(i, st)
      const on = v >= -wheel.overTop && v <= wheel.visible + wheel.underBottom
      if (on !== shown.current[i]) {
        shown.current[i] = on
        el.style.visibility = on ? '' : 'hidden'
      }
      if (!on) continue
      const phi = PHI_TOP + v / wheel.R
      const rodY = wheel.front + wheel.R * Math.sin(phi)
      const z = wheel.R * (Math.cos(phi) - 1)
      const pose = `translate3d(0px, ${(headerH + rodY - rodOffset(items[i])).toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${(-phi / DEG).toFixed(2)}deg)`
      if (lastPose.current[i] !== pose) {
        lastPose.current[i] = pose
        el.style.transform = pose
        // Shade as it tips back toward the top; a touch as it leans in below.
        const deg = phi / DEG
        const shade =
          deg < 0
            ? 0.5 * Math.min(1, Math.max(0, (-deg - 20) / 55))
            : 0.15 * Math.min(1, Math.max(0, (deg - 20) / 25))
        el.style.setProperty('--shade', shade.toFixed(3))
      }
      const zi = mod(i - first, n) + 1
      if (lastZ.current[i] !== zi) {
        lastZ.current[i] = zi
        el.style.zIndex = String(zi)
      }
    }
  }, [items, wheel, rimPos, headerH])

  // Re-centre the scroll range when the wheel comes to rest far from the
  // middle (invisible: the wheel repeats every lap).
  const idle = useRef<ReturnType<typeof setTimeout>>()
  const busy = useRef(false)
  const recentre = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || busy.current) return
    const mid = Math.floor(SPACER / 2 / wheel.lap) * wheel.lap
    if (Math.abs(scroller.scrollTop - mid) < SPACER / 4) return
    scroller.scrollTop = mid + mod(scroller.scrollTop - mid, wheel.lap)
  }, [wheel])

  const onScroll = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(paint)
    clearTimeout(idle.current)
    idle.current = setTimeout(recentre, 250)
  }, [paint, recentre])

  // Start with A near the top (or, when searching, the first match's letter);
  // track the stage size.
  const positionedFor = useRef<string | null>(null)
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    if (
      positionedFor.current !== q &&
      pageH > 0 &&
      headerH > 0 &&
      items.length > 0
    ) {
      positionedFor.current = q
      const mid = Math.floor(SPACER / 2 / wheel.lap) * wheel.lap
      const firstCard = items.findIndex((it) => it.kind === 'card')
      scroller.scrollTop =
        q && firstCard >= 0
          ? // the first match at the front line, where you read cards
            mid + items[firstCard].rod - wheel.toFront
          : mid + items[0].rod - wheel.overTop * 0.15
    }
    lastPose.current = []
    lastZ.current = []
    shown.current = []
    paint()
  }, [paint, pageH, headerH, items, wheel, q])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const ro = new ResizeObserver(() => {
      setPageH(scroller.clientHeight)
      setHeaderH(headerRef.current?.offsetHeight ?? 0)
    })
    ro.observe(scroller)
    if (headerRef.current) ro.observe(headerRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf.current)
      clearTimeout(idle.current)
    }
  }, [recipes.length === 0])

  // The card element inside item `index` (it slides; its wrapper rides the wheel).
  const cardEl = (index: number) =>
    itemEls.current[index]?.firstElementChild as HTMLElement | undefined

  /** Spin the wheel so item `index` comes to the front line. Returns how long
   *  the spin takes and a promise for when it's done. */
  const spinToFront = (index: number) => {
    const scroller = scrollRef.current!
    const from = scroller.scrollTop
    let delta = rimPos(index, from) - wheel.toFront
    delta = mod(delta + wheel.lap / 2, wheel.lap) - wheel.lap / 2
    if (Math.abs(delta) < 0.5) return { ms: 0, done: Promise.resolve() }
    const ms = Math.min(SPIN_MS, 120 + Math.abs(delta) * 0.4)
    const done = new Promise<void>((resolve) => {
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms)
        scroller.scrollTop = from + delta * (1 - (1 - p) ** 3)
        if (p < 1) requestAnimationFrame(step)
        else {
          paint()
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
    return { ms, done }
  }

  /** Card `index` on the wheel right now: its pose, and its rod's place on
   *  screen (where it stands upright when taken out). */
  const wheelSpot = useCallback(
    (index: number) => {
      const st = scrollRef.current!.scrollTop
      const phi = PHI_TOP + rimPos(index, st) / wheel.R
      const rodY = wheel.front + wheel.R * Math.sin(phi)
      const z = wheel.R * (Math.cos(phi) - 1)
      const rodOnScreen =
        wheel.front + ((rodY - wheel.front) * PERSPECTIVE) / (PERSPECTIVE - z)
      return { phi, rodY, z, rodOnScreen }
    },
    [rimPos, wheel],
  )

  // Where card `index` comes out (screen space): stood upright where it hangs,
  // and how high it must rise to clear the card or tab in front of it.
  const originOf = useCallback(
    (index: number): CardOrigin => {
      const scroller = scrollRef.current!
      const r = scroller.getBoundingClientRect()
      // The layer's top edge (the screen's, under the header) clips a card
      // that rises past it; the wheel starts below the header.
      const viewTop = r.top + scroller.clientTop
      const wheelTop = viewTop + headerH
      const off = CARD_H
      const { phi, rodY, z, rodOnScreen } = wheelSpot(index)
      const slotTop = wheelTop + rodOnScreen - off
      const height = cardEl(index)?.offsetHeight ?? CARD_H
      const n = (index + 1) % items.length
      const next = itemEls.current[n]
      const nextTop =
        next && shown.current[n] ? next.getBoundingClientRect().top : Infinity // nothing in front of it on screen
      const deg = phi / DEG
      return {
        slotTop,
        clearTop: Math.min(slotTop, nextTop - height),
        left: r.left + scroller.clientLeft + SIDE,
        width: scroller.clientWidth - SIDE * 2,
        height,
        viewTop,
        wheelPose: `translate3d(0px, ${(headerH + rodY - off).toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${(-deg).toFixed(2)}deg)`,
        flatPose: `translate3d(0px, ${(headerH + rodOnScreen - off).toFixed(1)}px, 0px) rotateX(0deg)`,
        shade: Number(
          itemEls.current[index]?.style.getPropertyValue('--shade') || 0,
        ),
      }
    },
    [items, wheelSpot, headerH],
  )

  // Take the card out from wherever it hangs (the wheel doesn't move): it
  // stands up in place and slides out of its slot, then flies into view —
  // one continuous path. The foreground card mounts now and drives it all.
  const openCard = useCallback(
    (index: number) => {
      const it = items[index]
      const wrap = itemEls.current[index]
      if (it.kind !== 'card' || !wrap || busy.current) return
      busy.current = true
      lifted.current = index
      // Whole card, trimmed only below its rod (so as it slides up it comes
      // out from behind the cards in front, and nothing swings out below).
      wrap.style.height = 'auto'
      wrap.style.overflow = 'visible'
      wrap.style.clipPath = `inset(-4000px -24px calc(100% - ${CARD_H}px) -24px)`
      flushSync(() =>
        setOpen({ index, recipe: it.recipe, origin: originOf(index) }),
      )
    },
    [items, originOf],
  )

  // The card has flown back into its slot: drop the flight's leftovers.
  const onClosed = useCallback(() => {
    if (!open) return
    const wrap = itemEls.current[open.index]
    const card = cardEl(open.index)
    for (const el of [card, wrap, card?.querySelector('.rolodex-dim')])
      el?.getAnimations().forEach((a) => a.cancel())
    if (wrap) {
      wrap.style.height = `${rodOffset(items[open.index])}px`
      wrap.style.overflow = 'clip'
      wrap.style.clipPath = ''
    }
    lifted.current = -1
    flushSync(() => setOpen(null))
    busy.current = false
  }, [open, items])

  // If the cards change under us (e.g. a sync), drop any half-done lift.
  useEffect(() => {
    busy.current = false
  }, [items])

  // Tapping a letter tab spins that letter to the front.
  const jumpTo = useCallback(
    async (index: number) => {
      if (busy.current) return
      busy.current = true
      await spinToFront(index).done
      busy.current = false
    },
    [items, wheel],
  )

  const setItemEl = useCallback((i: number, el: HTMLDivElement | null) => {
    itemEls.current[i] = el
  }, [])

  const openItem = open ? items[open.index] : undefined

  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }
  const header = (
    <div ref={headerRef} className="absolute inset-x-0 top-0 z-0">
      {searching ? (
        <header className="flex items-center gap-3 bg-backdrop px-4 pt-2.5 pb-2 text-ink">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
            inputMode="search"
            enterKeyHint="search"
            placeholder="Title, tag or ingredient"
            aria-label="Search recipes"
            className="h-9 min-w-0 flex-1 rounded-lg border border-paper-edge bg-paper px-3 placeholder:text-ink-faint focus:border-kraft-edge focus:outline-none"
          />
          <button
            onClick={closeSearch}
            className="paper-serif h-9 shrink-0 text-[15px] font-semibold active:opacity-60"
          >
            Cancel
          </button>
        </header>
      ) : (
        <PageHeader
          title="Recipes"
          action={
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSearching(true)}
                aria-label="Search recipes"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-soft active:bg-black/5"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[22px] w-[22px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
              </button>
              {canEditRecipes && (
                <Link to="/recipes/new" className="kraft-tag">
                  Create
                </Link>
              )}
            </div>
          }
        />
      )}
    </div>
  )

  return (
    <div className="relative h-full">
      {recipes.length === 0 ? (
        <div style={{ paddingTop: headerH }}>
          {header}
          <EmptyState
            title="No recipes yet"
            hint={canEditRecipes ? 'Tap Create to add your first.' : undefined}
          />
        </div>
      ) : (
        <>
          {/* The rolodex's backdrop, below the header. */}
          <div
            className="absolute inset-x-0 bottom-0 bg-[#dfe8e3]"
            style={{
              top: headerH,
              boxShadow: 'inset 0 10px 14px -10px rgb(0 0 0 / 0.25)',
            }}
          />
          {/* The rolodex layer: the whole page, header included, so a card
              being taken out passes over the header rather than behind it.
              It takes touches itself (iOS won't touch-scroll a container
              with pointer-events: none); the header lives inside the stage,
              beneath every card, so its buttons still work. */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="scroll-y no-scrollbar absolute inset-0 z-[2] overflow-x-hidden"
          >
            {/* The wheel: pinned while the spacer below scrolls under it. */}
            <div
              className="sticky top-0 overflow-clip"
              style={{
                height: pageH,
                perspective: `${PERSPECTIVE}px`,
                perspectiveOrigin: `50% ${headerH + wheel.front}px`,
              }}
            >
              {header}
              {items.length === 0 && (
                <p
                  className="paper-serif absolute inset-x-0 px-8 text-center italic text-ink-soft"
                  style={{ top: headerH + 64 }}
                >
                  No recipes match “{query.trim()}”.
                </p>
              )}
              {items.map((item, i) => (
                <RolodexItem
                  key={item.key}
                  item={item}
                  index={i}
                  setEl={setItemEl}
                  canEditPlan={canEditPlan}
                  canEditRecipes={canEditRecipes}
                  onOpen={openCard}
                  onJump={jumpTo}
                />
              ))}
            </div>
            <div style={{ height: SPACER }} />
          </div>
        </>
      )}

      {open && openItem?.kind === 'card' && (
        <CardDetail
          key={open.recipe.id}
          recipe={open.recipe}
          origin={open.origin}
          getOrigin={() => originOf(open.index)}
          getRolodexCard={() => cardEl(open.index)}
          canEditRecipes={canEditRecipes}
          canEditPlan={canEditPlan}
          onClosed={onClosed}
        />
      )}
    </div>
  )
}

const RolodexItem = memo(function RolodexItem({
  item,
  index,
  setEl,
  canEditPlan,
  canEditRecipes,
  onOpen,
  onJump,
}: {
  item: Item
  index: number
  setEl: (i: number, el: HTMLDivElement | null) => void
  canEditPlan: boolean
  canEditRecipes: boolean
  onOpen: (i: number) => void
  onJump: (i: number) => void
}) {
  const off = rodOffset(item)
  // Rides the wheel (transform set per frame), hinged at its rod. Trimmed to
  // the part above the rod — the rest is behind the cards in front — with a
  // margin so its shadow still shows.
  const common = {
    ref: (el: HTMLDivElement | null) => setEl(index, el),
    className: 'pointer-events-auto absolute top-0',
    style: {
      left: SIDE,
      right: SIDE,
      height: off,
      overflow: 'clip' as const,
      overflowClipMargin: '24px',
      transformOrigin: `50% ${off}px`,
      willChange: 'transform',
      visibility: 'hidden' as const, // until the first paint places it
    },
  }

  if (item.kind === 'divider') {
    return (
      <div {...common}>
        <div
          className="paper-card paper-divider rolodex-card absolute inset-x-0"
          style={{ top: TAB_H, height: CARD_H }}
        >
          <div className="rolodex-dim" />
        </div>
        {/* The tab reaches 1px into the divider, on top of it, so there's no
            line where they join; its shadow is clipped off at the bottom.
            (The back of the box has no tab.) */}
        {item.letter && (
          <button
            onClick={() => onJump(index)}
            aria-label={`Jump to ${item.letter}`}
            className="paper-divider rolodex-card paper-serif absolute top-0 grid place-items-center rounded-t-lg border-b-0 text-[15px] font-bold"
            style={{
              height: TAB_H + 1,
              width: TAB_W,
              left: `${tabLeftFrac(item.n) * 100}%`,
              clipPath: 'inset(-12px -12px 0 -12px)',
            }}
          >
            {item.letter}
            <span className="rolodex-dim" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div {...common}>
      {/* The whole card, at its natural height. */}
      <RecipeCard
        recipe={item.recipe}
        canEditPlan={canEditPlan}
        canEditRecipes={canEditRecipes}
        role="button"
        tabIndex={0}
        aria-label={`Open ${item.recipe.title}`}
        className="cursor-pointer"
        onClick={() => onOpen(index)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(index)
          }
        }}
      />
    </div>
  )
})
