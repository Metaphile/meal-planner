import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY, load, loadKept, save, clearAll, type Slice } from '../lib/uiState'
import { DRAFT, draftWords, loadDraft, saveDraft, type Draft } from '../lib/draft'

const NUM: Slice<number> = {
  key: 'test-num',
  version: 2,
  maxAgeMs: DAY,
  parse: (x) => (typeof x === 'number' ? x : null),
}

// (The test environment has no localStorage of its own: one in memory.)
const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
})

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('UI state slices', () => {
  it('keeps and reads back a slice', () => {
    save(NUM, 42)
    expect(load(NUM)).toBe(42)
  })

  it('drops a slice kept in another shape (another version of the app)', () => {
    localStorage.setItem(
      'meals:test-num',
      JSON.stringify({ v: 1, at: Date.now(), data: 42 }),
    )
    expect(load(NUM)).toBeNull()
    expect(localStorage.getItem('meals:test-num')).toBeNull()
  })

  it('drops a stale slice', () => {
    vi.useFakeTimers()
    save(NUM, 42)
    vi.advanceTimersByTime(DAY + 1)
    expect(load(NUM)).toBeNull()
  })

  it('drops what it can’t parse, or isn’t JSON at all', () => {
    localStorage.setItem(
      'meals:test-num',
      JSON.stringify({ v: 2, at: Date.now(), data: 'not a number' }),
    )
    expect(load(NUM)).toBeNull()
    localStorage.setItem('meals:test-num', '{oops')
    expect(load(NUM)).toBeNull()
  })

  it('keeps (never drops) what mustn’t be lost, handing back the raw data', () => {
    localStorage.setItem(
      'meals:test-num',
      JSON.stringify({ v: 1, at: Date.now(), data: { old: 'shape' } }),
    )
    expect(loadKept(NUM)).toEqual({ unreadable: { old: 'shape' } })
    expect(localStorage.getItem('meals:test-num')).not.toBeNull()
  })

  it('forgets everything on clearAll, and only its own keys', () => {
    save(NUM, 1)
    localStorage.setItem('someone-else', 'x')
    clearAll()
    expect(load(NUM)).toBeNull()
    expect(localStorage.getItem('someone-else')).toBe('x')
  })
})

describe('unsaved edits', () => {
  const draft: Draft = {
    recipeId: 'r1',
    isNew: false,
    base: { title: 'Soup', ingredients: [], tags: [] },
    title: 'Soup, better',
    tagsText: 'dinner',
    notes: 'Simmer.',
    groups: [
      {
        title: '',
        rows: [
          { name: 'Leek', quantity: 2 },
          { name: 'Stock', quantity: 1, unit: 'l', struck: true },
        ],
      },
      { title: 'Topping', struck: true, rows: [{ name: 'Croutons' }] },
    ],
  }

  it('round-trips, crossed-out lines and sections included', () => {
    saveDraft(draft)
    const kept = loadDraft()
    expect(kept && 'draft' in kept && kept.draft).toEqual(draft)
  })

  it('takes what it can from a draft with missing or odd fields', () => {
    const parsed = DRAFT.parse({
      recipeId: 'r1',
      groups: [{ rows: [{ name: 'Salt', quantity: 'lots' }, 'junk'] }],
    })
    expect(parsed?.groups[0].rows).toEqual([
      { name: 'Salt', quantity: undefined, unit: undefined, struck: undefined },
    ])
    expect(parsed?.title).toBe('')
    expect(DRAFT.parse({ groups: [] })).toBeNull()
  })

  it('an edit kept by another version is kept, its words offered', () => {
    localStorage.setItem(
      'meals:draft',
      JSON.stringify({
        v: 99,
        at: Date.now(),
        data: {
          recipeId: 'r1',
          heading: 'Soup',
          lines: [{ name: 'Leek', quantity: 2, unit: 'pc' }],
          base: { title: 'What it said before' },
        },
      }),
    )
    expect(loadDraft()).toEqual({ unreadable: 'Soup\n2 pc Leek' })
  })

  it('words of a draft: lines with their amounts, not ids or what it said before', () => {
    expect(draftWords(draft)).toBe(
      'Soup, better\ndinner\nSimmer.\n2 Leek\n1 l Stock\nTopping\nCroutons',
    )
  })
})
