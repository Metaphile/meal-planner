/**
 * Quantities as a recipe reads them: in fractions — ½, ⅓, ¾, ⅛ — not
 * decimals. A quantity that's near enough a whole number and a common
 * fraction (halves, thirds, quarters, eighths) is shown as one: 0.33 is
 * ⅓, 1.5 is 1½, 0.66 × 3 = 1.98 is 2. Anything else, as a decimal (0.4).
 */

/** The fractions a recipe uses, by denominator. */
const DENOMINATORS = [2, 3, 4, 8]
/** How near a quantity must be to read as a fraction (0.33 is ⅓; 0.3,
 *  0.6 aren't anything). */
const NEAR = 0.02

export interface Fraction {
  whole: number
  /** 0: none (a whole number). */
  num: number
  den: number
}

/** `n` as a whole number and a common fraction, if it's near enough one. */
export function asFraction(n: number): Fraction | null {
  if (!Number.isFinite(n) || n < 0) return null
  let whole = Math.floor(n)
  const part = n - whole
  let best: { num: number; den: number; off: number } | null = null
  for (const den of DENOMINATORS) {
    const num = Math.round(part * den)
    const off = Math.abs(part - num / den)
    // (A hair's allowance: in floating point, 1.98 is 0.0200…02 short of 2.)
    if (off <= NEAR + 1e-9 && (!best || off < best.off - 1e-9))
      best = { num, den, off }
  }
  if (!best) return null
  if (best.num === 0) return { whole, num: 0, den: 1 }
  if (best.num === best.den) return { whole: whole + 1, num: 0, den: 1 }
  const g = gcd(best.num, best.den)
  whole = Math.max(0, whole)
  return { whole, num: best.num / g, den: best.den / g }
}

/** A decimal, to two places at most ("0.4", "2.25"). */
const decimal = (n: number) => String(Math.round(n * 100) / 100)

/** `n` written out plainly: "1 1/2", "1/3", "2", "0.4". (Where it can't
 *  be typeset: a field, a label.) */
export function quantityText(n: number): string {
  const f = asFraction(n)
  if (!f) return decimal(n)
  if (!f.num) return String(f.whole)
  return `${f.whole ? `${f.whole} ` : ''}${f.num}/${f.den}`
}

/** What's typed as a quantity: "2", "0.5", ".5", "1/3", "1 1/2", "1½".
 *  (Nothing: undefined. Not a number: NaN.) */
export function parseQuantity(text: string): number | undefined {
  const t = text
    .trim()
    .replace(/½/g, ' 1/2')
    .replace(/¼/g, ' 1/4')
    .replace(/¾/g, ' 3/4')
    .trim()
  if (t === '') return undefined
  const m = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(t)
  if (m) {
    const den = Number(m[3])
    if (!den) return NaN
    return (m[1] ? Number(m[1]) : 0) + Number(m[2]) / den
  }
  return Number(t)
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}
