import { describe, expect, it } from 'vitest'
import { parseAmount } from '../components/IngredientsList'

describe('parseAmount', () => {
  it('reads whole numbers, decimals and fractions', () => {
    expect(parseAmount('3')).toBe(3)
    expect(parseAmount('1.5')).toBe(1.5)
    expect(parseAmount('.25')).toBe(0.25)
    expect(parseAmount('1/2')).toBe(0.5)
    expect(parseAmount('1 1/2')).toBe(1.5)
    expect(parseAmount('2 3/4')).toBe(2.75)
    expect(parseAmount('1½')).toBe(1.5)
    expect(parseAmount('¾')).toBe(0.75)
  })

  it("isn't a number yet while half typed, or for nonsense", () => {
    expect(parseAmount('')).toBeUndefined()
    expect(parseAmount('1 1/')).toBeUndefined()
    expect(parseAmount('1/0')).toBeUndefined()
    expect(parseAmount('abc')).toBeUndefined()
  })
})
