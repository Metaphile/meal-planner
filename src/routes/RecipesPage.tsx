import { Link } from 'react-router-dom'
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
import { useStore } from '../store/store'
import { newId } from '../lib/id'
import { createDrumScroll, type DrumScroll } from '../lib/drumScroll'
import { useAuth } from '../auth/AuthProvider'
import {
  CARD_H,
  CardDetail,
  HAND,
  RecipeCard,
  PERSPECTIVE,
  HEART_SIZE,
  HeartIcon,
  type CardOrigin,
  type Hand,
} from '../components/RecipeCard'
import { ConfirmDialog, PageHeader } from '../components/ui'
import { draftWords, loadDraft, saveDraft } from '../lib/draft'
import { copyText } from '../lib/clipboard'
import {
  DAY,
  bool,
  isObj,
  load,
  num,
  onLeave,
  save,
  strs,
  type Slice,
} from '../lib/uiState'
import { ListCard } from '../components/ListCard'
import { BoxIcon } from '../components/BoxIcon'
import { hasTags, tagKey, TagIcon, TagTray } from '../components/TagFilter'
import { favoriteKey, isWanted, type Recipe } from '../data/types'
import { listPath } from '../lib/listMotion'
import { wakeLockNow } from '../lib/wakeLock'

/*
 * Recipes — a rolodex of paper cards on a wheel.
 *
 * Every card hangs from the wheel by its rod and lies against the drum, so its
 * tilt, height on screen and depth all follow from where it is around the
 * wheel: facing you at the front line, tipping back (and shrinking, and
 * shading) toward the top until it goes edge-on over it, leaning toward you
 * below. The drum turns between two stops: the blank card for a new recipe
 * (in front of A) brought down into reach, and the back of the box resting
 * near the bottom. It opens with A near the top.
 *
 * The shopping list (everything the wanted recipes call for — see ListCard)
 * isn't in the box: it's a sheet that waits just below the screen, the top
 * of it peeking over the bottom edge. Turned to the end, scrolling on slides
 * it up from the bottom, and on up till its end is in view.
 *
 * Touch turns the drum under its own iOS-style physics (`lib/drumScroll`):
 * drag, momentum, and a soft spring at the stops — even a box too short to
 * need turning gives a little. The wheel and trackpad scroll it natively (a
 * spacer as long as the drum's travel, under a pinned stage), so they get the
 * Mac's own rubber band. Each change becomes one transform per card; no
 * React renders while it turns.
 */

const STRIP = 64 // arc between recipe cards: packed close — the title (to its rule, 47px down) and a little room below it
const TAB_H = 26 // divider tab height (sticks up above the divider card)
const DIVIDER_STRIP = TAB_H + 12 // tab + a sliver of the divider's edge
const SIDE = 16 // horizontal inset
/** The most of a card in the box that can ever show: down to its rod, and
 *  down to the next one's when the card in front is out (see
 *  uncoverBehind), with room to spare. Cards are drawn this far at most. */
const PEEK_H = CARD_H + 2 * STRIP
/** How far a card sinks into its slot, swiped away from (or rises from,
 *  swiped back to): its slot's height — wholly below where it's trimmed. */
const SINK_DEPTH = CARD_H
/** Cards shaded as they tilt away from you (see paint). */
const TILT_SHADE = false
/** The cards in the box are a touch narrower than that column: NARROWER of
 *  its width, taken off evenly either side. (The card in hand keeps the
 *  column.) */
const NARROWER = 0.05
const ITEM_INSET = `calc(${SIDE}px + (100% - ${2 * SIDE}px) * ${NARROWER / 2})`
/** The whole rolodex is drawn at this scale (so the card in hand, at full
 *  width, is larger than the cards in the box). Its geometry is worked out
 *  in its own unscaled units; the scroll position is in screen pixels, and
 *  converted, so a drag still moves the cards exactly with the finger. */
const SCALE = 0.93
const TAB_W = 44 // divider tab width
// The shadow of the item in front: it starts this far above that item's
// edge (the paper above it unshaded) and deepens to its darkest as far
// below the edge, out of sight — so at the edge it's about halfway.
const CAST = 0.116
const CAST_FADE = 28

// The visible part of the wheel, as angles from the front line (where a card
// faces you): the top of the screen is far round, the bottom a little past.
const DEG = Math.PI / 180
const PHI_TOP = -72 * DEG
const PHI_BOTTOM = 45 * DEG
// Where the box opens: the first item tipped
// back a little, near the top (a tipped card's top only gets so close to the
// top before it goes edge-on).
const START_PHI = -28 * DEG
// How far it can turn past that: down until the first recipe (or the blank
// card, before A) is well below the tipped-back zone, where it's easy to
// read; up until the last item (the back of the box) faces you, not leaning
// at the bottom.
const REACH_FIRST_CARD_PHI = -12 * DEG
const REACH_LAST_PHI = 16 * DEG
/** Past that, as the shopping list slides on up, the box turns on — tipping
 *  back ahead of the list, the cards above it — as far as this. */
const LIST_TIP_PHI = -50 * DEG
/** Scrolled to the end of the shopping list, this much room is left below
 *  it (and the iPhone's home indicator's room besides). */
const LIST_ROOM = 24
/** Below the screen, how much of the top of the shopping list shows over
 *  its bottom edge (as the cards beside one in hand show a sliver). */
const LIST_PEEK = 6
/** Turned to the end, the list's top is this far below the top of the back
 *  of the box (a sliver of it showing over the list). */
const LIST_DROP = 30

/** A card on the wheel is trimmed at its rod (the rest is behind the cards
 *  in front), with room above and to the sides for its shadow. (A clip-path,
 *  not overflow-clip-margin, which Safari ignores — it would trim the shadow
 *  square, leaving ghostly square corners.) Taken out, it's open upward. */
const SLOT_CLIP = 'inset(-24px -24px 0 -24px)'
const LIFT_CLIP = 'inset(-4000px -24px 0 -24px)'

/** Divider tabs stagger across five positions. */
const tabLeftFrac = (n: number) => ((n % 5) * 19 + 3) / 100

type Item =
  | { kind: 'divider'; key: string; letter: string; n: number; rod: number }
  | { kind: 'card'; key: string; recipe: Recipe; rod: number }
  /** The blank index card at the front of the box: write a new recipe. */
  | { kind: 'blank'; key: string; rod: number }

/** How far below an item's top its rod (where it hangs from the wheel) is. */
const rodOffset = (it: Item) =>
  it.kind === 'divider' ? TAB_H + CARD_H : CARD_H

function letterOf(title: string): string {
  const c = title
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .charAt(0)
    .toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

/** (For those who can write recipes) a blank card at the front, then
 *  dividers (A–Z, plus # if needed) and cards, then the back of the box —
 *  with their
 *  rods' positions along the wheel's rim. Only the letters with cards
 *  behind them have dividers — narrowed (only the wanted, or only
 *  favorites) to fewer cards, fewer dividers (and none at all, just the
 *  blank card and the back of the box). */
function layout(recipes: Recipe[], withBlank: boolean): Item[] {
  const byLetter = new Map<string, Recipe[]>()
  for (const r of [...recipes].sort((a, b) => a.title.localeCompare(b.title))) {
    const l = letterOf(r.title)
    byLetter.set(l, [...(byLetter.get(l) ?? []), r])
  }
  const letters = [
    ...(byLetter.has('#') ? ['#'] : []),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ]

  const items: Item[] = []
  let top = 0 // where each item's top edge would sit, laid out flat
  // The blank card, before the first divider (out of the way: the box opens
  // at A, and turns down to it).
  if (withBlank) {
    items.push({ kind: 'blank', key: 'blank', rod: top + CARD_H })
    top += STRIP
  }
  letters.forEach((letter, n) => {
    const group = byLetter.get(letter) ?? []
    // (A letter with nothing behind it has no divider. Its tab's place —
    // the n-th, staggered across the width — stays its own.)
    if (group.length === 0) return
    items.push({ kind: 'divider', key: `div-${letter}`, letter, n, rod: 0 })
    items[items.length - 1].rod = top + TAB_H + CARD_H
    top += DIVIDER_STRIP
    for (const recipe of group) {
      items.push({ kind: 'card', key: recipe.id, recipe, rod: top + CARD_H })
      top += STRIP
    }
  })
  // The back of the box: a plain divider (no tab), so the last recipe has
  // something in front of it.
  items.push({
    kind: 'divider',
    key: 'div-end',
    letter: '',
    n: 0,
    rod: top + TAB_H + CARD_H,
  })
  return items
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
}

/** Screen offset (from the front line) of a rod at angle `phi` on a wheel of
 *  radius R, seen in perspective from the front line's height. */
const projected = (phi: number, R: number) =>
  (R * Math.sin(phi) * PERSPECTIVE) / (PERSPECTIVE + R * (1 - Math.cos(phi)))

function fitWheel(stageH: number): Wheel {
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
  }
}

/** The screen-space top (in the stage's units, from the top of the page) of
 *  a divider's paper — not its tab — hanging at angle `phi` on the wheel:
 *  tilted about its rod, seen in the stage's perspective. (Below the wheel's
 *  visible arc, off the bottom of the screen.) */
function dividerTop(w: Wheel, headerU: number, phi: number): number {
  if (phi > PHI_BOTTOM + 20 * DEG) return Infinity
  const d = CARD_H // its paper, above the rod
  const front = headerU + w.front // (where the perspective's seen from)
  const y = front + w.R * Math.sin(phi) - d * Math.cos(phi)
  const z = w.R * (Math.cos(phi) - 1) + d * Math.sin(phi)
  if (z >= PERSPECTIVE - 1) return Infinity
  return front + ((y - front) * PERSPECTIVE) / (PERSPECTIVE - z)
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/** Where the drum stops. The first item's rim distance is `first - pos`,
 *  for pos from 0 to `max` (worked out from the first divider: the blank
 *  card, if any, before it):
 *  - It turns from its first recipe (or the blank card) brought well down
 *    into easy reading, to its last item brought well up (`turn`). It
 *    opens at `initial`: with its first divider near the top — or,
 *    narrowed, its first card as near the front as the stops allow.
 *  - A box too short to need turning (everything in it in view — narrowed
 *    to nothing, say) doesn't: it stands as it would at the end (`turn` 0).
 *  Past `turn`, the drum doesn't turn, but the shopping list slides up from
 *  the bottom of the screen, as far as there's list (`slide`): `max`.
 *  Either way it can always give a little (springing back) past the ends. */
function boundsOf(
  w: Wheel,
  items: Item[],
  faceFirst: boolean,
  /** How far the shopping list slides up, till its end's in view. */
  slide: number,
) {
  if (items.length === 0) return { first: 0, max: 0, initial: 0, turn: 0 }
  // (From the first divider; the first item's is so much less.)
  const a = Math.max(0, items.findIndex((it) => it.kind === 'divider'))
  const rod0 = items[a].rod
  const ahead = rod0 - items[0].rod // the blank card → the first divider
  const last = items[items.length - 1]
  const span = last.rod - rod0
  const rim = (phi: number) => (phi - PHI_TOP) * w.R
  const home = rim(START_PHI) // the first divider, as the box opens
  const k = items.findIndex((it) => it.kind === 'card')
  const lead = k >= 0 ? items[k].rod - rod0 : 0 // first divider → first recipe
  // The first divider's rim distance (it grows down the screen) with the
  // box turned all the way down (to the start: the first recipe, or the
  // blank card, in reach) and all the way up (to the end).
  const down = Math.max(
    home,
    rim(REACH_FIRST_CARD_PHI) - lead,
    ahead ? rim(REACH_FIRST_CARD_PHI) + ahead : 0,
  )
  const up = rim(REACH_LAST_PHI) - span
  const below = Math.max(0, slide)
  if (down <= up)
    // Too short to turn: as it is at the end.
    return { first: up - ahead, turn: 0, max: below, initial: 0 }
  // The first divider's rim distance that puts the first recipe at the front.
  const faceOn = k >= 0 ? w.toFront - lead : home
  // Narrowed, it opens with its first card as near the front as the stops
  // allow; the whole box opens with its first divider near the top.
  const opening = faceFirst ? clamp(faceOn, up, down) : home
  const turn = down - up
  return {
    first: down - ahead,
    turn,
    max: turn + below,
    initial: clamp(down - opening, 0, turn),
  }
}

/** The box as it was left, to come back to. */
interface LeftAs {
  pos: number
  /** Where the whole box was before it was narrowed. */
  beforeSearch: number | null
  wantedOnly: boolean
  favoritesOnly: boolean
  keptFavorites: ReadonlySet<string>
  kept: ReadonlySet<string>
  /** The tags it's narrowed to (keys: see tagKey). */
  tags: ReadonlySet<string>
  keptTagged: ReadonlySet<string>
  /** New recipes written while it was narrowed (in it whatever it's
   *  narrowed to). */
  made: ReadonlySet<string>
}
/** …kept on the device (leaving the app, or a new version of it, comes back
 *  to it as it was). */
const BOX: Slice<LeftAs> = {
  key: 'rolodex',
  // (2: the blank card moved to the front — a position kept before means
  // somewhere else now.)
  version: 2,
  maxAgeMs: DAY,
  parse: (x) =>
    isObj(x)
      ? {
          pos: num(x.pos) ?? 0,
          beforeSearch: num(x.beforeSearch) ?? null,
          wantedOnly: bool(x.wantedOnly),
          favoritesOnly: bool(x.favoritesOnly),
          keptFavorites: new Set(strs(x.keptFavorites)),
          kept: new Set(strs(x.kept)),
          tags: new Set(strs(x.tags)),
          keptTagged: new Set(strs(x.keptTagged)),
          made: new Set(strs(x.made)),
        }
      : null,
}
const keepBox = (b: LeftAs) =>
  save(BOX, {
    ...b,
    keptFavorites: [...b.keptFavorites],
    kept: [...b.kept],
    tags: [...b.tags],
    keptTagged: [...b.keptTagged],
    made: [...b.made],
  } as unknown as LeftAs)
/** (Kept here too, switching tabs: no need to read it back.) */
let leftAs: LeftAs | null = null

export default function RecipesPage() {
  // The box as it was left: from switching tabs, or kept on the device.
  const [left] = useState(() => leftAs ?? load(BOX))
  const recipes = useStore((s) => s.recipes)
  const { canWrite } = useAuth()
  const canEditRecipes = canWrite
  const canEditPlan = canWrite

  // Ticked, the box narrows to just the wanted recipes (the dividers stay,
  // so it's still the same box).
  const [wantedOnly, setWantedOnly] = useState(left?.wantedOnly ?? false)
  const wants = useStore((s) => s.wants)
  // The recipes wanted when it was ticked stay in the box until it's
  // unticked — unwanting one there doesn't whisk it away (and any wanted
  // since join them).
  const [kept, setKept] = useState<ReadonlySet<string>>(
    () => left?.kept ?? new Set(),
  )
  const toggleWantedOnly = () => {
    unmake()
    if (!wantedOnly)
      setKept(new Set(wants.filter(isWanted).map((w) => w.recipeId)))
    setWantedOnly(!wantedOnly)
  }
  // …and, hearted, to just your favorites (the same way: unhearting one
  // there doesn't whisk it away).
  const { user } = useAuth()
  const favorites = useStore((s) => s.favorites)
  const myFavorites = useMemo(() => {
    const prefix = user ? favoriteKey(user.id, '') : null
    return new Set(
      favorites
        .filter((f) => prefix !== null && f.id.startsWith(prefix))
        .map((f) => f.recipeId),
    )
  }, [favorites, user])
  const [favoritesOnly, setFavoritesOnly] = useState(
    left?.favoritesOnly ?? false,
  )
  const [keptFavorites, setKeptFavorites] = useState<ReadonlySet<string>>(
    () => left?.keptFavorites ?? new Set(),
  )
  const toggleFavoritesOnly = () => {
    unmake()
    if (!favoritesOnly) setKeptFavorites(new Set(myFavorites))
    setFavoritesOnly(!favoritesOnly)
  }
  // …and to the recipes with every tag chosen (the same way again: a tag
  // taken off one there doesn't whisk it away).
  const [tagsOn, setTagsOn] = useState<ReadonlySet<string>>(
    () => left?.tags ?? new Set(),
  )
  const [keptTagged, setKeptTagged] = useState<ReadonlySet<string>>(
    () => left?.keptTagged ?? new Set(),
  )
  const [tagTray, setTagTray] = useState(false)
  const closeTagTray = useCallback(() => setTagTray(false), [])
  const chooseTags = (next: ReadonlySet<string>) => {
    unmake()
    setKeptTagged(
      new Set(recipes.filter((r) => hasTags(r.tags, next)).map((r) => r.id)),
    )
    setTagsOn(next)
  }
  const toggleTag = (t: string) => {
    const next = new Set(tagsOn)
    if (!next.delete(t)) next.add(t)
    chooseTags(next)
  }
  // Every tag on any recipe, A to Z — lowercase, however it's written on
  // a card ("Dinner" and "dinner" are one tag) — and any chosen that's on
  // none any more, to be let go of.
  const allTags = useMemo(() => {
    const keys = new Set(tagsOn)
    for (const r of recipes) for (const t of r.tags) if (tagKey(t)) keys.add(tagKey(t))
    return [...keys]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ key, text: key }))
  }, [recipes, tagsOn])
  const tagsKey = [...tagsOn].sort().join(',')
  // A new recipe written while the box is narrowed is in it, whatever it's
  // narrowed to (till it's not narrowed any more) — it's what you're making.
  const [made, setMade] = useState<ReadonlySet<string>>(
    () => left?.made ?? new Set(),
  )
  // Narrowed to something else, or not any more: the new recipes made
  // meanwhile are just recipes again — in it or not as any other is. (Done
  // as the filter's changed: not worked out while rendering, where a render
  // React throws away would lose it.)
  function unmake() {
    setMade((m) => (m.size ? new Set() : m))
  }
  const matches = useMemo(() => {
    const wanted = new Set(wants.filter(isWanted).map((w) => w.recipeId))
    return recipes.filter(
      (r) =>
        made.has(r.id) ||
        ((!wantedOnly || wanted.has(r.id) || kept.has(r.id)) &&
          (!favoritesOnly ||
            myFavorites.has(r.id) ||
            keptFavorites.has(r.id)) &&
          (tagsOn.size === 0 ||
            hasTags(r.tags, tagsOn) ||
            keptTagged.has(r.id))),
    )
  }, [
    tagsOn,
    keptTagged,
    made,
    recipes,
    wantedOnly,
    wants,
    kept,
    favoritesOnly,
    myFavorites,
    keptFavorites,
  ])
  // The tags that, chosen too, would leave something in the box.
  const tagsAvailable = useMemo(
    () => new Set(matches.flatMap((r) => r.tags.map(tagKey))),
    [matches],
  )
  // Any narrowing at all (it opens on its first match).
  const narrowed = wantedOnly || favoritesOnly || tagsOn.size > 0
  const narrowedRef = useRef(narrowed)
  narrowedRef.current = narrowed
  // The rolodex layer covers the whole page, header included (so a card
  // being taken out passes over the header rather than behind it); the wheel
  // itself sits below the header, and no resting card ever reaches up into it.
  const [pageH, setPageH] = useState(0)
  const [headerH, setHeaderH] = useState(0)
  // The room the screen keeps at its foot (the iPhone's home indicator).
  const [footH, setFootH] = useState(0)
  const footRef = useRef<HTMLDivElement>(null)
  // The wheel's own units (the stage is drawn at SCALE).
  const headerU = headerH / SCALE
  const stageH = (pageH - headerH) / SCALE || 600
  // How long the list is (how far there is to scroll down it).
  const [listH, setListH] = useState(0)
  const items = useMemo(
    () => layout(matches, canEditRecipes),
    [matches, canEditRecipes],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemEls = useRef<(HTMLDivElement | null)[]>([])
  const lastPose = useRef<string[]>([])
  const lastZ = useRef<number[]>([])
  // Each item's shade as last written (to its .rolodex-dim elements' opacity
  // directly: a CSS variable on the wrapper would restyle the whole card
  // every frame), and those elements.
  const lastShade = useRef<number[]>([])
  const dims = useRef(new WeakMap<HTMLElement, HTMLElement[]>())
  const shown = useRef<boolean[]>([])
  const headerRef = useRef<HTMLDivElement>(null)
  const wheel = useMemo(() => fitWheel(stageH), [stageH])
  // Where the shopping list's top is on screen (from the top of the page),
  // turned to the end of the box: just below the top of its back (never
  // lower than peeking over the bottom edge).
  const listStart = Math.min(
    pageH - LIST_PEEK,
    dividerTop(wheel, headerU, REACH_LAST_PHI) * SCALE + LIST_DROP,
  )
  // Its path as the box scrolls (see listMotion): there as the turning ends
  // (scrolled 0 past it); coming up over the bottom edge faster than the
  // finger, and settling toward the finger's pace all the way up.
  const listEnd = pageH - footH - LIST_ROOM - listH
  const listMove = useMemo(
    () =>
      listPath(
        { rest: pageH - LIST_PEEK, top: headerH, anchor: 0, anchorY: listStart },
        Math.min(listEnd, 0) - pageH,
      ),
    [pageH, headerH, listStart, listEnd],
  )
  const bounds = useMemo(
    () =>
      boundsOf(
        wheel,
        items,
        narrowed,
        // (How far it scrolls past the turning till the list's end is in
        // view, with room below it — and the home indicator's. In the
        // stage's units.)
        listMove.scrollFor(listEnd) / SCALE,
      ),
    [wheel, items, narrowed, listMove, listEnd],
  )
  // The card in hand, by recipe id (editing it can move it to another
  // letter, or delete it, while it's out).
  const [open, setOpen] = useState<{
    key: string
    recipe: Recipe
    /** A new recipe, not yet in the box (it may never be). */
    isNew?: boolean
    origin: CardOrigin
    /** Taken up as it was left (see `resumeHand`). */
    resume?: Hand
  } | null>(null)
  const indexOf = (key: string) => items.findIndex((it) => it.key === key)

  /** Rim distance of item i below the top of the screen (negative = gone
   *  over the top), for the drum at position `pos`. */
  const rimPos = useCallback(
    (i: number, pos: number) =>
      items[i].rod - items[0].rod + bounds.first - pos / SCALE,
    [items, bounds],
  )

  /** Where the wheel is turned to (as a drum position) with the drum at
   *  `at`: past the end of the turning — the shopping list sliding on up —
   *  it turns on as it was, tipping back ahead of the list (the list, 1:1,
   *  soon overtaking the back of the box, the cards before it leaning back
   *  above it), till the back of the box is as far back as LIST_TIP_PHI. */
  const wheelAt = useCallback(
    (at: number) => {
      const turn = bounds.turn * SCALE
      if (at <= turn || items.length === 0) return at
      const k = items.length - 1
      const reach = items[k].rod - items[0].rod + bounds.first
      const tipped = (reach - (LIST_TIP_PHI - PHI_TOP) * wheel.R) * SCALE
      return Math.min(at, Math.max(turn, tipped))
    },
    [items, bounds, wheel],
  )

  // Per frame: place every card on the wheel. Transform/opacity-only writes,
  // skipped when unchanged.
  const raf = useRef(0)
  const lifted = useRef<string | null>(null) // key of the card out of the box
  const paint = useCallback(() => {
    raf.current = 0
    const drum = drumRef.current
    if (!drum || items.length === 0) return
    // Past where it turns to, the list slides on up, the box tipping back
    // ahead of it.
    const at = drum.get()
    const turn = bounds.turn * SCALE
    // The shopping list: in front of the box, not riding its wheel — at its
    // own pace (see listMove): up over the bottom edge faster than the
    // finger, outpacing the box behind it, and settling toward its pace.
    const sheet = listRef.current
    if (sheet) {
      const top = listMove.at(at - turn)
      const y = `translate3d(0px, ${top.toFixed(1)}px, 0px)`
      if (sheet.style.transform !== y) sheet.style.transform = y
    }
    // (Past the turning, tipping on back ahead of the list.)
    const tipped = wheelAt(at)
    for (let i = 0; i < items.length; i++) {
      const el = itemEls.current[i]
      if (!el) continue
      const v = rimPos(i, tipped)
      const on = v >= -wheel.overTop && v <= wheel.visible + wheel.underBottom
      // The card that's out isn't moved (its flight drives it) — but whether
      // its slot is on screen is kept up to date: putting it back drops it
      // into its slot only if it is. (Repainting afresh after any change —
      // a sync, or its want changed in hand — used to forget that, and it
      // would reappear in place, unanimated.)
      if (items[i].key === lifted.current) {
        shown.current[i] = on
        continue
      }
      if (on !== shown.current[i]) {
        shown.current[i] = on
        el.style.visibility = on ? '' : 'hidden'
      }
      if (!on) continue
      const phi = PHI_TOP + v / wheel.R
      const rodY = wheel.front + wheel.R * Math.sin(phi)
      const z = wheel.R * (Math.cos(phi) - 1)
      const pose = `translate3d(0px, ${(headerU + rodY - rodOffset(items[i])).toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${(-phi / DEG).toFixed(2)}deg)`
      if (lastPose.current[i] !== pose) {
        lastPose.current[i] = pose
        el.style.transform = pose
        // Shade as it tilts away from facing you, whether tipping back at the
        // top or leaning in at the bottom. (Only when it visibly changes.)
        // Off for now (TILT_SHADE): changing a card's shade re-draws the
        // whole card, which, for nearly every card, every frame, made
        // turning the drum choppy on the phone.
        const deg = phi / DEG
        const shade = !TILT_SHADE
          ? 0
          : Math.round(
              0.376 * Math.min(1, Math.max(0, (Math.abs(deg) - 12) / 55)) * 100,
            ) / 100
        if (lastShade.current[i] !== shade) {
          lastShade.current[i] = shade
          let ds = dims.current.get(el)
          if (!ds) {
            ds = [...el.querySelectorAll<HTMLElement>('.rolodex-dim')]
            dims.current.set(el, ds)
          }
          for (const d of ds) d.style.opacity = String(shade)
        }
      }
      // Each item in front of the one before it.
      const zi = i + 1
      if (lastZ.current[i] !== zi) {
        lastZ.current[i] = zi
        el.style.zIndex = String(zi)
      }
    }
  }, [items, wheel, rimPos, headerU, bounds, listMove, wheelAt])

  const busy = useRef(false)

  // The drum turns under our own iOS-style physics (no native scrolling): it
  // tells us when it moves, and we paint.
  const drumRef = useRef<DrumScroll | null>(null)
  // What the box is narrowed to now (remembered with the drum on leaving).
  const leftStateRef = useRef({
    wantedOnly,
    kept,
    favoritesOnly,
    keptFavorites,
    tags: tagsOn,
    keptTagged,
    made,
  })
  leftStateRef.current = {
    wantedOnly,
    kept,
    favoritesOnly,
    keptFavorites,
    tags: tagsOn,
    keptTagged,
    made,
  }
  const paintRef = useRef(paint)
  paintRef.current = paint
  useLayoutEffect(() => {
    const layer = scrollRef.current!
    const drum = createDrumScroll(layer, {
      // In an animation frame: paint now. From touch input: once per frame.
      onChange: (now) => {
        if (now) paintRef.current()
        else if (!raf.current)
          raf.current = requestAnimationFrame(() => paintRef.current())
      },
      dimension: () => layer.clientHeight,
    })
    drumRef.current = drum
    // Leaving (another tab, or the app): remember where the box was turned
    // to, and what it was narrowed to.
    const keep = () => {
      // (Not before it's been turned to where it was: nothing to keep yet.)
      if (!placed.current) return
      leftAs = {
        ...leftStateRef.current,
        pos: drum.get(),
        beforeSearch: beforeSearch.current,
      }
      keepBox(leftAs)
    }
    const stop = onLeave(keep)
    return () => {
      stop()
      keep()
      drum.destroy()
      drumRef.current = null
    }
  }, [])
  useLayoutEffect(() => {
    drumRef.current?.setMax(bounds.max * SCALE)
  }, [bounds])
  // The shopping list's sheet. (Its length measured as it's drawn, and
  // again whenever it grows or shrinks.)
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setListH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Start at the start (A near the top; a short box with its first recipe
  // facing you) — again each time it's narrowed, and once the page is
  // measured.
  const positionedFor = useRef<string | null>(null)
  const placed = useRef(false) // turned to where it starts (or was left)
  // (Back from another tab: turned where it was left, once it's measured.)
  const returnTo = useRef(left?.pos)
  // Where the whole box was turned to when it was narrowed: no longer
  // narrowed, it goes back there.
  const beforeSearch = useRef<number | null>(left?.beforeSearch ?? null)
  const wasNarrowed = useRef(narrowed)
  // Where the drum stopped turning (the list at the front), as last placed.
  const turnWas = useRef<number | null>(null)
  // The last change of what the box is narrowed to: from what (`key`), and
  // where it was turned to before and after. Changed straight back, the
  // box not moved meanwhile, it goes back just where it was.
  const lastChange = useRef<{ key: string; from: number; to: number } | null>(
    null,
  )
  // Where the list was put (by scrolling — from where the drum stops
  // turning), while the box is anchored to it: a box too short to hold it
  // there puts it as near as it can, and one long enough again puts it back.
  const listWant = useRef<number | null>(null)
  useLayoutEffect(() => {
    const drum = drumRef.current
    // (The list's length too: how far the box was scrolled down it.)
    const measured = pageH > 0 && headerH > 0 && listH > 0
    const key = `${wantedOnly}|${favoritesOnly}|${tagsKey}|${measured}`
    const within = (p: number) => Math.min(Math.max(0, p), bounds.max * SCALE)
    if (positionedFor.current !== key) {
      const keyWas = positionedFor.current
      positionedFor.current = key
      if (narrowed && !wasNarrowed.current && drum)
        beforeSearch.current = drum.get()
      // Changed straight back (Wanted only, ticked and unticked again), the
      // box not moved since: back just where it was — wherever that was.
      const back = lastChange.current
      // (Not moved since the last change: just as that left it.)
      const still = !!drum && back !== null && Math.abs(drum.get() - back.to) < 1
      const undo =
        still &&
        placed.current &&
        returnTo.current === undefined &&
        back!.key === key
      // The shopping list up in view (more than its peeking top — following
      // the back of the box up, or slid on up past it): the box is anchored
      // to it. It stays just where it was, whatever the box behind it is
      // narrowed to — measured from where the drum stops turning (which
      // moves as the box gets longer or shorter), so the back of the box,
      // and the list with it, is where it was. (Only so far as the box
      // allows: too short to hold it there, as near as it can.)
      const at = drum?.get() ?? 0
      const sheet = listRef.current
      const layer = scrollRef.current
      const raised =
        !!sheet &&
        !!layer &&
        sheet.getBoundingClientRect().top <
          layer.getBoundingClientRect().bottom - LIST_PEEK - 1
      const onList =
        placed.current &&
        returnTo.current === undefined &&
        turnWas.current !== null &&
        raised
      if (undo) {
        drum?.set(within(back!.from))
        if (!narrowed) beforeSearch.current = null
      } else if (onList) {
        const want =
          still && listWant.current !== null
            ? listWant.current
            : at - turnWas.current!
        listWant.current = want
        drum?.set(within(bounds.turn * SCALE + want))
        if (!narrowed) beforeSearch.current = null
      } else if (returnTo.current !== undefined && measured) {
        drum?.set(within(returnTo.current))
        returnTo.current = undefined
      } else if (returnTo.current === undefined) {
        if (!narrowed && beforeSearch.current !== null) {
          drum?.set(within(beforeSearch.current))
          beforeSearch.current = null
        } else drum?.set(bounds.initial * SCALE)
      }
      if (!onList && !undo) listWant.current = null
      lastChange.current =
        placed.current && keyWas !== null && drum
          ? { key: keyWas, from: at, to: drum.get() }
          : null
      if (measured && drum) placed.current = true
    }
    wasNarrowed.current = narrowed
    turnWas.current = bounds.turn * SCALE
    lastPose.current = []
    lastZ.current = []
    lastShade.current = []
    shown.current = []
    paint()
  }, [paint, wantedOnly, favoritesOnly, tagsKey, narrowed, pageH, headerH, listH, bounds])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const measure = () => {
      setPageH(scroller.clientHeight)
      setHeaderH(headerRef.current?.offsetHeight ?? 0)
      setFootH(footRef.current?.offsetHeight ?? 0)
    }
    // (At once, before anything's drawn — so the box is turned to where it
    // was, and a card left in hand is back in it, from the first frame.)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scroller)
    if (headerRef.current) ro.observe(headerRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf.current)
    }
  }, [recipes.length === 0])

  // The card element inside item `index` (it slides; its wrapper rides the wheel).
  const cardEl = (index: number) =>
    itemEls.current[index]?.firstElementChild as HTMLElement | undefined

  /** Where the drum stands with item `index` at the top (as the first item
   *  does at the start), or as near as the ends allow. */
  const turnedTo = (index: number) => {
    const top = (START_PHI - PHI_TOP) * wheel.R
    return (
      clamp(items[index].rod - items[0].rod + bounds.first - top, 0, bounds.max) *
      SCALE
    )
  }

  /** Card `index` on the wheel right now: its pose, and its rod's place on
   *  screen (where it stands upright when taken out). */
  const wheelSpot = useCallback(
    (index: number) => {
      const st = wheelAt(drumRef.current!.get())
      const phi = PHI_TOP + rimPos(index, st) / wheel.R
      const rodY = wheel.front + wheel.R * Math.sin(phi)
      const z = wheel.R * (Math.cos(phi) - 1)
      const rodOnScreen =
        wheel.front + ((rodY - wheel.front) * PERSPECTIVE) / (PERSPECTIVE - z)
      return { phi, rodY, z, rodOnScreen }
    },
    [rimPos, wheel, wheelAt],
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
      // (On screen, the stage is drawn at SCALE; its poses are its own.)
      const slotTop = wheelTop + (rodOnScreen - off) * SCALE
      const height = (cardEl(index)?.offsetHeight ?? CARD_H) * SCALE
      const n = index + 1
      const next = n < items.length ? itemEls.current[n] : null
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
        hiddenAbove: wheelTop, // (behind the header)
        lean: { deg, z, rodOffset: off },
        wheelPose: `translate3d(0px, ${(headerU + rodY - off).toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${(-deg).toFixed(2)}deg)`,
        flatPose: `translate3d(0px, ${(headerU + rodOnScreen - off).toFixed(1)}px, 0px) rotateX(0deg)`,
        shade: lastShade.current[index] ?? 0,
      }
    },
    [items, wheelSpot, headerH, headerU],
  )

  // Ready a card's slot for it to slide out of (or back into): the whole
  // card, trimmed only below its rod (so as it slides up it comes out from
  // behind the cards in front, and nothing swings out below).
  const freeSlot = (wrap: HTMLDivElement) => {
    wrap.style.clipPath = LIFT_CLIP
    wrap.dataset.free = ''
  }

  // A card on the wheel is trimmed at its rod, out of sight behind the card
  // in front. While that card is out (see-through as it fades away), the
  // card behind it shows down to where the card out of the box was trimmed
  // — below that, the next card in front hides the trim again.
  const uncovered = useRef<HTMLDivElement | null>(null)
  const uncoverBehind = (index: number) => {
    const behind = index > 0 ? itemEls.current[index - 1] : null
    if (!behind) return
    const more = items[index].rod - items[index - 1].rod + 12
    behind.style.clipPath = `inset(-24px -24px ${-more}px -24px)`
    uncovered.current = behind
  }

  /** Where the card in hand goes back to — or null if it has no place in
   *  the box (a new card saved while it's narrowed to something else). A card
   *  that was never in the box (a new one, just saved) gets its slot
   *  readied first; one whose slot is out of sight has the box turned to
   *  it. */
  const homeOf = (key: string): CardOrigin | null => {
    const i = indexOf(key)
    const wrap = i >= 0 ? itemEls.current[i] : null
    if (!wrap) return null
    const placeAll = () => {
      lifted.current = null
      lastPose.current = []
      lastShade.current = []
      shown.current = []
      paint()
    }
    if (wrap.dataset.free === undefined) {
      // Placed on the wheel once (it was skipped while in hand), then freed.
      placeAll()
      lifted.current = key
      freeSlot(wrap)
    }
    // Its slot out of sight (a new recipe just saved, the box not turned to
    // it; or one renamed to another letter): the box is turned to it first
    // — behind the shade — so it goes back as any card does, fading as its
    // card in the box drops into the slot. (Not flying off the screen.)
    if (!shown.current[i] && drumRef.current) {
      drumRef.current.set(turnedTo(i))
      placeAll()
      lifted.current = key
    }
    const o = originOf(i)
    if (shown.current[i]) return o
    // (Still out of sight — the box can't turn far enough: off toward it.)
    const above = rimPos(i, wheelAt(drumRef.current?.get() ?? 0)) < 0
    const out = above ? o.viewTop - o.height - 24 : window.innerHeight + 24
    return {
      ...o,
      slotTop: out,
      clearTop: out,
      wheelPose: 'none',
      flatPose: 'none',
    }
  }

  // Take the card out from wherever it hangs (the wheel doesn't move): it
  // stands up in place and slides out of its slot, then flies into view —
  // one continuous path. The foreground card mounts now and drives it all.
  const openCard = useCallback(
    (index: number, resume?: Hand) => {
      const it = items[index]
      const wrap = itemEls.current[index]
      if (it.kind !== 'card' || !wrap || busy.current) return
      busy.current = true
      // (In the tap: the screen kept awake while it's in hand.)
      wakeLockNow()
      lifted.current = it.key
      freeSlot(wrap)
      uncoverBehind(index)
      const next = {
        key: it.key,
        recipe: it.recipe,
        origin: originOf(index),
        resume,
      }
      // (Taken up as it was — from a layout effect, before it's drawn: set
      // there, it's drawn already in hand.)
      if (resume) setOpen(next)
      else flushSync(() => setOpen(next))
    },
    [items, originOf],
  )

  // The card has flown back into its slot: drop the flight's leftovers.
  const onClosed = useCallback(() => {
    if (!open) return
    // (Gone if it was deleted while out.)
    const i = indexOf(open.key)
    const wrap = i >= 0 ? itemEls.current[i] : null
    const card = i >= 0 ? cardEl(i) : undefined
    for (const el of [card, wrap, card?.querySelector('.rolodex-dim')])
      el?.getAnimations().forEach((a) => a.cancel())
    if (wrap) {
      wrap.style.clipPath = SLOT_CLIP
      delete wrap.dataset.free
    }
    if (uncovered.current) {
      uncovered.current.style.clipPath = SLOT_CLIP
      uncovered.current = null
    }
    lifted.current = null
    // Back on the wheel: place it afresh (it wasn't painted while out, and
    // editing may have moved it to another letter).
    lastPose.current = []
    lastZ.current = []
    lastShade.current = []
    shown.current = []
    paint()
    flushSync(() => setOpen(null))
    busy.current = false
  }, [open, items, paint])

  /** The card `dir` along from item `from` (1: the next, -1: the one
   *  before) — as the box shows them now (only the wanted, say) —
   *  or -1 if it's the only one. */
  const besideOf = (from: number, dir: 1 | -1) => {
    if (from < 0) return -1
    const n = items.length
    // (Round the end to the start, and back: the last is beside the first.)
    for (let s = 1; s < n; s++) {
      const j = (((from + dir * s) % n) + n) % n
      if (items[j].kind === 'card') return j === from ? -1 : j
    }
    return -1
  }
  const recipeAt = (j: number) => {
    const it = items[j]
    return it?.kind === 'card' ? it.recipe : undefined
  }

  /** Item `k` back in its slot, hanging there as in the box (not lifted
   *  out, not faded). */
  const backInSlot = (k: number) => {
    const wrap = itemEls.current[k]
    const card = cardEl(k)
    for (const el of [card, wrap, card?.querySelector('.rolodex-dim')])
      el?.getAnimations().forEach((a) => a.cancel())
    if (card) {
      card.style.opacity = ''
      card.style.transform = ''
      card.style.willChange = ''
    }
    if (wrap) {
      wrap.style.clipPath = SLOT_CLIP
      delete wrap.dataset.free
    }
  }
  /** Item `k` out of the box: its slot freed, the card out of sight in it
   *  (as once it's lifted out — putting it back drops it in from there). */
  const outOfSlot = (k: number) => {
    const it = items[k]
    const wrap = itemEls.current[k]
    const card = cardEl(k)
    if (!wrap || !card) return
    card.style.opacity = ''
    card.style.transform = ''
    card.style.willChange = ''
    card.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: 1,
      fill: 'forwards',
    })
    lifted.current = it.key
    freeSlot(wrap)
    uncoverBehind(k)
  }
  /** The card behind item `k` shown whole (under it, while it's
   *  see-through); returns it, to be trimmed again after. */
  const seeBehind = (k: number) => {
    const behind = k > 0 ? itemEls.current[k - 1] : null
    if (!behind) return null
    const more = items[k].rod - items[k - 1].rod + 12
    behind.style.clipPath = `inset(-24px -24px ${-more}px -24px)`
    return behind
  }
  /** Every card placed afresh (none skipped as out of the box). */
  const repaintAll = () => {
    lifted.current = null
    lastPose.current = []
    lastZ.current = []
    lastShade.current = []
    shown.current = []
    paint()
  }

  // Swiping from the card in hand to the one beside it, the box follows
  // along, behind the shade: the drum turns from the one's slot toward the
  // other's (as far as the other is from it), as the card in hand fades
  // back into its slot and the other fades out of its — `p` of the way
  // (0: as it was, 1: all the way), one smooth motion with the swipe.
  // The card in hand, being swiped back into the box (see previewStep).
  const [returning, setReturning] = useState<string | null>(null)
  const swipe = useRef<{
    dir: 1 | -1
    i: number // the card in hand's item
    j: number // the one beside it
    from: number // the drum, before
    to: number // …and once there
    seeThrough: HTMLElement[]
  } | null>(null)
  const previewStep = (dir: 1 | -1, p: number) => {
    if (!open) return
    let s = swipe.current
    // (Swiped the other way, or back where it started: as it was.)
    if (s && (s.dir !== dir || p <= 0)) {
      undoSwipe()
      s = null
    }
    if (p <= 0) return
    const drum = drumRef.current
    if (!s) {
      const i = indexOf(open.key)
      const j = besideOf(i, dir)
      if (i < 0 || j < 0 || !drum) return
      // The card in hand's slot: as in the box again — its card sunk deep
      // in it, out of sight (it rises as it's swiped back).
      if (uncovered.current) {
        uncovered.current.style.clipPath = SLOT_CLIP
        uncovered.current = null
      }
      backInSlot(i)
      setReturning(open.key)
      // (Each on a layer of its own as it moves: moved, a card not on one is
      // drawn again, every frame.)
      for (const el of [cardEl(i), cardEl(j)]) if (el) el.style.willChange = 'transform'
      // (What's behind each shows — all of it, below where it's trimmed
      // too: behind the one going, as it will with that one gone; behind
      // the one coming back, as it did with that one out, till it's
      // risen over it.)
      const seeThrough = [seeBehind(i), seeBehind(j)].filter(
        (el): el is HTMLDivElement => !!el,
      )
      repaintAll()
      const from = drum.get()
      const to =
        clamp(from / SCALE + items[j].rod - items[i].rod, 0, bounds.max) *
        SCALE
      s = swipe.current = { dir, i, j, from, to, seeThrough }
    }
    // (Moved, not set: once a frame at most, and no layout forced — see
    // DrumScroll.move. Set at the end, in undoSwipe or stepCard.)
    drum!.move(s.from + (s.to - s.from) * p)
    // The one coming back rises up out of the depths of its slot into
    // place; the one going sinks down into its own, out of sight — each by
    // as far as it's been swiped. (A card sunk its slot's height is
    // wholly below where its slot trims it.)
    const ci = cardEl(s.i)
    const cj = cardEl(s.j)
    if (ci) ci.style.transform = `translateY(${(SINK_DEPTH * (1 - p)).toFixed(1)}px)`
    if (cj) cj.style.transform = `translateY(${(SINK_DEPTH * p).toFixed(1)}px)`
  }
  /** Swiped back: the box as it was (the card in hand out of its slot
   *  again, the other in its own). */
  const undoSwipe = () => {
    const s = swipe.current
    if (!s) return
    swipe.current = null
    setReturning(null)
    for (const el of s.seeThrough) el.style.clipPath = SLOT_CLIP
    backInSlot(s.j)
    drumRef.current?.set(s.from)
    repaintAll()
    outOfSlot(s.i)
  }
  // Swiped all the way to the card beside it: that one is out of the box
  // now, in hand, and the other back in its slot — where the swipe left
  // them. (A key: all the way at once.)
  const stepCard = (dir: 1 | -1) => {
    if (!open) return
    previewStep(dir, 1)
    const s = swipe.current
    if (!s) return
    swipe.current = null
    drumRef.current?.set(s.to)
    for (const el of s.seeThrough) el.style.clipPath = SLOT_CLIP
    backInSlot(s.i)
    const it = items[s.j]
    if (it.kind !== 'card') return
    flushSync(() => {
      setOpen({ ...open, key: it.key, recipe: it.recipe })
      setReturning(null)
    })
    outOfSlot(s.j)
  }

  // If the cards change under us (e.g. a sync), drop any half-done lift.
  useEffect(() => {
    busy.current = false
  }, [items])

  // A blank card: write a new recipe on it.
  // The blank card: a new card rises into view already turned over, to be
  // written on. (Saved, it's a recipe like any other, and goes into the box.)
  const newCard = useCallback((id?: string, resume?: Hand) => {
    const layer = scrollRef.current
    if (!layer || busy.current) return
    busy.current = true
    wakeLockNow()
    const r = layer.getBoundingClientRect()
    // (A new recipe left mid-edit keeps its id: its edit's kept by it.)
    const draft: Recipe = { id: id ?? newId(), title: '', tags: [], ingredients: [] }
    lifted.current = draft.id
    // (The box narrowed: it'll be in it, once it's saved.)
    if (narrowedRef.current) setMade((m) => new Set(m).add(draft.id))
    const below = window.innerHeight + 24
    const next = {
      key: draft.id,
      recipe: draft,
      isNew: true,
      origin: {
        slotTop: below,
        clearTop: below,
        left: r.left + layer.clientLeft + SIDE,
        width: layer.clientWidth - SIDE * 2,
        height: CARD_H,
        viewTop: r.top + layer.clientTop,
        wheelPose: 'none',
        flatPose: 'none',
        shade: 0,
      },
      resume,
    }
    if (resume) setOpen(next)
    else flushSync(() => setOpen(next))
  }, [])

  // The card that was in hand when the app was left (or a new version of it
  // put in place) — or, kept longer, an edit never saved: taken out again,
  // as it was, once the box is ready.
  const [resumeHand] = useState<Hand | null>(() => {
    const hand = load(HAND)
    if (hand) return hand
    const kept = loadDraft()
    return kept && 'draft' in kept
      ? {
          recipeId: kept.draft.recipeId,
          isNew: kept.draft.isNew,
          scroll: 0,
          editing: true,
        }
      : null
  })
  // An edit kept that can't be taken up: its words, to copy out.
  const [lostDraft, setLostDraft] = useState<{
    words: string
    why: 'update' | 'gone'
  } | null>(() => {
    const kept = loadDraft()
    return kept && 'unreadable' in kept
      ? { words: kept.unreadable, why: 'update' }
      : null
  })
  const resumed = useRef(false)
  // (A layout effect: in hand before the box is first drawn, as it was —
  // nothing to see happen.)
  useLayoutEffect(() => {
    if (resumed.current || !(pageH > 0 && headerH > 0)) return
    resumed.current = true
    if (!resumeHand) return
    if (resumeHand.isNew && canEditRecipes)
      return newCard(resumeHand.recipeId, resumeHand)
    const i = indexOf(resumeHand.recipeId)
    if (i >= 0) return openCard(i, resumeHand)
    // Not in the box (deleted meanwhile): nothing to take out — but an edit
    // of it isn't lost.
    save(HAND, null)
    const kept = loadDraft()
    if (kept && 'draft' in kept && kept.draft.recipeId === resumeHand.recipeId)
      setLostDraft({ words: draftWords(kept.draft), why: 'gone' })
  }, [pageH, headerH])

  // (The blank card's tap: a new id.)
  const onNew = useCallback(() => newCard(), [newCard])

  const setItemEl = useCallback((i: number, el: HTMLDivElement | null) => {
    itemEls.current[i] = el
  }, [])

  // Only the wanted recipes: the same box as on the cards (its size, its
  // 1.5px outline).
  const wantedOnlyBox = (
    <button
      type="button"
      role="checkbox"
      aria-checked={wantedOnly}
      aria-label="Only wanted recipes"
      onClick={toggleWantedOnly}
      className="-mx-1 grid h-9 w-9 shrink-0 place-items-center"
    >
      <BoxIcon state={wantedOnly ? 'on' : 'off'} />
    </button>
  )
  // Only recipes with the tags chosen (in a tray dropped from the header):
  // a tag, drawn as the heart and the box are.
  const tagsButton = (
    <button
      type="button"
      aria-expanded={tagTray}
      aria-label={
        tagsOn.size ? `Filter by tags (${tagsOn.size} chosen)` : 'Filter by tags'
      }
      onClick={() => setTagTray(!tagTray)}
      className="-mx-1 grid h-9 w-9 shrink-0 place-items-center"
    >
      <TagIcon on={tagsOn.size > 0} />
    </button>
  )
  // Only your favorites: the cards' heart (its size, its 1.5px outline),
  // beside it.
  const favoritesOnlyHeart = (
    <button
      type="button"
      aria-pressed={favoritesOnly}
      aria-label="Only favorites"
      onClick={toggleFavoritesOnly}
      className="-mx-1 grid h-9 w-9 shrink-0 place-items-center"
    >
      <HeartIcon on={favoritesOnly} size={HEART_SIZE} />
    </button>
  )
  const header = (
    // Over the rolodex, casting a shadow onto it (and onto a card sliding
    // up behind it).
    <div
      ref={headerRef}
      className="absolute inset-x-0 top-0 z-[3]"
      style={{ boxShadow: '0 4px 12px -6px color-mix(in srgb, var(--color-shadow) 45%, transparent)' }}
    >
      <TagTray
        open={tagTray}
        onClose={closeTagTray}
        tags={allTags}
        on={tagsOn}
        available={tagsAvailable}
        onToggle={toggleTag}
        onClear={() => chooseTags(new Set())}
      />
      <div className="relative z-[2]">
      <PageHeader
        title="Meals"
        // (New recipes start on the blank card at the front of the box.)
        action={
          <div className="flex items-center gap-1">
            {tagsButton}
            {favoritesOnlyHeart}
            {wantedOnlyBox}
            {/* Settings — your account, and the group's — in the corner. */}
            <Link
              to="/account"
              aria-label="Account"
              // (In the line colour, a 1.5px line: as the heart and the box.)
              className="grid h-9 w-9 place-items-center rounded-full text-line active:bg-on-counter/10"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[21px] w-[21px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={(1.5 * 24) / 21}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
            </Link>
          </div>
        }
      />
      </div>
    </div>
  )

  return (
    <div className="relative h-full">
      <>
        {/* (The room the screen keeps at its foot, to measure.) */}
        <div
          ref={footRef}
          aria-hidden
          className="pointer-events-none invisible absolute"
          style={{ height: 'var(--safe-bottom)' }}
        />
        {/* The rolodex's backdrop, below the header. */}
        <div
          className="absolute inset-x-0 bottom-0 bg-counter-deep"
          style={{ top: headerH }}
        />
        {/* The rolodex layer: the whole page, under the header (a card
              being taken out slides up behind it). Touches go to the drum's
              own iOS-style physics (no native touch scrolling); the wheel and
              trackpad scroll it natively, so they rubber-band the way the
              Mac does. */}
        <div
          ref={scrollRef}
          className="scroll-y no-scrollbar absolute inset-0 z-[2] overflow-x-hidden"
          style={{ touchAction: 'none' }}
        >
          {/* The shopping list's sheet: pinned to the screen (in this layer,
              so a drag on it is the drum's), waiting just below the bottom
              edge, its top peeking over it — slid up as the box is
              scrolled past its end (see paint). Clipped to the screen, so
              what's below doesn't lengthen the scrolling. Over the wheel,
              under the header. */}
          <div
            className="pointer-events-none sticky top-0 z-[1] overflow-clip"
            style={{ height: pageH, marginBottom: -pageH }}
          >
            <div
              ref={listRef}
              className="pointer-events-auto absolute"
              style={{
                top: 0,
                left: SIDE,
                right: SIDE,
                willChange: 'transform',
              }}
            >
              <ListCard canEdit={canEditPlan} />
            </div>
          </div>
          {/* The wheel: pinned while the spacer below scrolls under it. */}
          <div
            className="sticky top-0 overflow-clip"
            style={{
              // Drawn at SCALE from the top centre, filling the page's
              // height; its layout takes up just the page's height.
              height: pageH / SCALE,
              marginBottom: pageH - pageH / SCALE,
              transform: `scale(${SCALE})`,
              transformOrigin: '50% 0',
              perspective: `${PERSPECTIVE}px`,
              perspectiveOrigin: `50% ${headerU + wheel.front}px`,
              // The box in a lighter light: paper 20% toward white (ink and
              // edges as they are). The dividers are the same accent as the
              // meals' pockets.
              ['--color-paper' as string]: 'var(--color-paper-lit)',
            }}
          >
            {items.map((item, i) => (
              <RolodexItem
                key={item.key}
                item={item}
                index={i}
                // (Drawn whole only while it's coming out or going back — not
                // as it's swiped back into the box: drawn as it'll be once
                // it's in, so nothing on it moves when it is.)
                full={open?.key === item.key && returning !== item.key}
                coveredFrom={
                  i + 1 < items.length
                    ? items[i + 1].rod -
                      rodOffset(items[i + 1]) -
                      (item.rod - rodOffset(item))
                    : undefined
                }
                setEl={setItemEl}
                canEditPlan={canEditPlan}
                canEditRecipes={canEditRecipes}
                onOpen={openCard}
                onNew={onNew}
              />
            ))}
          </div>
          {/* The drum's travel, from one stop to the other. */}
          <div style={{ height: bounds.max * SCALE }} />
        </div>
        {header}
      </>

      {open && (
        // (Not keyed by recipe: swiped to the one beside it, it's the same
        // card in hand, showing another recipe.)
        <CardDetail
          recipe={open.recipe}
          origin={open.origin}
          getOrigin={() => homeOf(open.key)}
          getRolodexCard={() => {
            // (None to hand over to if its slot is off screen.)
            const i = indexOf(open.key)
            return i >= 0 && shown.current[i] ? cardEl(i) : undefined
          }}
          canEditRecipes={canEditRecipes}
          canEditPlan={canEditPlan}
          isNew={open.isNew}
          remember
          resume={open.resume}
          step={(() => {
            if (open.isNew) return undefined
            const at = indexOf(open.key)
            const p = besideOf(at, -1)
            const n = besideOf(at, 1)
            const prev = recipeAt(p)
            const next = recipeAt(n)
            // (Two along: with only two cards, that's this one again.)
            const before = recipeAt(besideOf(p, -1))
            const after = recipeAt(besideOf(n, 1))
            return prev && next && before && after
              ? { prev, next, before, after, go: stepCard, preview: previewStep }
              : undefined
          })()}
          onClosed={onClosed}
        />
      )}
      {lostDraft !== null && (
        <ConfirmDialog
          title="Unsaved edit"
          message={
            <>
              An edit you hadn’t saved couldn’t be reopened
              {lostDraft.why === 'gone'
                ? ' (its recipe is gone)'
                : ' after the app was updated'}
              . Here’s what you’d written:
              <textarea
                readOnly
                value={lostDraft.words}
                rows={6}
                className="mt-3 block w-full resize-none rounded border border-paper-edge bg-transparent p-2 text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
            </>
          }
          confirmLabel="Discard"
          onConfirm={() => {
            saveDraft(null)
            setLostDraft(null)
          }}
          cancelLabel="Later"
          onCancel={() => setLostDraft(null)}
          saveLabel="Copy"
          onSave={() => {
            void copyText(lostDraft.words).then((ok) => {
              if (!ok) return
              saveDraft(null)
              setLostDraft(null)
            })
          }}
        />
      )}
    </div>
  )
}

const RolodexItem = memo(function RolodexItem({
  item,
  index,
  full,
  coveredFrom,
  setEl,
  canEditPlan,
  canEditRecipes,
  onOpen,
  onNew,
}: {
  item: Item
  index: number
  /** Drawn whole (taken out); else only as far down as can show. */
  full: boolean
  /** How far down it the item in front of it starts (none for the last). */
  coveredFrom?: number
  setEl: (i: number, el: HTMLDivElement | null) => void
  canEditPlan: boolean
  canEditRecipes: boolean
  onOpen: (i: number) => void
  onNew: () => void
}) {
  const off = rodOffset(item)
  // The shadow of the item in front: the paper darkens toward where that
  // item starts. It belongs to the slot, not the card — taking the card out,
  // it slides up out of the shadow. (On the paper only: a divider's body,
  // not the air beside its tab.)
  const paperTop = item.kind === 'divider' ? TAB_H : 0
  const shadowEnd = coveredFrom === undefined ? 0 : coveredFrom - paperTop
  const shadow =
    shadowEnd > 0 ? (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          top: paperTop,
          borderRadius: '14px 14px 0 0',
          background: `linear-gradient(to bottom, transparent ${shadowEnd - CAST_FADE}px, color-mix(in srgb, var(--color-shadow-cast) ${CAST * 100}%, transparent) ${shadowEnd + CAST_FADE}px)`,
        }}
      />
    ) : null
  // Rides the wheel (transform set per frame), hinged at its rod. Trimmed to
  // the part above the rod — the rest is behind the cards in front — with a
  // margin so its shadow still shows.
  const common = {
    ref: (el: HTMLDivElement | null) => setEl(index, el),
    // Not selectable, no long-press callout: they're handled, not read —
    // take one out to read (and select) it. (On the items, not the whole
    // layer: an unselectable ancestor can break the search field on iOS.)
    className: 'pointer-events-auto absolute top-0 select-none',
    style: {
      left: ITEM_INSET,
      right: ITEM_INSET,
      height: off,
      clipPath: SLOT_CLIP,
      transformOrigin: `50% ${off}px`,
      WebkitTouchCallout: 'none' as const,
      willChange: 'transform',
      visibility: 'hidden' as const, // until the first paint places it
    },
  }

  if (item.kind === 'divider') {
    // (Only its paper takes a tap — not the air beside its tab, which, packed
    // tight, lies over the tabs of the dividers behind it.)
    return (
      <div
        {...common}
        className={common.className.replace(
          'pointer-events-auto',
          'pointer-events-none',
        )}
      >
        <div
          className="paper-card paper-divider rolodex-card pointer-events-auto absolute inset-x-0"
          style={{ top: TAB_H, height: CARD_H }}
        >
          <div className="rolodex-dim" />
        </div>
        {/* The tab reaches 1px into the divider, on top of it, so there's no
            line where they join; its shadow is clipped off at the bottom.
            (The back of the box has no tab.) Just a label: a tap on it does
            nothing (nor goes through it to a card behind). */}
        {item.letter && (
          <div
            className="paper-divider rolodex-card paper-serif pointer-events-auto absolute top-0 grid select-none place-items-center rounded-t-lg border-b-0 text-sm font-bold"
            style={{
              height: TAB_H + 1,
              width: TAB_W,
              left: `${tabLeftFrac(item.n) * 100}%`,
              clipPath: 'inset(-12px -12px 0 -12px)',
            }}
          >
            {item.letter}
            <span className="rolodex-dim" />
          </div>
        )}
        {shadow}
      </div>
    )
  }

  if (item.kind === 'blank') {
    // The blank index card at the front: ruled and framed, waiting for a
    // recipe. (Only there for those who can write recipes.)
    return (
      <div {...common}>
        <div
          role="button"
          tabIndex={0}
          aria-label="Write a new recipe"
          onClick={onNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onNew()
            }
          }}
          className="paper-card rolodex-card relative flex cursor-pointer flex-col"
          style={{ height: CARD_H }}
        >
          <div className="paper-frame" />
          <div className="px-5 pt-3.5">
            <div className="paper-rule font-hand pb-1.5 text-hand-xl leading-[25px] text-ink-faint">
              New recipe…
            </div>
          </div>
          <div className="paper-lines mx-5 mb-2 flex-1" />
          <span className="rolodex-dim" />
        </div>
        {shadow}
      </div>
    )
  }

  return (
    <div {...common}>
      {/* The whole card, at its natural height. */}
      <RecipeCard
        recipe={item.recipe}
        peekHeight={full ? undefined : PEEK_H}
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
      {shadow}
    </div>
  )
})
