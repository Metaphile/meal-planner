import { describe, expect, it } from 'vitest'
import { sectionLabel, sectionsOf, type Recipe } from '../data/types'

describe('sectionLabel', () => {
  it('shows a given title, always', () => {
    expect(sectionLabel('Dough', 1)).toBe('Dough')
    expect(sectionLabel('Dough', 3)).toBe('Dough')
  })
  it('gives a lone untitled section no heading', () => {
    expect(sectionLabel('', 1)).toBeNull()
    expect(sectionLabel('   ', 1)).toBeNull()
  })
  it('calls an untitled section "Section" among others', () => {
    expect(sectionLabel('', 2)).toBe('Section')
  })
})

describe('sectionsOf', () => {
  it('leaves an untitled first section untitled', () => {
    const r: Recipe = { id: 'r', title: 'R', tags: [], ingredients: [] }
    expect(sectionsOf(r)[0].title).toBe('')
    expect(sectionsOf({ ...r, ingredientsTitle: 'Dough' })[0].title).toBe('Dough')
  })
})
