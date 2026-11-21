import { describe, expect, it } from 'vitest'
import { parseAmount } from '../components/IngredientsList'

describe('parseAmount', () => {
  it('reads plain, non-negative decimals', () => {
    expect(parseAmount('3')).toBe(3)
    expect(parseAmount('1.5')).toBe(1.5)
    expect(parseAmount('.25')).toBe(0.25)
    expect(parseAmount('3.')).toBe(3)
    expect(parseAmount(' 2 ')).toBe(2)
  })

  it('takes an empty field as 0', () => {
    expect(parseAmount('')).toBe(0)
  })

  it("doesn't take anything else", () => {
    for (const t of ['-1', '1/2', '1 1/2', '½', '1.2.3', '.', 'abc', '1e3'])
      expect(parseAmount(t)).toBeUndefined()
  })
})
