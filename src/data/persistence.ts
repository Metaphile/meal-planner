import { db, type OutboxRow, type TableName } from './db'
import type { Dataset, PlanMeal, Recipe } from './types'
import { seedData } from './seed'
import { pb } from '../auth/pb'

/**
 * Sync layer. PocketBase is authoritative for recipes/plan; IndexedDB is a
 * local cache (instant boot + offline reads); the in-memory store stays the UI
 * source of truth. Every mutation updates the cache immediately and is queued
 * in a durable outbox until it reaches PocketBase, so nothing is lost offline.
 */

// ---- local cache (IndexedDB) ----------------------------------------------

export async function hydrate(): Promise<Dataset> {
  const [recipes, plan] = await Promise.all([
    db.recipes.toArray(),
    db.plan.toArray(),
  ])
  return { recipes, plan }
}

async function cacheReplaceAll(data: Dataset): Promise<void> {
  await db.transaction('rw', db.recipes, db.plan, async () => {
    await Promise.all([db.recipes.clear(), db.plan.clear()])
    await Promise.all([
      db.recipes.bulkPut(data.recipes),
      db.plan.bulkPut(data.plan),
    ])
  })
}

// ---- remote (PocketBase) ---------------------------------------------------

// Maps our app-level id ("key") to the PocketBase record id, rebuilt on pull.
const idMap = new Map<string, string>()
const mapKey = (c: TableName, k: string) => `${c}:${k}`

async function remotePull(): Promise<Dataset> {
  const [recs, plans] = await Promise.all([
    pb.collection('recipes').getFullList({ requestKey: null }),
    pb.collection('plan').getFullList({ requestKey: null }),
  ])
  idMap.clear()
  const recipes = recs.map((r) => {
    idMap.set(mapKey('recipes', r.key), r.id)
    return r.data as Recipe
  })
  const plan = plans.map((p) => {
    idMap.set(mapKey('plan', p.key), p.id)
    return p.data as PlanMeal
  })
  return { recipes, plan }
}

/** Apply one op to PocketBase. Throws on failure (caller decides to retry). */
async function applyRemote(op: OutboxRow): Promise<void> {
  const id = idMap.get(mapKey(op.collection, op.key))
  if (op.op === 'delete') {
    if (id) {
      await pb.collection(op.collection).delete(id, { requestKey: null })
      idMap.delete(mapKey(op.collection, op.key))
    }
    return
  }
  if (id) {
    await pb
      .collection(op.collection)
      .update(id, { key: op.key, data: op.data }, { requestKey: null })
  } else {
    const rec = await pb
      .collection(op.collection)
      .create({ key: op.key, data: op.data }, { requestKey: null })
    idMap.set(mapKey(op.collection, op.key), rec.id)
  }
}

// ---- outbox (durable offline write queue) ----------------------------------

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushOutbox()
  }, 150)
}

async function flushOutbox(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const rows = await db.outbox.orderBy('id').toArray()
    if (rows.length === 0) return
    // Collapse to the latest op per key so a create+update offline becomes one
    // write (and we never create the same key twice).
    const latest = new Map<string, OutboxRow>()
    for (const r of rows) latest.set(mapKey(r.collection, r.key), r)
    for (const op of latest.values()) {
      await applyRemote(op) // throws if still offline → keep outbox, retry later
    }
    await db.outbox.clear()
  } catch {
    // Still offline / a write failed — leave the outbox for the next attempt.
  } finally {
    flushing = false
  }
}

// ---- mutations (called by the store) ---------------------------------------

export function enqueuePut(table: 'recipes', item: Recipe): void
export function enqueuePut(table: 'plan', item: PlanMeal): void
export function enqueuePut(table: TableName, item: Recipe | PlanMeal): void {
  void db[table].put(item as never) // cache immediately
  void db.outbox.add({ collection: table, key: item.id, op: 'put', data: item })
  scheduleFlush()
}

export function enqueueDelete(table: TableName, id: string): void {
  void db[table].delete(id)
  void db.outbox.add({ collection: table, key: id, op: 'delete' })
  scheduleFlush()
}

// ---- startup sync ----------------------------------------------------------

function isAdmin(): boolean {
  return pb.authStore.record?.role === 'admin'
}

async function seedRemoteIfEmpty(data: Dataset): Promise<boolean> {
  if (data.recipes.length > 0 || data.plan.length > 0 || !isAdmin()) return false
  // First admin on a fresh household: seed the starter dataset into PocketBase.
  for (const r of seedData.recipes) {
    await pb.collection('recipes').create({ key: r.id, data: r }, { requestKey: null })
  }
  for (const m of seedData.plan) {
    await pb.collection('plan').create({ key: m.id, data: m }, { requestKey: null })
  }
  return true
}

let unsubscribers: Array<() => void> = []

/**
 * Pull authoritative data, deliver any queued offline writes, prime the cache,
 * and subscribe to realtime updates. `onData` is called with the merged dataset
 * whenever it changes (initial load + remote updates from other devices).
 */
export async function startSync(onData: (data: Dataset) => void): Promise<void> {
  await remotePull() // populate idMap so outbox updates map to the right records
  await flushOutbox() // deliver edits made while offline

  let data = await remotePull()
  if (await seedRemoteIfEmpty(data)) data = await remotePull()

  await cacheReplaceAll(data)
  onData(data)

  // Realtime: re-pull on any change (family-scale data is tiny).
  const handler = () => {
    void (async () => {
      const fresh = await remotePull()
      await cacheReplaceAll(fresh)
      onData(fresh)
    })()
  }
  unsubscribers.push(await pb.collection('recipes').subscribe('*', handler))
  unsubscribers.push(await pb.collection('plan').subscribe('*', handler))

  window.addEventListener('online', () => void flushOutbox())
}

export function stopSync(): void {
  unsubscribers.forEach((u) => u())
  unsubscribers = []
}
