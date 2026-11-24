import { createContext } from 'react'

/** The tags the box is narrowed to (keys): marked on the cards. */
export const TagsOn = createContext<ReadonlySet<string>>(new Set())

/** A tag as it's matched: its words, whatever their case or spacing. */
export const tagKey = (t: string) => t.trim().toLowerCase()

/** Whether a recipe has every one of the tags (keys) `on`. */
export function hasTags(tags: readonly string[], on: ReadonlySet<string>) {
  if (on.size === 0) return true
  const mine = new Set(tags.map(tagKey))
  for (const t of on) if (!mine.has(t)) return false
  return true
}

/** The tray's drop: its length, and its easing — dropping, and going back
 *  up. */
const TRAY_MOTION = {
  ms: 200,
  down: 'cubic-bezier(0, 0, 0.58, 1)', // (ease-out)
  up: 'cubic-bezier(0.42, 0, 1, 1)', // (ease-in)
}

/** px: the tag icon's size in the header — the star's (STAR_SIZE). */
const SIZE = 20
/** The drawing's bounds, its line included. */
const VIEW = { x: 2.7, y: 2.3, w: 19.6 }

/**
 * A luggage tag, its point to the top left, a hole in its point: drawn as
 * the header's star and box are — a 1.5px line; paper inside, or (some tag
 * chosen) in the star's colours, as the star and the box are when on.
 */
export function TagIcon({ on }: { on: boolean }) {
  return (
    <svg
      // (Fitted to the drawing, line and all, as the star's is.)
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.w}`}
      width={SIZE}
      height={SIZE}
      aria-hidden
      className={`block shrink-0 ${on ? 'text-star-edge' : 'text-line'}`}
    >
      <path
        // (Its point at the top left; its square end at the bottom right.)
        d="M3.5 4.6v6.1c0 .55.22 1.08.61 1.47l8.2 8.2a2 2 0 0 0 2.83 0l5.6-5.6a2 2 0 0 0 0-2.83l-8.2-8.2A2.08 2.08 0 0 0 11.07 3.1H5a1.5 1.5 0 0 0-1.5 1.5Z"
        fill={on ? 'var(--color-star)' : 'var(--color-paper)'}
        stroke="currentColor"
        strokeWidth={(1.5 * VIEW.w) / SIZE}
        strokeLinejoin="round"
      />
      <circle
        cx="8"
        cy="7.6"
        r="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={(1.5 * VIEW.w) / SIZE}
      />
    </svg>
  )
}

/**
 * The tags to narrow the box by, in a tray that drops from under the header:
 * every tag on any recipe, A to Z, each tapped on or off. With more than
 * one on, the box holds the recipes that have every one of them — so a tag
 * no recipe left in the box has is faint, and can't be chosen (it would
 * leave the box empty). Open, the box is still there to turn and take
 * cards from, under it. Put away by its tag in the header (the tags chosen
 * stay on) or by Clear (all of them let go).
 */
export function TagTray({
  open,
  tags,
  on,
  available,
  onToggle,
  onClear,
}: {
  open: boolean
  /** Every tag: its key and how it's written. */
  tags: ReadonlyArray<{ key: string; text: string }>
  on: ReadonlySet<string>
  /** Those that would leave something in the box, chosen too. */
  available: ReadonlySet<string>
  onToggle: (key: string) => void
  onClear: () => void
}) {
  // Drops from behind the header (cut off at its foot: shadow below).
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-full z-[1]"
      style={{ clipPath: 'inset(0 -30px -30px -30px)' }}
    >
      <div
        role="group"
        aria-label="Tags"
        aria-hidden={!open}
        className={`no-scrollbar max-h-[45vh] overflow-y-auto bg-counter px-4 pt-1 pb-3.5 ${
          open
            ? 'pointer-events-auto visible translate-y-0'
            : 'invisible -translate-y-full'
        }`}
        style={{
          transition: `translate ${TRAY_MOTION.ms}ms ${
            open ? TRAY_MOTION.down : TRAY_MOTION.up
          }, visibility ${TRAY_MOTION.ms}ms`,
          boxShadow:
            '0 6px 14px -6px color-mix(in srgb, var(--color-shadow) 45%, transparent)',
        }}
      >
        {tags.length === 0 ? (
          <p className="py-1 font-hand text-hand-sm text-on-counter-soft">
            No tags yet — add some on a card’s back.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map(({ key, text }) => {
              const chosen = on.has(key)
              const can = chosen || available.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={chosen}
                  disabled={!can}
                  onClick={() => onToggle(key)}
                  className={`h-8 rounded-full border-[1.5px] px-3 font-hand text-hand-sm leading-none ${
                    chosen
                      ? 'border-star-edge bg-star text-on-star'
                      : 'border-paper-edge-strong bg-paper text-ink'
                  } ${can ? '' : 'opacity-40'}`}
                >
                  {text}
                </button>
              )
            })}
            {on.size > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="h-8 px-2 font-hand text-hand-sm leading-none text-on-counter-soft underline decoration-1 underline-offset-4"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
