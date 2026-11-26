import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../data/persistence', async (orig) => ({
  ...(await orig<typeof import('../data/persistence')>()),
  enqueuePut: () => {},
  enqueueDelete: () => {},
}))
const { useStore } = await import('../store/store')
const { isWanted } = await import('../data/types')

const count = (id: string) => {
  const w = useStore.getState().wants.find((w) => w.recipeId === id)
  return w && isWanted(w) ? w.count : 0
}

beforeEach(() => useStore.setState({ wants: [] }))

describe('wanting a recipe', () => {
  it('starts at ×1, and again at ×1 after not wanting it', () => {
    const { setWanted, setWantCount } = useStore.getState()
    setWanted('r', true)
    expect(count('r')).toBe(1)
    setWantCount('r', 3)
    expect(count('r')).toBe(3)
    setWanted('r', false)
    expect(count('r')).toBe(0)
    setWanted('r', true)
    expect(count('r')).toBe(1)
  })

  it('at a count asked for (stepping up from ×0: ×1)', () => {
    useStore.getState().setWanted('r', true, 2)
    expect(count('r')).toBe(2)
  })

  it('wanted already, wanting it again keeps its count', () => {
    const { setWanted, setWantCount } = useStore.getState()
    setWanted('r', true)
    setWantCount('r', 4)
    setWanted('r', true)
    expect(count('r')).toBe(4)
  })
})
