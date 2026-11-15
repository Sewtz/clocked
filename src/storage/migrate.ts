import type { IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb'
import { punchesToEvents } from '@/domain/events'
import type { Punch, PunchEvent } from '@/domain/types'

interface LegacyRecord { date: string; punches: Punch[] }
interface EventRecord { date: string; events: PunchEvent[] }

/**
 * Convert one stored day from the v3 `punches` shape to the v4 `events` shape.
 * Returns null when the record needs no change (already migrated or unrecognised),
 * which makes the migration safe to run more than once.
 */
export function migrateRecord(value: unknown): EventRecord | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Partial<LegacyRecord> & { events?: unknown }
  if (Array.isArray(r.events) || !Array.isArray(r.punches) || typeof r.date !== 'string') return null
  return { date: r.date, events: punchesToEvents(r.punches) }
}

// The DB is untyped (no DBSchema), so idb's generic parameters are `unknown`.
type AnyTx = IDBPTransaction<unknown, ArrayLike<StoreNames<unknown>>, 'versionchange'>
type AnyStore = IDBPObjectStore<unknown, ArrayLike<StoreNames<unknown>>, StoreNames<unknown>, 'versionchange'>

async function migrateStore(store: AnyStore): Promise<void> {
  let cursor = await store.openCursor()
  while (cursor) {
    const next = migrateRecord(cursor.value)
    if (next) await cursor.update(next)
    cursor = await cursor.continue()
  }
}

/**
 * v3 -> v4: rewrite `worktime` and `history` records from punches to events.
 * Must run inside the version-change transaction; only IDB requests are awaited
 * so the transaction stays alive.
 */
export async function migratePunchesToEvents(tx: AnyTx, storeNames: readonly string[]): Promise<void> {
  for (const name of storeNames) {
    if (!tx.objectStoreNames.contains(name)) continue
    await migrateStore(tx.objectStore(name) as AnyStore)
  }
}
