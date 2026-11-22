import { describe, expect, it } from 'vitest'
import { reconciled } from '../components/Reconcile'
import { haveKey } from '../data/types'

const line = (name: string, quantity?: number, unit?: string) => ({
  name,
  quantity,
  unit,
  sources: ['Some recipe'],
})

describe('reconciled', () => {
  it('takes what each ticked line needs off what is on hand, not below none', () => {
    const r = reconciled(
      [line('Carrot', 3), line('Eggs', 2), line('Flour', 2.25, 'cup')],
      [
        { id: haveKey('Carrot'), amount: 5 },
        { id: haveKey('Eggs'), amount: 1 },
        { id: haveKey('Flour', 'cup'), amount: 2.5 },
      ],
      [],
    )
    expect(r.amounts).toEqual([
      [haveKey('Carrot'), 2],
      [haveKey('Eggs'), 0],
      [haveKey('Flour', 'cup'), 0.25],
    ])
    expect(r.untick).toEqual([])
  })
  it('unticks a ticked line with no amount, and one nothing calls for', () => {
    const r = reconciled(
      [line('Salt'), line('Carrot', 3)],
      [
        { id: haveKey('Salt') },
        { id: haveKey('Leeks'), amount: 2, name: 'Leeks' },
      ],
      [],
    )
    expect(r.untick).toEqual([haveKey('Salt'), haveKey('Leeks')])
    expect(r.amounts).toEqual([])
  })
  it('leaves unticked lines alone, and takes off only ticked add-ons', () => {
    const r = reconciled(
      [line('Carrot', 3)],
      [],
      [
        { id: 'a', name: 'Milk', position: 0, have: true },
        { id: 'b', name: 'Ice', position: 1 },
      ],
    )
    expect(r).toEqual({ untick: [], amounts: [], remove: ['a'] })
  })
})
