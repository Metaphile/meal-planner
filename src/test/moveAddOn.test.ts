import { beforeEach, describe, expect, it, vi } from 'vitest'

const puts: Array<{ id: string; position: number }> = []
vi.mock('../data/persistence', async (orig) => ({
  ...(await orig<typeof import('../data/persistence')>()),
  enqueuePut: (_: string, row: { id: string; position: number }) => puts.push(row),
  enqueueDelete: () => {},
}))
const { useStore } = await import('../store/store')

const names = () => useStore.getState().addons.map((a) => a.name)
const id = (name: string) => useStore.getState().addons.find((a) => a.name === name)!.id

beforeEach(() => {
  puts.length = 0
  useStore.setState({
    addons: ['a', 'b', 'c', 'd'].map((name, position) => ({ id: name.toUpperCase(), name, position })),
  })
})

describe('moving an add-on', () => {
  it('goes just before another, up or down', () => {
    useStore.getState().moveAddOn(id('d'), id('b'))
    expect(names()).toEqual(['a', 'd', 'b', 'c'])
    useStore.getState().moveAddOn(id('a'), id('c'))
    expect(names()).toEqual(['d', 'b', 'a', 'c'])
    expect(puts.map((p) => p.id)).toEqual(['D', 'A']) // (only the one moved)
  })

  it('goes first, or last', () => {
    useStore.getState().moveAddOn(id('c'), id('a'))
    expect(names()).toEqual(['c', 'a', 'b', 'd'])
    useStore.getState().moveAddOn(id('a'))
    expect(names()).toEqual(['c', 'b', 'd', 'a'])
  })

  it('renumbers them all once moves have halved the gap too far', () => {
    for (let k = 0; k < 60; k++) {
      useStore.getState().moveAddOn(id(k % 2 ? 'c' : 'd'), id('b'))
    }
    expect(names()).toEqual(['a', 'd', 'c', 'b'])
    const ps = useStore.getState().addons.map((a) => a.position)
    expect(new Set(ps).size).toBe(4)
  })
})
