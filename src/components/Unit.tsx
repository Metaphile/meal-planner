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
      className="inline-block max-w-[3.6em] truncate align-bottom"
    >
      {children}
    </span>
  )
}

/** "2 cup", "cup", or "2": an amount with its unit (cut short if long). */
export function Amount({ quantity, unit }: { quantity?: number; unit?: string }) {
  return (
    <>
      {quantity !== undefined && quantity}
      {quantity !== undefined && unit && ' '}
      <Unit>{unit}</Unit>
    </>
  )
}
