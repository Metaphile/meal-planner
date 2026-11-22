import { describe, expect, it } from 'vitest'
import { addOnText } from '../components/AddOnsList'

describe('addOnText', () => {
  it('is the words as typed, spaces and all', () => {
    expect(addOnText({ name: 'two bags of ice ' })).toBe('two bags of ice ')
  })
  it('folds in an amount and unit kept apart by an older version', () => {
    expect(addOnText({ name: 'Milk', quantity: 2, unit: 'gal' })).toBe(
      'Milk 2 gal',
    )
    expect(addOnText({ name: 'Eggs ', quantity: 12 })).toBe('Eggs 12')
    expect(addOnText({ name: 'Ice', unit: 'bag' })).toBe('Ice bag')
  })
  it('is nothing for an empty one', () => {
    expect(addOnText({ name: '' })).toBe('')
  })
})
