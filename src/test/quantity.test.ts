import { describe, expect, it } from 'vitest'
import { asFraction, parseQuantity, quantityText } from '../lib/quantity'

describe('quantityText', () => {
  it('writes common fractions as fractions', () => {
    expect(quantityText(0.5)).toBe('1/2')
    expect(quantityText(0.33)).toBe('1/3')
    expect(quantityText(1 / 3)).toBe('1/3')
    expect(quantityText(0.66)).toBe('2/3')
    expect(quantityText(0.67)).toBe('2/3')
    expect(quantityText(1.5)).toBe('1 1/2')
    expect(quantityText(1.75)).toBe('1 3/4')
    expect(quantityText(0.125)).toBe('1/8')
    expect(quantityText(2.375)).toBe('2 3/8')
  })
  it('rounds what is near a whole number to it', () => {
    expect(quantityText(1.98)).toBe('2')
    expect(quantityText(0.99)).toBe('1')
    expect(quantityText(3)).toBe('3')
    expect(quantityText(0)).toBe('0')
  })
  it('writes anything else as a decimal', () => {
    expect(quantityText(0.4)).toBe('0.4')
    expect(quantityText(0.6)).toBe('0.6')
    expect(quantityText(2.1)).toBe('2.1')
  })
  it('reduces (2/4 is 1/2, 4/8 is 1/2)', () => {
    expect(asFraction(0.5)).toEqual({ whole: 0, num: 1, den: 2 })
    expect(asFraction(0.25)).toEqual({ whole: 0, num: 1, den: 4 })
  })
})

describe('parseQuantity', () => {
  it('reads decimals and fractions', () => {
    expect(parseQuantity('2')).toBe(2)
    expect(parseQuantity('.5')).toBe(0.5)
    expect(parseQuantity('1/3')).toBeCloseTo(1 / 3)
    expect(parseQuantity('1 1/2')).toBe(1.5)
    expect(parseQuantity(' 3 / 4 ')).toBe(0.75)
    expect(parseQuantity('1½')).toBe(1.5)
    expect(parseQuantity('¾')).toBe(0.75)
  })
  it('reads nothing as nothing, and nonsense as NaN', () => {
    expect(parseQuantity('')).toBeUndefined()
    expect(parseQuantity('  ')).toBeUndefined()
    expect(parseQuantity('abc')).toBeNaN()
    expect(parseQuantity('1/0')).toBeNaN()
  })
  it('reads back what it writes', () => {
    for (const n of [0.5, 1 / 3, 1.5, 2.375, 0.4, 3])
      expect(parseQuantity(quantityText(n))).toBeCloseTo(n)
  })
})
