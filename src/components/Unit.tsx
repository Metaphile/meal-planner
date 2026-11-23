import { asFraction, quantityText } from '../lib/quantity'

/**
 * A unit as it's shown everywhere but the unit picker: cut short with "…"
 * when it's long ("tbsp heaping"), so it doesn't crowd the line. (In ems,
 * so it's the same few letters in any writing; "bunch" and "pinch" fit.)
 * The whole unit is kept for screen readers and on hover.
 */
export function Unit({ children }: { children?: string }) {
  if (!children) return null
  return (
    <span
      title={children}
      // (A little room inside the clip: handwriting reaches past its width.)
      className="-mr-[0.15em] inline-block max-w-[3.75em] truncate pr-[0.15em] align-bottom"
    >
      {children}
    </span>
  )
}

/** A quantity, typeset as a recipe reads it: "1½", "⅓", "2", "0.4" (see
 *  quantity.ts) — its fraction drawn by the writing's own fraction figures
 *  (`.frac`), sitting on the line with the rest. */
export function Qty({ n }: { n: number }) {
  const f = asFraction(n)
  if (!f) return <>{quantityText(n)}</>
  if (!f.num) return <>{f.whole}</>
  return (
    <>
      {f.whole > 0 && f.whole}
      <span className="frac">{`${f.num}/${f.den}`}</span>
    </>
  )
}

/** "2 cup", "cup", or "2": an amount with its unit (cut short if long). */
export function Amount({ quantity, unit }: { quantity?: number; unit?: string }) {
  return (
    <>
      {quantity !== undefined && <Qty n={quantity} />}
      {quantity !== undefined && unit && ' '}
      <Unit>{unit}</Unit>
    </>
  )
}
