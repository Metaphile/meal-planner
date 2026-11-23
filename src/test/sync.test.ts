import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientResponseError } from 'pocketbase'

/**
 * The sync layer against a fake PocketBase (unique keys, batches applied
 * all or nothing, can go offline or refuse a collection) and an in-memory
 * stand-in for IndexedDB.
 */

type Rec = { id: string; key: string; data: unknown; user?: string }

class FakeServer {
  tables = new Map<string, Map<string, Rec>>()
  offline = false
  refuse = new Set<string>()
  /** Pulls wait for this (set to hold them). */
  hold: Promise<void> | null = null
  batches = 0
  pulls = 0
  listeners = new Map<string, () => void>()
  private n = 0
  table(c: string) {
    if (!this.tables.has(c)) this.tables.set(c, new Map())
    return this.tables.get(c)!
  }
  byKey(c: string, key: string) {
    return [...this.table(c).values()].filter((r) => r.key === key)
  }
  fail(status: number) {
    return new ClientResponseError({ status, response: {} })
  }
  check(c: string) {
    if (this.offline) throw this.fail(0)
    if (this.refuse.has(c)) throw this.fail(403)
  }
  create(c: string, body: { key: string; data: unknown; user?: string }) {
    this.check(c)
    if (this.byKey(c, body.key).length) throw this.fail(400) // unique key
    const rec = { id: `r${++this.n}`, ...body }
    this.table(c).set(rec.id, rec)
    return rec
  }
  update(c: string, id: string, body: { key: string; data: unknown }) {
    this.check(c)
    const rec = this.table(c).get(id)
    if (!rec) throw this.fail(404)
    Object.assign(rec, body)
    return rec
  }
  delete(c: string, id: string) {
    this.check(c)
    if (!this.table(c).delete(id)) throw this.fail(404)
  }
  changed() {
    for (const l of this.listeners.values()) l()
  }
  /** The client the sync layer talks to. */
  client() {
    const server = this
    const collection = (c: string) => ({
      async getFullList() {
        if (server.offline) throw server.fail(0)
        server.pulls++
        const rows = [...server.table(c).values()].map((r) => ({ ...r }))
        if (server.hold) await server.hold
        return rows
      },
      async getFirstListItem(filter: string) {
        if (server.offline) throw server.fail(0)
        const key = /key = '(.*)'/.exec(filter)![1]
        const rec = server.byKey(c, key)[0]
        if (!rec) throw server.fail(404)
        return { ...rec }
      },
      async create(body: { key: string; data: unknown }) {
        const r = server.create(c, body)
        server.changed()
        return r
      },
      async update(id: string, body: { key: string; data: unknown }) {
        const r = server.update(c, id, body)
        server.changed()
        return r
      },
      async delete(id: string) {
        server.delete(c, id)
        server.changed()
        return true
      },
      async subscribe(_t: string, fn: () => void) {
        server.listeners.set(c, fn)
        return () => server.listeners.delete(c)
      },
    })
    return {
      collection,
      filter: (raw: string, params: Record<string, string>) =>
        raw.replace('{:key}', `'${params.key}'`),
      authStore: { record: { id: 'me', role: 'writer' } },
      createBatch() {
        const ops: Array<(s: FakeServer) => unknown> = []
        return {
          collection: (c: string) => ({
            create: (b: { key: string; data: unknown }) =>
              ops.push((s) => s.create(c, b)),
            update: (id: string, b: { key: string; data: unknown }) =>
              ops.push((s) => s.update(c, id, b)),
            delete: (id: string) => ops.push((s) => s.delete(c, id)),
          }),
          async send() {
            if (server.offline) throw server.fail(0)
            server.batches++
            // All or nothing: try it on a copy.
            const before = new Map(
              [...server.tables].map(([k, t]) => [
                k,
                new Map([...t].map(([i, r]) => [i, { ...r }])),
              ]),
            )
            try {
              const out = ops.map((op) => ({ status: 200, body: op(server) }))
              server.changed()
              return out
            } catch (e) {
              server.tables = before
              throw server.fail((e as ClientResponseError).status || 400)
            }
          },
        }
      },
    }
  }
}

/** IndexedDB, in memory: just what the sync layer uses. */
function fakeDb() {
  const table = () => {
    const rows = new Map<string, unknown>()
    return {
      rows,
      async toArray() {
        return [...rows.values()]
      },
      async put(item: { id: string }) {
        rows.set(item.id, item)
      },
      async delete(id: string) {
        rows.delete(id)
      },
      async clear() {
        rows.clear()
      },
      async bulkPut(items: { id: string }[]) {
        for (const i of items) rows.set(i.id, i)
      },
    }
  }
  let next = 0
  const outbox: Array<Record<string, unknown> & { id: number }> = []
  return {
    recipes: table(),
    plan: table(),
    wants: table(),
    addons: table(),
    haves: table(),
    favorites: table(),
    people: table(),
    outbox: {
      rows: outbox,
      async add(row: Record<string, unknown>) {
        outbox.push({ ...row, id: ++next })
      },
      orderBy: () => ({ toArray: async () => [...outbox] }),
      where: () => ({
        belowOrEqual: (n: number) => ({
          delete: async () => {
            for (let i = outbox.length - 1; i >= 0; i--)
              if (outbox[i].id <= n) outbox.splice(i, 1)
          },
        }),
      }),
      async count() {
        return outbox.length
      },
    },
    async transaction(_m: string, _t: unknown, fn: () => Promise<void>) {
      await fn()
    },
  }
}

let server: FakeServer
let db: ReturnType<typeof fakeDb>
let sync: typeof import('../data/persistence')

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  server = new FakeServer()
  // (Not an empty group: the first writer of one seeds it with recipes.)
  server.create('recipes', {
    key: 'kept',
    data: { id: 'kept', title: 'Kept', tags: [], ingredients: [] },
  })
  db = fakeDb()
  vi.doMock('../auth/pb', () => ({ pb: server.client() }))
  vi.doMock('../data/db', () => ({ db }))
  sync = await import('../data/persistence')
})
afterEach(() => {
  sync.stopSync()
  vi.useRealTimers()
  vi.doUnmock('../auth/pb')
  vi.doUnmock('../data/db')
})

const have = (id: string, amount?: number) => ({ id, amount })
/** Let queued work (timers, promises) run. */
const settle = async (ms = 2000) => {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(ms / 10)
}
const onServer = (c: string) =>
  [...server.table(c).values()].map((r) => r.data)

describe('sending writes', () => {
  it('sends a burst of writes as one batch', async () => {
    await sync.startSync(() => {})
    for (const k of ['a', 'b', 'c', 'd']) sync.enqueuePut('haves', have(k))
    await settle()
    expect(server.batches).toBe(1)
    expect(onServer('haves')).toHaveLength(4)
    expect(db.outbox.rows).toHaveLength(0)
    // …and knows what it made: clearing them is one more batch.
    for (const k of ['a', 'b', 'c', 'd']) sync.enqueueDelete('haves', k)
    await settle()
    expect(server.batches).toBe(2)
    expect(onServer('haves')).toHaveLength(0)
  })

  it('updates (not duplicates) a record it lost track of', async () => {
    await sync.startSync(() => {})
    // Another device makes it after this one's last pull.
    server.create('haves', { key: 'a', data: have('a', 1) })
    sync.enqueuePut('haves', have('a', 2))
    await settle()
    expect(server.byKey('haves', 'a')).toHaveLength(1)
    expect(onServer('haves')).toEqual([have('a', 2)])
    expect(db.outbox.rows).toHaveLength(0)
  })

  it('deletes a record it lost track of', async () => {
    await sync.startSync(() => {})
    server.create('haves', { key: 'a', data: have('a') })
    sync.enqueueDelete('haves', 'a')
    await settle()
    expect(onServer('haves')).toHaveLength(0)
  })

  it('drops a change the server refuses, and sends the rest', async () => {
    await sync.startSync(() => {})
    server.refuse.add('recipes')
    sync.enqueuePut('recipes', { id: 'x' } as never)
    sync.enqueuePut('haves', have('a'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await settle()
    expect(onServer('haves')).toEqual([have('a')])
    expect(server.byKey('recipes', 'x')).toHaveLength(0)
    expect(db.outbox.rows).toHaveLength(0) // not stuck
    expect(warn).toHaveBeenCalled()
  })

  it('keeps writes offline, and sends them once it can', async () => {
    await sync.startSync(() => {})
    server.offline = true
    sync.enqueuePut('haves', have('a'))
    await settle(3000)
    expect(db.outbox.rows).toHaveLength(1)
    server.offline = false
    await settle(10000) // (retried after a pause)
    expect(onServer('haves')).toEqual([have('a')])
    expect(db.outbox.rows).toHaveLength(0)
  })
})

describe('pulling', () => {
  it('pulls once for a burst of changes', async () => {
    await sync.startSync(() => {})
    const before = server.pulls
    for (let i = 0; i < 5; i++) server.changed()
    await settle()
    // (A pull is one fetch per collection: 7.)
    expect(server.pulls - before).toBe(7)
  })

  it("doesn't use a pull that started before a write landed", async () => {
    const seen: string[][] = []
    await sync.startSync((d) => seen.push(d.haves.map((h) => h.id)))
    server.create('haves', { key: 'a', data: have('a') })
    seen.length = 0
    // A pull starts, and is slow; meanwhile, 'a' is unticked here and sent.
    let release!: () => void
    server.hold = new Promise((r) => (release = r))
    server.changed()
    await settle(500)
    sync.enqueueDelete('haves', 'a')
    await settle(500)
    server.hold = null
    release()
    await settle()
    // Never shown ticked again.
    expect(seen.every((ids) => !ids.includes('a'))).toBe(true)
    expect(seen.at(-1)).toEqual([])
  })
})
