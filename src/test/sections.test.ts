import { describe, expect, it } from 'vitest'
import { sectionLabels, sectionsOf, type Recipe } from '../data/types'

describe('sectionLabels', () => {
  it('shows a given title, always', () => {
    expect(sectionLabels(['Dough'])).toEqual(['Dough'])
    expect(sectionLabels(['Dough', 'Filling'])).toEqual(['Dough', 'Filling'])
  })
  it('gives a lone untitled section no heading', () => {
    expect(sectionLabels([''])).toEqual([null])
    expect(sectionLabels(['   '])).toEqual([null])
  })
  it('numbers an untitled section among others by its place', () => {
    expect(sectionLabels(['', ''])).toEqual(['Section 1', 'Section 2'])
    expect(sectionLabels(['Dough', '', 'Glaze', ''])).toEqual([
      'Dough',
      'Section 2',
      'Glaze',
      'Section 4',
    ])
  })
})

describe('sectionsOf', () => {
  it('leaves an untitled first section untitled', () => {
    const r: Recipe = { id: 'r', title: 'R', tags: [], ingredients: [] }
    expect(sectionsOf(r)[0].title).toBe('')
    expect(sectionsOf({ ...r, ingredientsTitle: 'Dough' })[0].title).toBe('Dough')
  })
})
