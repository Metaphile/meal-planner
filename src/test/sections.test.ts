import { describe, expect, it } from 'vitest'
import { sectionLabels, sectionsOf, type Recipe } from '../data/types'
import { sectionsFromGroups, type Group } from '../components/RecipeCard'

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

describe('sections as written on the back of a card', () => {
  const g = (
    title: string,
    rows: { name: string; struck?: boolean }[],
    struck?: boolean,
  ): Group => ({ title, rows, struck })

  it('crossing out the first section: the next takes its place', () => {
    expect(
      sectionsFromGroups([
        g('', [], true),
        g('Topping', [{ name: 'Flour' }, { name: '' }]),
      ]),
    ).toEqual({
      ingredients: [{ name: 'Flour' }],
      ingredientsTitle: 'Topping',
      sections: undefined,
    })
  })

  it('crossed-out sections and lines go; empty, untitled sections stay', () => {
    expect(
      sectionsFromGroups([
        g('', [{ name: 'Apples' }, { name: 'Pears', struck: true }]),
        g('Gone', [{ name: 'Oats' }], true),
        g('', []),
      ]),
    ).toEqual({
      ingredients: [{ name: 'Apples' }],
      ingredientsTitle: undefined,
      sections: [{ title: '', ingredients: [] }],
    })
  })

  it('every section crossed out: one first section, with nothing in it', () => {
    expect(
      sectionsFromGroups([g('A', [{ name: 'x' }], true), g('B', [], true)]),
    ).toEqual({ ingredients: [], ingredientsTitle: undefined, sections: undefined })
  })
})
