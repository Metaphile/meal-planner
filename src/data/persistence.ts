import { db, type TableName } from './db'
import type { Dataset, PlanMeal, Recipe } from './types'

/**
 * Write-behind persistence. The store is the source of truth; mutations call
 * `enqueuePut` / `enqueueDelete` which batch into IndexedDB on a short debounce.
 * This keeps async storage entirely off the interaction path — the UI has
 * already updated synchronously before anything touches disk.
 *
 * This module is the sync-swappable seam: a future sync engine replaces these
 * functions (hydrate + write-behind) without the store or UI changing.
 */

const FLUSH_DELAY_MS = 150

type Pending = {
  puts: Map<string, Recipe | PlanMeal>
  deletes: Set<string>
}

const queues: Record<TableName, Pending> = {
  recipes: { puts: new Map(), deletes: new Set() },
  plan: { puts: new Map(), deletes: new Set() },
}

let timer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null

export async function hydrate(): Promise<Dataset> {
  const [recipes, plan] = await Promise.all([
    db.recipes.toArray(),
    db.plan.toArray(),
  ])
  return { recipes, plan }
}

export function enqueuePut(table: 'recipes', item: Recipe): void
export function enqueuePut(table: 'plan', item: PlanMeal): void
export function enqueuePut(table: TableName, item: Recipe | PlanMeal): void {
  const q = queues[table]
  q.deletes.delete(item.id)
  q.puts.set(item.id, item)
  schedule()
}

export function enqueueDelete(table: TableName, id: string): void {
  const q = queues[table]
  q.puts.delete(id)
  q.deletes.add(id)
  schedule()
}

function schedule(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, FLUSH_DELAY_MS)
}

/** Force-write everything pending. Returns when the queue is drained. */
export async function flush(): Promise<void> {
  // Coalesce concurrent callers onto a single in-flight flush.
  if (flushing) return flushing
  flushing = doFlush().finally(() => {
    flushing = null
  })
  return flushing
}

async function doFlush(): Promise<void> {
  const work: Promise<unknown>[] = []

  for (const table of Object.keys(queues) as TableName[]) {
    const q = queues[table]
    if (q.puts.size === 0 && q.deletes.size === 0) continue

    const puts = [...q.puts.values()]
    const deletes = [...q.deletes]
    q.puts.clear()
    q.deletes.clear()

    // Each table is typed independently; cast is safe because callers use the
    // typed `enqueuePut` overloads above.
    if (puts.length) work.push((db[table] as any).bulkPut(puts))
    if (deletes.length) work.push(db[table].bulkDelete(deletes))
  }

  await Promise.all(work)

  // If new work arrived while we were writing, drain it too.
  const stillPending = (Object.keys(queues) as TableName[]).some(
    (t) => queues[t].puts.size > 0 || queues[t].deletes.size > 0,
  )
  if (stillPending) await doFlush()
}

/** Replace the entire dataset (used by seeding). */
export async function replaceAll(data: Dataset): Promise<void> {
  await db.transaction('rw', db.recipes, db.plan, async () => {
    await Promise.all([db.recipes.clear(), db.plan.clear()])
    await Promise.all([
      db.recipes.bulkAdd(data.recipes),
      db.plan.bulkAdd(data.plan),
    ])
  })
}

// Best-effort flush when the tab is hidden or closed so nothing is lost.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('pagehide', () => void flush())
}
