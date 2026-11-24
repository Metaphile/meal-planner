import { describe, expect, it } from 'vitest'
import { hasTags, tagKey } from '../components/TagFilter'

describe('filtering by tags', () => {
  it('matches a tag whatever its case or spacing', () => {
    expect(tagKey(' Kid-Friendly ')).toBe('kid-friendly')
    expect(hasTags(['Dinner ', 'soup'], new Set(['dinner']))).toBe(true)
  })
  it('needs every tag chosen', () => {
    const on = new Set(['dinner', 'italian'])
    expect(hasTags(['dinner', 'italian', 'make-ahead'], on)).toBe(true)
    expect(hasTags(['dinner', 'soup'], on)).toBe(false)
  })
  it('lets everything through with none chosen', () => {
    expect(hasTags([], new Set())).toBe(true)
  })
})
