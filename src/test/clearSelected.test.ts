import { describe, expect, it } from 'vitest'
import { cleared } from '../components/ClearSelected'
import { haveKey } from '../data/types'

describe('cleared', () => {
  it('unticks every ticked line, and takes off only ticked add-ons', () => {
    const c = cleared(
      [
        { id: haveKey('Carrot'), amount: 5 },
        { id: haveKey('Salt') },
        { id: haveKey('Leeks'), amount: 2, name: 'Leeks' },
      ],
      [
        { id: 'a', name: 'Milk', position: 0, have: true },
        { id: 'b', name: 'Ice', position: 1 },
      ],
    )
    expect(c.untick).toEqual([haveKey('Carrot'), haveKey('Salt'), haveKey('Leeks')])
    expect(c.remove).toEqual(['a'])
  })
  it('does nothing with nothing ticked', () => {
    expect(cleared([], [{ id: 'b', name: 'Ice', position: 1 }])).toEqual({
      untick: [],
      remove: [],
    })
  })
})
