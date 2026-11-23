import { db, type OutboxRow, type TableName } from './db'
import type {
  AddOn,
  Dataset,
  Favorite,
  Have,
  PlanMeal,
  Recipe,
  Want,
} from './types'
import { seedData } from './seed'
import { tidyRecipe } from './types'
import { ClientResponseError } from 'pocketbase'
import { pb } from '../auth/pb'

/**
 * Sync layer. PocketBase is authoritative for recipes/plan; IndexedDB is a
 * local cache (instant boot + offline reads); the in-memory store stays the UI
 * source of truth. Every mutation updates the cache immediately and is queued
 * in a durable outbox until it reaches PocketBase, so nothing is lost offline.
 *
 * - Writes go out together: what's queued is sent as one batch (applied all
 *   or nothing), retried after a pause if it can't be.
 * - What's on the server comes back by pulling all of it — on any change,
 *   but one pull at a time (a burst of changes is one pull), and a pull is
 *   only used if nothing was written meanwhile: one that started before a
 *   write reached the server would show it undone. (Then it pulls again.)
 */

/** Bumps on every local write, and as writes are sent: a pull that saw it
 *  change is out of date. */
let epoch = 0

// ---- local cache (IndexedDB) ----------------------------------------------

export async function hydrate(): Promise<Dataset> {
  const [recipes, plan, wants, addons, haves, favorites, people] =
    await Promise.all([
      db.recipes.toArray(),
      db.plan.toArray(),
      db.wants.toArray(),
      db.addons.toArray(),
      db.haves.toArray(),
      db.favorites.toArray(),
      db.people.toArray(),
    ])
  // (Read as this version writes them: see tidyRecipe.)
  return {
    recipes: recipes.map(tidyRecipe),
    plan,
    wants,
    addons,
    haves,
    favorites,
    people,
  }
}

async function cacheReplaceAll(data: Dataset): Promise<void> {
  const tables = [
    db.recipes,
    db.plan,
    db.wants,
    db.addons,
    db.haves,
    db.favorites,
    db.people,
  ]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await Promise.all([
      db.recipes.bulkPut(data.recipes),
      db.plan.bulkPut(data.plan),
      db.wants.bulkPut(data.wants),
      db.addons.bulkPut(data.addons),
      db.haves.bulkPut(data.haves),
      db.favorites.bulkPut(data.favorites),
      db.people.bulkPut(data.people),
    ])
  })
}

// ---- remote (PocketBase) ---------------------------------------------------

// Maps our app-level id ("key") to the PocketBase record id: taken from a
// pull that's used (see runPull), and kept up to date as writes are sent.
const idMap = new Map<string, string>()
const mapKey = (c: TableName, k: string) => `${c}:${k}`

/** Everything on the server, and its records' ids by key (for idMap). */
async function remotePull(): Promise<{ data: Dataset; ids: Map<string, string> }> {
  const [recs, plans, wantRecs, addonRecs, haveRecs, favRecs, userRecs] =
    await Promise.all([
    pb.collection('recipes').getFullList({ requestKey: null }),
    pb.collection('plan').getFullList({ requestKey: null }),
    pb.collection('wants').getFullList({ requestKey: null }),
    pb.collection('addons').getFullList({ requestKey: null }),
    pb.collection('haves').getFullList({ requestKey: null }),
    pb.collection('favorites').getFullList({ requestKey: null }),
    pb
      .collection('users')
      .getFullList({ fields: 'id,name', requestKey: null }),
  ])
  const idMap = new Map<string, string>()
  const recipes = recs.map((r) => {
    idMap.set(mapKey('recipes', r.key), r.id)
    return tidyRecipe(r.data as Recipe)
  })
  const plan = plans.map((p) => {
    idMap.set(mapKey('plan', p.key), p.id)
    return p.data as PlanMeal
  })
  const wants = wantRecs.map((w) => {
    idMap.set(mapKey('wants', w.key), w.id)
    return w.data as Want
  })
  const addons = addonRecs.map((a) => {
    idMap.set(mapKey('addons', a.key), a.id)
    return a.data as AddOn
  })
  const haves = haveRecs.map((h) => {
    idMap.set(mapKey('haves', h.key), h.id)
    return h.data as Have
  })
  const favorites = favRecs.map((f) => {
    idMap.set(mapKey('favorites', f.key), f.id)
    return f.data as Favorite
  })
  const people = userRecs.map((u) => ({
    id: u.id,
    name: typeof u.name === 'string' ? u.name : '',
  }))
  return {
    data: { recipes, plan, wants, addons, haves, favorites, people },
    ids: idMap,
  }
}

function commitIds(ids: Map<string, string>): void {
  idMap.clear()
  for (const [k, v] of ids) idMap.set(k, v)
}

// ---- outbox (durable offline write queue) ----------------------------------

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
/** Writes that couldn't be sent wait longer each time (to a point). */
let retryMs = 0
const RETRY_MIN = 1000
const RETRY_MAX = 30000
/** The most writes in one batch (the server's limit). */
const BATCH_MAX = 50

function scheduleFlush(delay = 150): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushOutbox()
  }, delay)
}

/** Not sent for want of a connection (or the server — down, or busy): to
 *  try again. */
const offline = (e: unknown) =>
  !(e instanceof ClientResponseError) ||
  e.status === 0 ||
  e.status === 429 ||
  e.status >= 500

/** The record's id on the server, if it's there — from idMap, or (idMap
 *  having lost it) looked up by key. */
async function remoteId(op: OutboxRow): Promise<string | undefined> {
  const known = idMap.get(mapKey(op.collection, op.key))
  if (known) return known
  try {
    const rec = await pb
      .collection(op.collection)
      .getFirstListItem(pb.filter('key = {:key}', { key: op.key }), {
        requestKey: null,
      })
    idMap.set(mapKey(op.collection, op.key), rec.id)
    return rec.id
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) return undefined
    throw e
  }
}

/** Send `ops` as one batch (all or nothing). Throws if it isn't applied.
 *  (A delete of what idMap doesn't know goes by itself: see sendOne.) */
async function sendBatch(ops: OutboxRow[]): Promise<void> {
  const batch = pb.createBatch()
  const sent: { op: OutboxRow; made: boolean }[] = []
  const alone: OutboxRow[] = []
  for (const op of ops) {
    const records = batch.collection(op.collection)
    const id = idMap.get(mapKey(op.collection, op.key))
    if (op.op === 'delete') {
      if (!id) alone.push(op)
      else {
        records.delete(id)
        sent.push({ op, made: false })
      }
    } else if (id) {
      records.update(id, { key: op.key, data: op.data })
      sent.push({ op, made: false })
    } else {
      // (A favorite is created as the signed-in person's own.)
      const owner =
        op.collection === 'favorites' ? { user: pb.authStore.record?.id } : {}
      records.create({ key: op.key, data: op.data, ...owner })
      sent.push({ op, made: true })
    }
  }
  if (sent.length) {
    const results = await batch.send({ requestKey: null })
    sent.forEach(({ op, made }, i) => {
      const k = mapKey(op.collection, op.key)
      if (op.op === 'delete') idMap.delete(k)
      else if (made) {
        const id = (results[i] as { body?: { id?: string } } | undefined)?.body?.id
        if (id) idMap.set(k, id)
      }
    })
  }
  for (const op of alone) await sendOne(op)
}

/** Send one op, mending what can be mended: a record idMap lost track of is
 *  found by its key; one gone from the server is made again (or, deleted,
 *  is done). One the server refuses (not allowed, not valid) is dropped —
 *  it would never go, and would hold up everything after it. Throws only
 *  for want of a connection. */
async function sendOne(op: OutboxRow): Promise<void> {
  try {
    const id = await remoteId(op)
    const records = pb.collection(op.collection)
    if (op.op === 'delete') {
      if (id) await records.delete(id, { requestKey: null })
      idMap.delete(mapKey(op.collection, op.key))
      return
    }
    if (id) {
      try {
        await records.update(id, { key: op.key, data: op.data }, { requestKey: null })
        return
      } catch (e) {
        if (!(e instanceof ClientResponseError) || e.status !== 404) throw e
        idMap.delete(mapKey(op.collection, op.key)) // gone: made again, below
      }
    }
    const owner =
      op.collection === 'favorites' ? { user: pb.authStore.record?.id } : {}
    const rec = await records.create(
      { key: op.key, data: op.data, ...owner },
      { requestKey: null },
    )
    idMap.set(mapKey(op.collection, op.key), rec.id)
  } catch (e) {
    if (offline(e)) throw e
    if (e instanceof ClientResponseError && e.status === 404 && op.op === 'delete') return
    console.warn('A change the server refused was dropped:', op, e)
  }
}

async function flushOutbox(): Promise<void> {
  if (flushing) return
  flushing = true
  let more = false
  let failed = false
  try {
    const rows = await db.outbox.orderBy('id').toArray()
    if (rows.length === 0) return
    // Collapse to the latest op per key so a create+update offline becomes one
    // write (and we never create the same key twice).
    const latest = new Map<string, OutboxRow>()
    for (const r of rows) latest.set(mapKey(r.collection, r.key), r)
    const ops = [...latest.values()]
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
      const chunk = ops.slice(i, i + BATCH_MAX)
      // (A pull under way can't know how these land: it's out of date.)
      epoch++
      try {
        await sendBatch(chunk)
      } catch (e) {
        if (offline(e)) throw e
        // One of them refused: the batch is undone. One by one, then — the
        // ones that can go, go.
        for (const op of chunk) await sendOne(op)
      } finally {
        epoch++
      }
    }
    // Only what was sent: writes queued meanwhile wait for the next round.
    const sentUpTo = rows[rows.length - 1].id!
    await db.outbox.where('id').belowOrEqual(sentUpTo).delete()
    more = (await db.outbox.count()) > 0
    retryMs = 0
  } catch {
    // Offline, or the server's down: keep the outbox, and try again later.
    failed = true
  } finally {
    flushing = false
  }
  if (failed) {
    retryMs = Math.min(RETRY_MAX, retryMs ? retryMs * 2 : RETRY_MIN)
    scheduleFlush(retryMs)
  } else if (more) scheduleFlush()
}

/**
 * The data as this device sees it: the server's, with this device's writes
 * not yet sent laid over it — so a pull (e.g. after another write's echo)
 * never undoes a newer local change.
 */
async function withPending(data: Dataset): Promise<Dataset> {
  const rows = await db.outbox.orderBy('id').toArray()
  if (rows.length === 0) return data
  const tables = {
    recipes: new Map(data.recipes.map((r) => [r.id, r])),
    plan: new Map(data.plan.map((p) => [p.id, p])),
    wants: new Map(data.wants.map((w) => [w.id, w])),
    addons: new Map(data.addons.map((a) => [a.id, a])),
    haves: new Map(data.haves.map((h) => [h.id, h])),
    favorites: new Map(data.favorites.map((f) => [f.id, f])),
  }
  for (const r of rows) {
    const table = tables[r.collection] as Map<string, unknown>
    if (r.op === 'delete') table.delete(r.key)
    else table.set(r.key, r.data)
  }
  return {
    recipes: [...tables.recipes.values()],
    plan: [...tables.plan.values()],
    wants: [...tables.wants.values()],
    addons: [...tables.addons.values()],
    haves: [...tables.haves.values()],
    favorites: [...tables.favorites.values()],
    people: data.people,
  }
}

// ---- mutations (called by the store) ---------------------------------------

export function enqueuePut(table: 'recipes', item: Recipe): void
export function enqueuePut(table: 'plan', item: PlanMeal): void
export function enqueuePut(table: 'wants', item: Want): void
export function enqueuePut(table: 'addons', item: AddOn): void
export function enqueuePut(table: 'haves', item: Have): void
export function enqueuePut(table: 'favorites', item: Favorite): void
export function enqueuePut(
  table: TableName,
  item: Recipe | PlanMeal | Want | AddOn | Have | Favorite,
): void {
  epoch++ // (a pull under way doesn't have it)
  void db[table].put(item as never) // cache immediately
  void db.outbox.add({ collection: table, key: item.id, op: 'put', data: item })
  scheduleFlush()
}

export function enqueueDelete(table: TableName, id: string): void {
  epoch++
  void db[table].delete(id)
  void db.outbox.add({ collection: table, key: id, op: 'delete' })
  scheduleFlush()
}

// ---- startup sync ----------------------------------------------------------

function isWriter(): boolean {
  return pb.authStore.record?.role === 'writer'
}

async function seedRemoteIfEmpty(data: Dataset): Promise<boolean> {
  if (data.recipes.length > 0 || data.plan.length > 0 || !isWriter()) return false
  // The first writer in a fresh group: seed the starter dataset into PocketBase.
  for (const r of seedData.recipes) {
    await pb.collection('recipes').create({ key: r.id, data: r }, { requestKey: null })
  }
  for (const m of seedData.plan) {
    await pb.collection('plan').create({ key: m.id, data: m }, { requestKey: null })
  }
  return true
}

let unsubscribers: Array<() => void> = []
let deliver: ((data: Dataset) => void) | null = null

// One pull at a time: asked for while one's under way, another follows it.
let pullTimer: ReturnType<typeof setTimeout> | null = null
let pulling = false
let pullAgain = false

/** Pull soon (a burst of changes — a batch's — is one pull). */
function requestPull(delay = 100): void {
  if (pullTimer) return
  pullTimer = setTimeout(() => {
    pullTimer = null
    void runPull()
  }, delay)
}

/** Pull everything, and — if nothing was written meanwhile — use it: the
 *  server's, with this device's unsent writes laid over it. (Something was:
 *  it's out of date, so pull again.) */
async function runPull(): Promise<void> {
  if (pulling) {
    pullAgain = true
    return
  }
  pulling = true
  try {
    const at = epoch
    const { data, ids } = await remotePull()
    if (epoch !== at) return void (pullAgain = true)
    commitIds(ids)
    const merged = await withPending(data)
    if (epoch !== at) return void (pullAgain = true)
    await cacheReplaceAll(merged)
    if (epoch !== at) return void (pullAgain = true)
    deliver?.(merged)
  } catch {
    // Offline: the next change, or coming back online, pulls again.
  } finally {
    pulling = false
    if (pullAgain) {
      pullAgain = false
      requestPull(250)
    }
  }
}

/**
 * Pull authoritative data, deliver any queued offline writes, prime the cache,
 * and subscribe to realtime updates. `onData` is called with the merged dataset
 * whenever it changes (initial load + remote updates from other devices).
 */
export async function startSync(onData: (data: Dataset) => void): Promise<void> {
  deliver = onData
  commitIds((await remotePull()).ids) // so queued writes map to their records
  await flushOutbox() // deliver edits made while offline

  let { data, ids } = await remotePull()
  if (await seedRemoteIfEmpty(data)) ({ data, ids } = await remotePull())
  commitIds(ids)

  data = await withPending(data)
  await cacheReplaceAll(data)
  onData(data)

  // Realtime: re-pull on any change (family-scale data is tiny) — coalesced.
  const handler = () => requestPull()
  unsubscribers.push(await pb.collection('recipes').subscribe('*', handler))
  unsubscribers.push(await pb.collection('plan').subscribe('*', handler))
  unsubscribers.push(await pb.collection('wants').subscribe('*', handler))
  unsubscribers.push(await pb.collection('addons').subscribe('*', handler))
  unsubscribers.push(await pb.collection('haves').subscribe('*', handler))
  unsubscribers.push(await pb.collection('favorites').subscribe('*', handler))
  // (Someone renamed, joined or left.)
  unsubscribers.push(await pb.collection('users').subscribe('*', handler))

  window.addEventListener('online', () => {
    void flushOutbox()
    requestPull()
  })
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u())
  unsubscribers = []
}
