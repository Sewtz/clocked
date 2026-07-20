# WP2 — Storage layer

Goal: a thin, fully-tested wrapper over IndexedDB using `idb` for persisting today's entry. No Vue, no Pinia. Lives in `src/storage/`.

The store (WP3) will call into these functions. They are async; the store handles loading state.

**Strict order:** T1 → T2 → T3 → T4.

---

## WP2-T1 — `idb` database open

- **Goal:** Open (and lazily create) the IndexedDB database with the right schema.
- **Files:** `src/storage/db.ts`.
- **Approach:**
  ```ts
  import { openDB, type IDBPDatabase } from 'idb'

  const DB_NAME = 'clocked'
  const DB_VERSION = 1
  const STORE_ENTRIES = 'entries'

  export { STORE_ENTRIES }

  let dbPromise: Promise<IDBPDatabase> | null = null

  export function getDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
      dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
            db.createObjectStore(STORE_ENTRIES, { keyPath: 'date' })
          }
        },
      })
    }
    return dbPromise
  }
  ```
  The DB is single-instance within the page (cached in `dbPromise`). The schema is intentionally minimal — one object store keyed by `date` (the `YYYY-MM-DD` string).
- **Dependencies:** none (uses `idb` from WP0-T2).
- **Acceptance criteria:**
  - `getDb()` returns a promise that resolves to an IDBPDatabase.
  - Calling `getDb()` twice returns the same promise.
  - `pnpm typecheck` clean.
- **V&V:** `pnpm typecheck`.
- **Pitfalls:**
  - Do not call `openDB` at module load — defer to the first `getDb()` call so tests that import the module don't open a real DB unless they ask for it.
  - Version starts at 1. If we ever change the schema, bump `DB_VERSION` and write an `upgrade` branch.

---

## WP2-T2 — Entry CRUD

- **Goal:** Get, put, delete today's entry.
- **Files:** `src/storage/entries.ts`, `src/storage/entries.test.ts`.
- **Approach:**
  ```ts
  // src/storage/entries.ts
  import { getDb, STORE_ENTRIES } from './db'
  import type { Entry } from '@/domain/types'

  export async function getEntry(date: string): Promise<Entry | undefined> {
    const db = await getDb()
    return db.get(STORE_ENTRIES, date)
  }

  export async function putEntry(entry: Entry): Promise<void> {
    const db = await getDb()
    await db.put(STORE_ENTRIES, entry)
  }

  export async function deleteEntry(date: string): Promise<void> {
    const db = await getDb()
    await db.delete(STORE_ENTRIES, date)
  }

  export async function clearAllEntries(): Promise<void> {
    const db = await getDb()
    await db.clear(STORE_ENTRIES)
  }
  ```
  Test cases (`entries.test.ts`), using `fake-indexeddb` (already global from `src/test/setup.ts`):
  - `getEntry('2026-07-21')` returns `undefined` on a fresh DB.
  - `putEntry({ date: '2026-07-21', segments: [...] })` then `getEntry('2026-07-21')` returns the same object (deep-equal).
  - `deleteEntry('2026-07-21')` removes the row; subsequent `getEntry` returns `undefined`.
  - `putEntry` with the same `date` overwrites the existing entry.
  - Multi-segment entry round-trips correctly (no JSON corruption).
  - `clearAllEntries` empties the store.
  - Each test should reset the DB between cases — either by `beforeEach(() => clearAllEntries())` or by using a unique date per test.
- **Dependencies:** WP2-T1, WP1-T1 (for the `Entry` type).
- **Acceptance criteria:**
  - All test cases pass.
  - The CRUD functions are the only exported API; nothing else reaches into `idb` directly from outside `src/storage/`.
- **V&V:** `pnpm test -- src/storage/entries.test.ts`.
- **Pitfalls:**
  - `fake-indexeddb` is registered in `src/test/setup.ts` as `import 'fake-indexeddb/auto'`. Verify it is loaded before any test that touches IndexedDB.
  - Tests run in parallel by default; use isolated dates or `beforeEach` to clean up.
  - Do not export the raw `idb` DB instance; keep the API surface to the four functions above.

---

## WP2-T3 — Persistence permission helper

- **Goal:** Request persistent storage; provide a way to check it.
- **Files:** `src/storage/persist.ts`, `src/storage/persist.test.ts`.
- **Approach:**
  ```ts
  // src/storage/persist.ts
  export async function requestPersistence(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return false
    }
    try {
      return await navigator.storage.persist()
    } catch {
      return false
    }
  }

  export async function isPersisted(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
      return false
    }
    try {
      return await navigator.storage.persisted()
    } catch {
      return false
    }
  }
  ```
  Test cases (these mostly verify graceful behavior; the real check is manual V&V in WP7):
  - When `navigator.storage` is undefined (test env), `requestPersistence` resolves to `false` and does not throw.
  - When `navigator.storage.persist` rejects, `requestPersistence` catches and resolves to `false`.
  - Same for `isPersisted`.
  
  Optionally, mock `navigator.storage.persist` to return `true` and verify the call propagates:
  ```ts
  it('returns true when navigator.storage.persist resolves true', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    expect(await requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })
  ```
- **Dependencies:** none (uses standard browser APIs).
- **Acceptance criteria:**
  - All test cases pass.
  - Functions are defensive against missing `navigator.storage` (older browsers, SSR).
- **V&V:** `pnpm test -- src/storage/persist.test.ts`.
- **Pitfalls:**
  - `navigator.storage.persist()` may show a browser prompt on first call; in tests this won't happen because `navigator.storage` is undefined in happy-dom. Good — tests stay deterministic.
  - Don't make `requestPersistence` blocking on user gesture at this layer — that's a concern of the caller (the store, WP3).

---

## WP2-T4 — WP2 integration smoke test

- **Goal:** A single end-to-end test that the storage layer works together: open DB, write a realistic multi-segment entry, read it back, modify it, write it again, delete it.
- **Files:** `src/storage/integration.test.ts`.
- **Approach:**
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest'
  import { getEntry, putEntry, deleteEntry, clearAllEntries } from './entries'
  import type { Entry } from '@/domain/types'

  describe('storage integration', () => {
    beforeEach(async () => { await clearAllEntries() })

    it('round-trips a multi-segment entry', async () => {
      const date = '2026-07-21'
      const entry: Entry = {
        date,
        segments: [
          { type: 'work', start: 1000, end: 2000 },
          { type: 'break', start: 2000, end: 3000, duration: 30 },
          { type: 'work', start: 3000 },
        ],
      }
      await putEntry(entry)
      const fetched = await getEntry(date)
      expect(fetched).toStrictEqual(entry)
    })

    it('handles updates and deletes', async () => {
      const date = '2026-07-22'
      await putEntry({ date, segments: [{ type: 'work', start: 1000 }] })
      let fetched = await getEntry(date)
      expect(fetched?.segments).toHaveLength(1)
      await putEntry({ date, segments: [{ type: 'work', start: 1000 }, { type: 'break', start: 2000, duration: 30 }] })
      fetched = await getEntry(date)
      expect(fetched?.segments).toHaveLength(2)
      await deleteEntry(date)
      expect(await getEntry(date)).toBeUndefined()
    })
  })
  ```
- **Dependencies:** WP2-T1, WP2-T2.
- **Acceptance criteria:**
  - Test passes.
  - `pnpm test` runs the whole `src/storage/` suite cleanly.
- **V&V:** `pnpm test -- src/storage/`.
- **Pitfalls:**
  - Always `clearAllEntries` in `beforeEach` so tests don't see each other's data.
  - If `fake-indexeddb` fails to register, the tests will hang or timeout — verify `src/test/setup.ts` is still importing `'fake-indexeddb/auto'`.

---

## End of WP2

Once WP2-T4 passes, the persistence layer is ready. Proceed to `03-store.md`.
