/**
 * The box to tick — on a card (wanted), the shopping list (got), the
 * header's filter — drawn as the hearts and the header's icons are: an SVG
 * line, 1.5px, its middle on the path. (Not a CSS border: on an iPhone's
 * screen, three pixels to a point, a border's 4.5 pixels are rounded to 4,
 * and the box looked lighter than the heart beside it.)
 *
 * Empty: paper, outlined in the line colour. Ticked: in the heart's colours,
 * ✓ in its ink. Short (ticked, but needed more since): danger's, –.
 */
export function BoxIcon({
  state,
  size = 18,
}: {
  state: 'off' | 'on' | 'short'
  size?: number
}) {
  const line = 1.5
  const radius = (4 * size) / 18 // (4px at 18)
  const k = size / 18 // (the tick's drawing is for an 18px box)
  const [fill, edge, mark] =
    state === 'on'
      ? ['var(--color-heart)', 'var(--color-heart-edge)', 'var(--color-on-heart)']
      : state === 'short'
        ? ['var(--color-danger)', 'var(--color-danger)', 'var(--color-on-danger)']
        : ['var(--color-paper)', 'var(--color-line)', '']
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="block shrink-0"
    >
      <rect
        x={line / 2}
        y={line / 2}
        width={size - line}
        height={size - line}
        rx={radius - line / 2}
        style={{ fill, stroke: edge }}
        strokeWidth={line}
      />
      {state !== 'off' && (
        <path
          // (Drawn in a 12px square, set in the middle: as it always was.)
          transform={`translate(${3 * k} ${3 * k}) scale(${k})`}
          d={state === 'short' ? 'M3 6h6' : 'M2.5 6.2 5 8.5l4.5-5'}
          fill="none"
          style={{ stroke: mark }}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
