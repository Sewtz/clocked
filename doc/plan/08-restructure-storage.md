# WP8 — Restructure storage into `settings` + `worktime`

Goal: replace the single `entries` object store (segment-based) with two object stores (`settings` persistent key-value, `worktime` in/out punches), rewrite the domain recompute to derive breaks from punch gaps + settings, add a configurable injectable clock, and ship an always-on console debug API.

**This WP supersedes parts of WP1 (domain), WP2 (storage), and WP3 (store).** The old `entries` store is dropped; `entries.ts`, `recomputeBreaks.ts`, and the old `Entry`/`Segment` types are deleted.

**Strict order:** T1 → T2 → ... → T12.

---

## WP8-T1 — New domain types

- **Goal:** Define `Settings`, `Worktime`, and the recompute output type. Remove old `Entry`, `Segment`, `BreakDuration`, `WorkSegment`, `BreakSegment`.
- **Files:** `src/domain/types.ts`.
- **Approach:** Replace all content with:
  ```ts
  export interface Settings {
    daily_target: number
    daily_limit: number
    break1_enabled: boolean
    break1_trigger: number
    break1_duration: number
    break2_enabled: boolean
    break2_trigger: number
    break2_duration: number
  }

  export const DEFAULT_SETTINGS: Settings = {
    daily_target: 28800,
    daily_limit: 36000,
    break1_enabled: true,
    break1_trigger: 21600,
    break1_duration: 1800,
    break2_enabled: true,
    break2_trigger: 32400,
    break2_duration: 900,
  }

  export interface Worktime {
    date: string                         // 'YYYY-MM-DD' — local day of the record
    punches: Array<{ in: number; out?: number }>
  }

  export type BreakState = 'running' | 'break1' | 'break2'

  export interface Recomputed {
    workedSeconds: number
    breakSeconds: number
    displaySeconds: number
    breakState: BreakState
    breakEndsAtMs?: number
    targetReached: boolean
    limitReached: boolean
  }

  export interface ClockState {
    state: BreakState
    workedMs: number
    displayMs: number
    breakEndsAt?: number
    currentIn?: number
  }

  export type ViewState =
    | { kind: 'clock-in' }
    | { kind: 'running' }
    | { kind: 'break' }
    | { kind: 'clocked-out' }
  ```
- **Dependencies:** none.
- **Acceptance criteria:**
  - `pnpm typecheck` passes.
  - All other files can `import type` from `./types`.
- **V&V:** `pnpm typecheck`.
- **Pitfalls:**
  - Delete everything. No vestiges of `Segment`, `Entry`, `BreakDuration`, `WorkSegment`, `BreakSegment`.
  - `break2_enabled` only meaningful when `break1_enabled` is `true`. Enforce in the setter (WP8-T5), not in the type.
  - Seconds everywhere (not ms). The UI getter `workedMs` wraps `workedSeconds * 1000` for backwards compatibility with Vue components.

---

## WP8-T2 — Date helpers: add `secondsSinceMidnight`

- **Goal:** Convert epoch-ms to seconds-since-midnight, for punch times.
- **Files:** `src/domain/date.ts`, `src/domain/date.test.ts`.
- **Approach:** Add to `date.ts`:
  ```ts
  export function secondsSinceMidnight(epochMs: number): number {
    const d = new Date(epochMs)
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
  }
  ```
  Keep existing `todayString`, `isExpired`, `localEpochForTodayMs`.
  Update `localEpochForTodayMs` to be compatible with seconds-based model (it already returns epoch-ms, fine).

  Test cases for `secondsSinceMidnight`:
  - Midnight → `0`.
  - `2026-07-24T09:30:00` → `34200` (9*3600 + 30*60).
  - `2026-07-24T23:59:59` → `86399`.
- **Dependencies:** WP8-T1.
- **Acceptance criteria:**
  - All tests pass.
- **V&V:** `pnpm test -- src/domain/date.test.ts`.
- **Pitfalls:**
  - Uses local time (not UTC), consistent with the rest of the app.

---

## WP8-T3 — Injectable clock

- **Goal:** Single source of time that the store and recompute use, default `Date.now()`, swappable for tests and the debug API.
- **Files:** `src/domain/clock.ts`.
- **Approach:**
  ```ts
  export type ClockFn = () => number

  let nowFn: ClockFn = () => Date.now()

  export function setClock(fn: ClockFn | null): void {
    nowFn = fn ?? (() => Date.now())
  }

  export function now(): number {
    return nowFn()
  }
  ```
- **Dependencies:** none.
- **Acceptance criteria:**
  - `now()` returns a number.
  - `setClock(() => 1234)` then `now()` returns `1234`.
  - `setClock(null)` restores `Date.now()`.
- **V&V:** Via unit tests in `clock.test.ts` or via debug API tests (WP8-T11).
- **Pitfalls:**
  - Not a Pinia action — just a module-level function. The store calls `clock.now()` directly.

---

## WP8-T4 — Recomputation pure function

- **Goal:** Given punches, settings, and a now-seconds value, derive worked/break/duration/state/endpoint.
- **Files:** `src/domain/recompute.ts`, `src/domain/recompute.test.ts`. Delete `src/domain/recomputeBreaks.ts` and its test file.
- **Approach:**
  ```ts
  import type { Recomputed, BreakState, Settings, Worktime } from './types'

  export function recompute(punches: Worktime['punches'], settings: Settings, nowSec: number): Recomputed
  ```
  Algorithm (from `doc/architecture.md` — Break derivation algorithm):

  1. `workedGross = Σ(out_i − in_i)` over closed punches; open punch counts `nowSec − in_i`.
  2. Gaps = `in_{i+1} − out_i` between consecutive punches.
  3. For each enabled break `B` (break1 first, then break2; break2 only eligible after break1 satisfied):
     - When accumulated worked time-so-far crosses `B.trigger`:
       - If a real gap ≥ `B.duration` exists at or before the trigger point → consume it.
       - Else → introduce mandatory pause: `breakEndsAtMs = triggerWallClockMs + B.duration * 1000`.
  4. If `Σ gaps ≥ sum of enabled break durations` → use gaps as break time (no mandatory pauses).
  5. `breakSeconds = consumed gaps + introduced pauses`; `workedSeconds = workedGross − breakSeconds`.
  6. `targetReached = workedSeconds ≥ settings.daily_target`; `limitReached = workedSeconds ≥ settings.daily_limit`.

  Test cases (write as individual `it` blocks):
  - Empty punches → `{ workedSeconds: 0, breakSeconds: 0, breakState: 'running', breakEndsAtMs: undefined, targetReached: false, limitReached: false }`.
  - Single punch, 1h in → no break, worked = 3600.
  - Single punch crossing break1_trigger (21601s) → break1 fired, worked frozen at 21600, breakEndsAt = triggerMs + 1800s.
  - During break1 (now between trigger and trigger+duration) → state `break1`.
  - After break1 ends (now > trigger+duration) → state `running`, worked continues from trigger+duration.
  - Gap between punches ≥ break1_duration → gap consumed, no mandatory pause.
  - Gap < break1_duration + trigger crossed → mandatory pause introduced.
  - Total gaps ≥ break1_duration + break2_duration → no mandatory pauses.
  - break1 disabled → no breaks at all, even if worked passes both thresholds.
  - break2 only fires after break1 satisfied.
  - Open punch (no out) → counted up to nowSec.
  - targetReached true when workedSeconds ≥ daily_target.
  - limitReached true when workedSeconds ≥ daily_limit.
  - Idempotency: `recompute(recompute(p, s, n).punches, s, n)` = first call (not applicable since we don't store breaks).
- **Dependencies:** WP8-T1, WP8-T3.
- **Acceptance criteria:**
  - All test cases pass.
  - `pnpm typecheck` clean.
- **V&V:** `pnpm test -- src/domain/recompute.test.ts`.
- **Pitfalls:**
  - The function is **pure** — no side effects, no Date.now() calls (uses the `nowSec` parameter).
  - `breakEndsAtMs` is in epoch-ms (for the Vue overlay), not seconds-since-midnight.
  - The second break must not fire until the first break has been fully satisfied (break1 duration elapsed after crossing).
  - Test the cascade-disable: if break1 is disabled, break2 is not checked at all.

---

## WP8-T5 — Settings helpers

- **Goal:** Merge-patch and validate settings, enforce `break2_enabled` requires `break1_enabled`.
- **Files:** `src/domain/settings.ts`, `src/domain/settings.test.ts`.
- **Approach:**
  ```ts
  import type { Settings } from './types'

  export function applySettingsPatch(current: Settings, patch: Partial<Settings>): Settings {
    const next = { ...current, ...patch }
    if (!next.break1_enabled) {
      next.break2_enabled = false
    }
    return next
  }

  export function isBreak2Allowed(settings: Settings): boolean {
    return settings.break1_enabled
  }
  ```
  Test cases:
  - Patch with `break1_enabled: false` → cascade-disable `break2_enabled`.
  - Patch with `break1_enabled: true, break2_enabled: true` → both true.
  - Patch with `break1_enabled: false, break2_enabled: true` → break2 becomes false.
  - Empty patch → no change.
- **Dependencies:** WP8-T1.
- **Acceptance criteria:**
  - All tests pass.
- **V&V:** `pnpm test -- src/domain/settings.test.ts`.

---

## WP8-T6 — DB schema v2: new stores, drop entries

- **Goal:** Bump `DB_VERSION` to 2, delete `entries` store, create `settings` and `worktime` stores.
- **Files:** `src/storage/db.ts`, `src/storage/db.test.ts`.
- **Approach:**
  ```ts
  const DB_NAME = 'clocked'
  const DB_VERSION = 2
  const STORE_SETTINGS = 'settings'
  const STORE_WORKTIME = 'worktime'

  export { STORE_SETTINGS, STORE_WORKTIME }

  export function getDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
      dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            // v1 used to create 'entries', but we skip it now
          }
          if (oldVersion < 2) {
            if (db.objectStoreNames.contains('entries')) {
              db.deleteObjectStore('entries')
            }
            if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
              db.createObjectStore(STORE_SETTINGS) // out-of-line keys
            }
            if (!db.objectStoreNames.contains(STORE_WORKTIME)) {
              db.createObjectStore(STORE_WORKTIME) // out-of-line keys
            }
          }
        },
      })
    }
    return dbPromise
  }
  ```
  Remove `STORE_ENTRIES` constant.
- **Dependencies:** WP8-T1.
- **Acceptance criteria:**
  - `getDb()` resolves to a v2 database with `settings` and `worktime` stores, no `entries` store.
  - `pnpm typecheck` clean.
- **V&V:** `pnpm typecheck`.
- **Pitfalls:**
  - `createObjectStore` without `keyPath` => out-of-line keys. You pass the key as the second argument to `db.put()`.
  - v1→v2 upgrade must handle the case where `entries` store doesn't exist (e.g. clean start on v2).
  - Delete `entries` store **before** creating new stores, in case the DB was freshly created at v1 (no 'entries' store existed — oldVersion < 1 path would have created it, but now we skip that).

---

## WP8-T7 — Settings and worktime storage CRUD

- **Goal:** Thin wrappers for getting/setting/clearing settings and worktime.
- **Files:** `src/storage/settings.ts`, `src/storage/settings.test.ts`, `src/storage/worktime.ts`, `src/storage/worktime.test.ts`. Delete `src/storage/entries.ts` and its test.
- **Approach:**
  ```ts
  // src/storage/settings.ts
  import { getDb, STORE_SETTINGS } from './db'
  import type { Settings } from '@/domain/types'

  export async function getSettings(): Promise<Settings | null> {
    const db = await getDb()
    return (await db.get(STORE_SETTINGS, 'settings')) ?? null
  }

  export async function putSettings(settings: Settings): Promise<void> {
    const db = await getDb()
    await db.put(STORE_SETTINGS, settings, 'settings')
  }
  ```

  ```ts
  // src/storage/worktime.ts
  import { getDb, STORE_WORKTIME } from './db'
  import type { Worktime } from '@/domain/types'

  export async function getWorktime(): Promise<Worktime | null> {
    const db = await getDb()
    return (await db.get(STORE_WORKTIME, 'worktime')) ?? null
  }

  export async function putWorktime(worktime: Worktime): Promise<void> {
    const db = await getDb()
    await db.put(STORE_WORKTIME, worktime, 'worktime')
  }

  export async function clearWorktime(): Promise<void> {
    const db = await getDb()
    await db.delete(STORE_WORKTIME, 'worktime')
  }
  ```

  Tests:
  - `getSettings()` returns `null` on empty DB.
  - `putSettings(DEFAULT_SETTINGS)` then `getSettings()` returns the same object (deep-equal).
  - `getWorktime()` returns `null` on empty DB.
  - `putWorktime({ punches: [{ in: 0 }] })` then `getWorktime()` returns deep-equal.
  - `clearWorktime()` → `getWorktime()` returns `null`.
  - Each test resets via `beforeEach` (clear both stores).
- **Dependencies:** WP8-T6.
- **Acceptance criteria:**
  - All tests pass.
  - Nothing outside `src/storage/` imports `idb` directly.
- **V&V:** `pnpm test -- src/storage/settings.test.ts src/storage/worktime.test.ts`.

---

## WP8-T8 — Adjust helpers rewrite

- **Goal:** Adapt adjustment functions to work with in/out punches instead of segments.
- **Files:** `src/domain/adjust.ts`, `src/domain/adjust.test.ts`. Delete old segment logic.
- **Approach:**
  ```ts
  import type { Worktime } from './types'

  export function adjustStart(worktime: Worktime, deltaSeconds: number): Worktime {
    if (worktime.punches.length === 0) throw new Error('No punches to adjust')
    const first = worktime.punches[0]
    return { punches: [{ ...first, in: first.in - deltaSeconds }, ...worktime.punches.slice(1)] }
  }

  export function setFirstPunchIn(worktime: Worktime, newIn: number): Worktime {
    if (worktime.punches.length === 0) throw new Error('No punches to adjust')
    const first = worktime.punches[0]
    return { punches: [{ ...first, in: newIn }, ...worktime.punches.slice(1)] }
  }
  ```
  Test cases:
  - `adjustStart({ punches: [{ in: 28800 }] }, 300)` → first punch in = 28500.
  - `adjustStart` on empty punches throws.
  - `setFirstPunchIn({ punches: [{ in: 28800, out: 36000 }] }, 25200)` → in = 25200, out unchanged.
  - Both functions return new objects (no mutation).
- **Dependencies:** WP8-T1.
- **Acceptance criteria:**
  - All tests pass.
- **V&V:** `pnpm test -- src/domain/adjust.test.ts`.

---

## WP8-T9 — Pinia store rewrite

- **Goal:** Rewrite `src/stores/clock.ts` to use the new types, storage, recompute, and injectable clock.
- **Files:** `src/stores/clock.ts`, `src/stores/clock.test.ts`. Delete old store test.
- **Approach:**
  ```ts
  import { defineStore } from 'pinia'
  import { now, setClock } from '@/domain/clock'
  import { secondsSinceMidnight, isExpired, todayString } from '@/domain/date'
  import { recompute } from '@/domain/recompute'
  import { applySettingsPatch } from '@/domain/settings'
  import { getSettings, putSettings } from '@/storage/settings'
  import { getWorktime, putWorktime, clearWorktime } from '@/storage/worktime'
  import { requestPersistence } from '@/storage/persist'
  import { adjustStart, setFirstPunchIn } from '@/domain/adjust'
  import type { Settings, Worktime, ViewState, BreakState, Recomputed } from '@/domain/types'
  import { DEFAULT_SETTINGS } from '@/domain/types'

  type LoadStatus = 'idle' | 'loading' | 'ready'

  export const useClockStore = defineStore('clock', {
    state: () => ({
      loadStatus: 'idle' as LoadStatus,
      settings: null as Settings | null,
      worktime: null as Worktime | null,
      now: 0,               // epoch-ms, for Vue reactivity
      _isClockedIn: false,  // derived on load
    }),

    getters: {
      computed(): Recomputed {
        if (!this.settings || !this.worktime) {
          return { workedSeconds: 0, breakSeconds: 0, displaySeconds: 0, breakState: 'running', targetReached: false, limitReached: false }
        }
        const nowSec = secondsSinceMidnight(this.now)
        return recompute(this.worktime.punches, this.settings, nowSec)
      },
      workedMs(): number { return this.computed.workedSeconds * 1000 },
      displayMs(): number { return this.computed.displaySeconds * 1000 },
      breakState(): BreakState { return this.computed.breakState },
      breakEndsAt(): number | undefined { return this.computed.breakEndsAtMs },
      isClockedIn(): boolean { return this._isClockedIn },
      isClockedOut(): boolean { return !!this.worktime && !this._isClockedIn },
      isOnBreak(): boolean { return this.breakState === 'break1' || this.breakState === 'break2' },
      viewState(): ViewState {
        if (!this.worktime) return { kind: 'clock-in' }
        if (this.isOnBreak) return { kind: 'break' }
        if (this.isClockedOut) return { kind: 'clocked-out' }
        return { kind: 'running' }
      },
    },

    actions: {
      async init() {
        this.now = now()
        this.loadStatus = 'loading'

        let s = await getSettings()
        if (!s) { s = DEFAULT_SETTINGS; await putSettings(s) }
        this.settings = s

        const w = await getWorktime()
        if (w) {
          this.worktime = w
          const last = w.punches[w.punches.length - 1]
          this._isClockedIn = !!(last && last.out === undefined)
        }

        this.loadStatus = 'ready'
        await this.checkRollover()
      },

      async clockIn(backdateSec?: number) {
        const inSec = backdateSec ?? secondsSinceMidnight(now())
        if (!this.worktime) {
          this.worktime = { date: todayString(new Date(now())), punches: [{ in: inSec }] }
        } else {
          this.worktime.punches.push({ in: inSec })
        }
        this._isClockedIn = true
        await this.persistAndRecompute()
        void requestPersistence()
      },

      async clockOut() {
        if (!this.worktime) return
        const last = this.worktime.punches[this.worktime.punches.length - 1]
        if (last && last.out === undefined) {
          last.out = secondsSinceMidnight(now())
        }
        this._isClockedIn = false
        await this.persistAndRecompute()
      },

      async adjustStart(deltaSeconds: number) {
        if (!this.worktime) return
        const last = this.worktime.punches[this.worktime.punches.length - 1]
        if (!last || last.out !== undefined) return // only when open punch
        this.worktime = adjustStart(this.worktime, deltaSeconds)
        await this.persistAndRecompute()
      },

      async editClockIn(newIn: number) {
        if (!this.worktime) return
        this.worktime = setFirstPunchIn(this.worktime, newIn)
        await this.persistAndRecompute()
      },

      async setSettings(patch: Partial<Settings>) {
        if (!this.settings) return
        this.settings = applySettingsPatch(this.settings, patch)
        await putSettings(this.settings)
      },

      async persistAndRecompute() {
        if (!this.worktime) return
        this.now = now()
        await putWorktime(JSON.parse(JSON.stringify(this.worktime)))
      },

      async checkRollover() {
        if (!this.worktime) return
        if (isExpired(this.worktime.date, new Date(this.now))) {
          await this.reset()
        }
      },

      async reset() {
        await clearWorktime()
        this.worktime = null
        this._isClockedIn = false
      },

      async onVisible() {
        this.now = now()
        if (this.worktime) {
          await this.persistAndRecompute()
        }
        await this.checkRollover()
      },
    },
  })
  ```
- **Dependencies:** WP8-T1, WP8-T3, WP8-T4, WP8-T5, WP8-T6, WP8-T7, WP8-T8.
- **Acceptance criteria:**
  - Store initializes: loads settings (with defaults) and worktime.
  - `clockIn`/`clockOut` append/close punches.
  - `adjustStart` and `editClockIn` mutate punches and persist.
  - `reset` clears worktime.
  - `setSettings` patches and persists.
  - Getters reflect recompute output.
  - `checkRollover` clears worktime when date changes.
  - `onVisible` re-syncs now and recomputes.
- **V&V:** Store tests (WP8-T10) cover all criteria.
- **Pitfalls:**
  - `now` in state is epoch-ms (for Vue reactive tick). `secondsSinceMidnight` converts it.
  - `isExpired` needs the second argument as a Date; pass `new Date(this.now)`.
  - The store no longer calls `recomputeBreaks` in `persistAndRecompute` — it just persists the raw punches. Recomputation happens in the getter.
  - `requestPersistence` is triggered on first `clockIn` (module-level flag, same pattern as before).

---

## WP8-T10 — Store tests

- **Goal:** Comprehensive tests for the rewritten store.
- **Files:** `src/stores/clock.test.ts`.
- **Approach:** Use `setActivePinia(createPinia())` in `beforeEach`, mock the clock with `setClock(() => fixedNow)`.
  Test cases:
  - **Boot, no settings in IDB:** after `init()`, settings are `DEFAULT_SETTINGS`, persisted.
  - **Boot with existing settings:** after `init()`, settings are the stored ones.
  - **Boot, empty worktime:** `worktime` is null, `viewState` is `clock-in`.
  - **clockIn:** creates worktime with one punch, `_isClockedIn` true.
  - **clockIn when clocked in:** appends second punch (should it? — decide: clockIn when already running is a no-op or appends? Follow existing: if an open punch exists, clockIn is a no-op).
  - **clockOut:** closes the open punch, `_isClockedIn` false.
  - **clockIn after clockOut:** appends a new punch.
  - **adjustStart(300):** first punch in moves earlier by 300s.
  - **adjustStart when no open punch:** no-op.
  - **editClockIn:** first punch in changes.
  - **reset:** worktime cleared, null in store.
  - **setSettings:** patches and persists; cascade-disable.
  - **getters:** `workedMs`, `displayMs`, `breakState`, `breakEndsAt`, `viewState` return correct values.
  - **checkRollover:** clear worktime when date mismatches.
  - **onVisible:** updates `now`.
  - **Persistence:** after each mutation, IDB matches store state.
- **Dependencies:** WP8-T9.
- **Acceptance criteria:**
  - All test cases pass.
- **V&V:** `pnpm test -- src/stores/clock.test.ts`.

---

## WP8-T11 — Debug API

- **Goal:** Install `window.__clocked` with getters and mutation methods that write through to real IDB.
- **Files:** `src/debug/api.ts`, `src/debug/global.d.ts`, `src/debug/api.test.ts`. Install from `src/main.ts`.
- **Approach:**

  **`src/debug/api.ts`:**
  ```ts
  import type { Settings } from '@/domain/types'
  import { now, setClock } from '@/domain/clock'
  import { todayString, secondsSinceMidnight } from '@/domain/date'

  export function installDebugApi(store: ReturnType<typeof useClockStore>) {
    const api = {
      help: () => console.table([ /* method descriptions */ ]),

      get state() {
        return {
          settings: store.settings,
          worktime: store.worktime,
          now: store.now,
          worked: store.workedMs,
          display: store.displayMs,
          breakState: store.breakState,
          breakEndsAt: store.breakEndsAt,
          viewState: store.viewState.kind,
          targetReached: store.computed.targetReached,
          limitReached: store.computed.limitReached,
        }
      },

      get settings() { return store.settings },

      setSettings: (patch: Partial<Settings>) => store.setSettings(patch),
      resetSettings: async () => { await store.setSettings(DEFAULT_SETTINGS) },

      get worktime() { return store.worktime },

      punchIn: (sec?: number) => store.clockIn(sec ?? secondsSinceMidnight(now())),
      punchOut: () => store.clockOut(),
      setPunches: async (punches: Array<{ in: number; out?: number }>) => {
        store.worktime = { date: todayString(new Date(now())), punches }
        const last = punches[punches.length - 1]
        store._isClockedIn = !!(last && last.out === undefined)
        await store.persistAndRecompute()
      },
      clear: () => store.reset(),

      tickTo: (sec: number) => {
        const base = new Date()
        base.setHours(0, 0, 0, 0)
        setClock(() => base.getTime() + sec * 1000)
        store.now = now()
      },
      tickForward: (sec: number) => {
        api.tickTo(secondsSinceMidnight(now()) + sec)
      },
      useRealClock: () => setClock(null),

      simulateMidnight: async () => {
        // Set clock to 23:59:59 and then advance 2s so we cross midnight
        const fakeNow = new Date()
        fakeNow.setHours(23, 59, 59, 0)
        setClock(() => fakeNow.getTime())
        store.now = now()
        await store.checkRollover()
        // Advance past midnight
        fakeNow.setTime(fakeNow.getTime() + 2000)
        store.now = now()
        await store.checkRollover()
      },
    }
    ;(window as any).__clocked = api
  }
  ```

  **`src/debug/global.d.ts`:**
  ```ts
  import type { Settings, Worktime } from '@/domain/types'

  declare global {
    interface Window {
      __clocked: {
        help(): void
        readonly state: { … }
        readonly settings: Settings | null
        setSettings(patch: Partial<Settings>): Promise<void>
        resetSettings(): Promise<void>
        readonly worktime: Worktime | null
        punchIn(sec?: number): Promise<void>
        punchOut(): Promise<void>
        setPunches(punches: Array<{ in: number; out?: number }>): Promise<void>
        clear(): Promise<void>
        tickTo(sec: number): void
        tickForward(sec: number): void
        useRealClock(): void
        simulateMidnight(): Promise<void>
      }
    }
  }
  export {}
  ```

  **Install in `src/main.ts`:**
  ```ts
  import { installDebugApi } from './debug/api'
  // after creating pinia and app:
  const store = useClockStore()
  installDebugApi(store)
  ```

  **Test cases (`api.test.ts`):**
  - `__clocked.setSettings({break1_enabled: false})` cascade-disables break2.
  - `__clocked.setPunches([{in: 0}])` → worktime stores the punch, _isClockedIn true.
  - `__clocked.tickTo(36000)` → `state.now` returns a time around 10:00 (epoch-ms).
  - `__clocked.simulateMidnight()` → worktime cleared, `state.viewState` is `'clock-in'`.
  - `__clocked.state` returns all fields without throwing.
- **Dependencies:** WP8-T9, WP8-T3, WP8-T1.
- **Acceptance criteria:**
  - All tests pass.
  - `pnpm typecheck` clean.
  - In `pnpm dev`, open console → `window.__clocked.help()` works.
- **V&V:** `pnpm test -- src/debug/` then `pnpm dev` manual console check.
- **Pitfalls:**
  - `simulateMidnight` must advance the mock clock in two steps: first to 23:59:59, call checkRollover, then advance past midnight, call checkRollover again. This triggers the rollover logic in the store.
  - `tickTo` and `tickForward` must also update `store.now` so Vue getters re-evaluate.
  - The `state` getter returns a plain object, not a reactive proxy — fine for console use.
  - `global.d.ts` needs `export {}` to make it a module, otherwise the `declare global` won't augment `Window`.

---

## WP8-T12 — UI component alignment

- **Goal:** Ensure existing UI components work with the new getter semantics (seconds→ms conversion in store, break state names change from `'break30'`|`'break15'` to `'break1'`|`'break2'`).
- **Files:** `src/App.vue`, `src/components/ClockInView.vue`, `src/components/RunningView.vue`, `src/components/BreakOverlay.vue`, and their tests.
- **Approach:**
  - No structural changes. The component layer already consumes `store.displayMs`, `store.breakState`, `store.breakEndsAt`, `store.viewState` — all of which continue to exist with the same types.
  - Update `ClockInView.test.ts`: clock-in now passes `secondsSinceMidnight`-compatible times. Adjust mock `Date.now` expectations.
  - Update `RunningView.test.ts`: `adjustStart` now takes seconds not ms. The `+1min` button passes `60`, etc.
  - Update `BreakOverlay.test.ts`: `breakState` is now `'break1'`|`'break2'` instead of `'break30'`|`'break15'`. Update test assertions.
  - In `App.vue` and components, the `store.init()` → tick → view-switching flow is unchanged.
- **Dependencies:** WP8-T9.
- **Acceptance criteria:**
  - All component tests pass.
  - `pnpm dev` shows the app working with the new data model.
- **V&V:** `pnpm test -- src/components/` then `pnpm dev`.
- **Pitfalls:**
  - The `BreakOverlay` still checks `breakState === 'break1' || breakState === 'break2'`. Update any hardcoded references to `'break30'`/`'break15'`.
  - The `+Nmin` buttons in `RunningView` now pass `delta * 60` instead of `delta * 60_000`. The component wrapper `store.adjustStart(N * 60)` handles the conversion.
  - `ClockInView`'s `adjust(minutes)` function calls `store.clockIn(secondsSinceMidnight(now()) - minutes * 60)` — adjust the math.

---

## End of WP8

Once WP8-T12 passes, the app runs on the new in/out-punch + settings model with a fully functional console debug API. The existing UI surfaces (clock-in, clock-out, running, break overlay, edit, reset) all continue to work. Settings `daily_target`/`daily_limit` are stored but not yet wired into the UI.
