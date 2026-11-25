import { describe, expect, it } from 'vitest'
import { addressParts, splitLinks } from './links'

const hrefs = (t: string) =>
  splitLinks(t)
    .filter((p) => p.href)
    .map((p) => p.href)

describe('splitLinks', () => {
  it('keeps every character, in order', () => {
    const t = 'From https://a.com/x?y=1 and www.b.org.\nThen bake.'
    expect(
      splitLinks(t)
        .map((p) => p.text)
        .join(''),
    ).toBe(t)
  })

  it('finds http(s) and www addresses; www goes to https', () => {
    expect(hrefs('see http://a.com, https://b.com/p and www.c.org')).toEqual([
      'http://a.com',
      'https://b.com/p',
      'https://www.c.org',
    ])
  })

  it('leaves off the punctuation after an address', () => {
    expect(hrefs('Recipe: https://a.com/pie. Good!')).toEqual([
      'https://a.com/pie',
    ])
    expect(hrefs('(from https://a.com/pie)')).toEqual(['https://a.com/pie'])
    expect(hrefs('“https://a.com/pie”')).toEqual(['https://a.com/pie'])
  })

  it("keeps a bracket the address opened itself", () => {
    expect(hrefs('https://en.wikipedia.org/wiki/Pie_(dish)')).toEqual([
      'https://en.wikipedia.org/wiki/Pie_(dish)',
    ])
  })

  it('ends at a space or a new line', () => {
    expect(hrefs('https://a.com/x\nnext line')).toEqual(['https://a.com/x'])
  })

  it('needs something after the scheme', () => {
    expect(hrefs('http:// and www. alone')).toEqual([])
  })

  it('no addresses: the text as one piece', () => {
    expect(splitLinks('Boil the potatoes.')).toEqual([
      { text: 'Boil the potatoes.' },
    ])
  })
})

describe('addressParts', () => {
  it('breaks after slashes ("//" kept together)', () => {
    expect(
      addressParts('https://tastesbetterfromscratch.com/classic-french-toast/'),
    ).toEqual([
      'https://',
      'tastesbetterfromscratch.com/',
      'classic-french-toast/',
    ])
  })

  it('and before ?, & and #', () => {
    expect(addressParts('https://a.com/watch?v=1&list=2#t')).toEqual([
      'https://',
      'a.com/',
      'watch',
      '?v=1',
      '&list=2',
      '#t',
    ])
  })

  it('no break points: the whole address', () => {
    expect(addressParts('www.a.com')).toEqual(['www.a.com'])
  })
})
