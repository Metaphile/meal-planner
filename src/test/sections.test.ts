import { describe, expect, it } from 'vitest'
import { sectionLabels, sectionsOf, type Recipe } from '../data/types'
import { sectionsFromGroups, type Group } from '../components/RecipeCard'

describe('sectionLabels', () => {
  it('shows a given title, always', () => {
    expect(sectionLabels(['Dough'])).toEqual(['Dough'])
    expect(sectionLabels(['Dough', 'Filling'])).toEqual(['Dough', 'Filling'])
  })
  it('gives an untitled section no heading — alone or among others', () => {
    expect(sectionLabels([''])).toEqual([null])
    expect(sectionLabels(['   '])).toEqual([null])
    expect(sectionLabels(['', ''])).toEqual([null, null])
    expect(sectionLabels(['Dough', '', 'Glaze', ''])).toEqual([
      'Dough',
      null,
      'Glaze',
      null,
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
    rows: { name: string; quantity?: number; unit?: string; struck?: boolean }[],
    struck?: boolean,
  ): Group => ({ title, rows, struck })

  it('keeps a line with any part of it written — only a blank one goes', () => {
    expect(
      sectionsFromGroups([
        g('', [
          { name: '', unit: 'cup' },
          { name: '', quantity: 2 },
          { name: '  Salt  ' },
          { name: '   ' },
          { name: '' },
        ]),
      ]).ingredients,
    ).toEqual([
      { name: '', unit: 'cup' },
      { name: '', quantity: 2 },
      { name: 'Salt' },
    ])
  })

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

  it('a section made in this edit, untitled, its only line crossed out: not saved', () => {
    const fresh = { ...g('', [{ name: 'Basil', struck: true }, { name: '' }]), fresh: true }
    expect(sectionsFromGroups([g('', [{ name: 'Bread' }]), fresh])).toEqual({
      ingredients: [{ name: 'Bread' }],
      ingredientsTitle: undefined,
      sections: undefined,
    })
    // (Titled, it's kept — empty or not. Saved before, it's kept too.)
    expect(
      sectionsFromGroups([g('', [{ name: 'Bread' }]), { ...fresh, title: 'Herbs' }])
        .sections,
    ).toEqual([{ title: 'Herbs', ingredients: [] }])
    expect(
      sectionsFromGroups([g('', [{ name: 'Bread' }]), { ...fresh, fresh: undefined }])
        .sections,
    ).toEqual([{ title: '', ingredients: [] }])
  })

  it('every section crossed out: one first section, with nothing in it', () => {
    expect(
      sectionsFromGroups([g('A', [{ name: 'x' }], true), g('B', [], true)]),
    ).toEqual({ ingredients: [], ingredientsTitle: undefined, sections: undefined })
  })
})
