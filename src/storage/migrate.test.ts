import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { getDb, resetDbForTests, DB_VERSION, STORE_HISTORY, STORE_SETTINGS, STORE_WORKTIME } from './db'
import { migrateRecord } from './migrate'
import { DEFAULT_SETTINGS } from '@/domain/types'

/** Create a database exactly as the v3 app left it, filled with legacy `punches` records. */
async function seedV3(worktime: unknown, history: Record<string, unknown>): Promise<void> {
  const db = await openDB('clocked', 3, {
    upgrade(db) {
      db.createObjectStore(STORE_SETTINGS)
      db.createObjectStore(STORE_WORKTIME)
      db.createObjectStore(STORE_HISTORY)
    },
  })
  await db.put(STORE_SETTINGS, DEFAULT_SETTINGS, 'settings')
  if (worktime) await db.put(STORE_WORKTIME, worktime, 'worktime')
  for (const [date, rec] of Object.entries(history)) await db.put(STORE_HISTORY, rec, date)
  db.close()
}

beforeEach(async () => {
  await resetDbForTests()
  // A fresh, empty IndexedDB per test so each one starts from a known version.
  globalThis.indexedDB = new IDBFactory()
})

afterEach(async () => {
  await resetDbForTests()
})

describe('migrateRecord', () => {
  it('converts a legacy punches record', () => {
    expect(migrateRecord({ date: '2026-11-02', punches: [{ in: 100, out: 200 }, { in: 300 }] })).toEqual({
      date: '2026-11-02',
      events: [{ type: 'in', t: 100 }, { type: 'out', t: 200 }, { type: 'in', t: 300 }],
    })
  })

  it('leaves an already migrated record alone', () => {
    expect(migrateRecord({ date: '2026-11-02', events: [] })).toBeNull()
  })

  it('ignores values that are not day records', () => {
    expect(migrateRecord(null)).toBeNull()
    expect(migrateRecord({ daily_target: 1 })).toBeNull()
  })
})

describe('v3 -> v4 upgrade', () => {
  it('is at version 4', () => {
    expect(DB_VERSION).toBe(4)
  })

  it('converts today (open punch) and every history day', async () => {
    await seedV3(
      { date: '2026-11-15', punches: [{ in: 28800, out: 43200 }, { in: 45000 }] },
      {
        '2026-11-13': { date: '2026-11-13', punches: [{ in: 28800, out: 61200 }] },
        '2026-11-14': { date: '2026-11-14', punches: [{ in: 30000, out: 40000 }, { in: 42000, out: 86399 }] },
      },
    )

    const db = await getDb()
    expect(db.version).toBe(4)

    expect(await db.get(STORE_WORKTIME, 'worktime')).toEqual({
      date: '2026-11-15',
      events: [{ type: 'in', t: 28800 }, { type: 'out', t: 43200 }, { type: 'in', t: 45000 }],
    })
    expect(await db.get(STORE_HISTORY, '2026-11-13')).toEqual({
      date: '2026-11-13',
      events: [{ type: 'in', t: 28800 }, { type: 'out', t: 61200 }],
    })
    expect(await db.get(STORE_HISTORY, '2026-11-14')).toEqual({
      date: '2026-11-14',
      events: [
        { type: 'in', t: 30000 }, { type: 'out', t: 40000 },
        { type: 'in', t: 42000 }, { type: 'out', t: 86399 },
      ],
    })
  })

  it('keeps settings untouched', async () => {
    await seedV3(null, {})
    const db = await getDb()
    expect(await db.get(STORE_SETTINGS, 'settings')).toEqual(DEFAULT_SETTINGS)
    expect(await db.get(STORE_WORKTIME, 'worktime')).toBeUndefined()
  })

  it('creates all stores on a fresh install', async () => {
    const db = await getDb()
    expect(db.version).toBe(4)
    expect([...db.objectStoreNames].sort()).toEqual([STORE_HISTORY, STORE_SETTINGS, STORE_WORKTIME].sort())
  })
})
