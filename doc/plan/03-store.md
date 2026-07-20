# WP3 — Pinia store

Goal: a single Pinia store `useClockStore` that owns today's entry, exposes derived state via getters, mutates segments via actions, persists to IndexedDB on every change, runs a per-second tick, recomputes on visibility regain, and triggers the midnight rollover.

The store is the only bridge between the UI (WP4) and the domain (WP1) + storage (WP2).

**Strict order:** T1 → T2 → ... → T8.

---

## WP3-T1 — Store skeleton + state shape

- **Goal:** Define the store with its initial state and the loading lifecycle.
- **Files:** `src/stores/clock.ts`.
- **Approach:**
  ```ts
  import { defineStore } from 'pinia'
  import type { Entry, Segment, ClockState, ViewState } from '@/domain/types'

  type LoadStatus = 'idle' | 'loading' | 'ready'

  export const useClockStore = defineStore('clock', {
    state: () => ({
      loadStatus: 'idle' as LoadStatus,
      entry: null as Entry | null,
      now: Date.now(),
    }),
    getters: {
      // filled in WP3-T3
    },
    actions: {
      // filled in WP3-T2
    },
  })
  ```
  Note `now` is part of the state — the tick updates it, and getters derive from `entry + now`. This makes the tick reactive for Vue.
- **Dependencies:** WP1-T1 (types), WP2-T2 (storage).
- **Acceptance criteria:**
  - `useClockStore` is exported and instantiable in a test.
  - Initial state has `loadStatus === 'idle'`, `entry === null`, `now` is a number.
- **V&V:** `pnpm typecheck`.
- **Pitfalls:**
  - Don't use a setup-style store (`defineStore('id', () => { ... })`) unless the rest of the plan is adjusted. The options-API style above is simpler for getters and tests.

---

## WP3-T2 — Core actions: `clockIn`, `clockOut`, `reset`

- **Goal:** The fundamental mutations: start a new work segment, close the current one, delete the entry.
- **Files:** `src/stores/clock.ts`.
- **Approach:**
  ```ts
  import { getEntry, putEntry, deleteEntry, clearAllEntries } from '@/storage/entries'
  import { todayString, isExpired } from '@/domain/date'
  import { recomputeBreaks } from '@/domain/recomputeBreaks'

  // inside actions:
  async function load() {
    this.loadStatus = 'loading'
    const date = todayString(new Date(this.now))
    const entry = await getEntry(date)
    if (entry) {
      this.entry = entry
    }
    this.loadStatus = 'ready'
  }

  async function clockIn(startMs?: number) {
    const start = startMs ?? Date.now()
    const date = todayString(new Date(start))
    if (this.entry && this.entry.date !== date) {
      await this.reset()
    }
    if (!this.entry) {
      this.entry = { date, segments: [{ type: 'work', start }] }
    } else {
      this.entry.segments.push({ type: 'work', start })
    }
    await this.persistAndRecompute()
  }

  async function clockOut() {
    if (!this.entry) return
    const segments = this.entry.segments
    const last = segments[segments.length - 1]
    if (last && last.type === 'work' && last.end === undefined) {
      last.end = Date.now()
    }
    await this.persistAndRecompute()
  }

  async function reset() {
    if (this.entry) {
      await deleteEntry(this.entry.date)
    }
    this.entry = null
  }

  async function persistAndRecompute() {
    if (!this.entry) return
    const result = recomputeBreaks(this.entry.segments, this.now)
    this.entry.segments = result.segments
    await putEntry(this.entry)
  }
  ```
  Note `persistAndRecompute` is the single chokepoint: any mutation flows through it, so segments are always canonical and IndexedDB always matches state.
- **Dependencies:** WP3-T1, WP1-T4, WP2-T2.
- **Acceptance criteria:**
  - `clockIn()` with no entry creates a new entry with one work segment.
  - `clockIn()` while a work segment is open and not expired is a no-op or appends (depending on store logic — see `Pitfalls`).
  - `clockOut()` closes the open segment.
  - `reset()` deletes the entry and clears state.
  - After each mutation, the persisted entry in fake-indexeddb deep-equals the in-memory entry.
- **V&V:** write a small test or rely on WP3-T8 store tests.
- **Pitfalls:**
  - **Clock-in while clocked in:** decide on the behavior. Recommended: if the current open segment is `work`, `clockIn` is a no-op (the user is already clocked in). If the current open segment is `break`, `clockIn` is a no-op (breaks can't be skipped). Only if the last segment is a **closed** work segment (i.e. user previously clocked out) should `clockIn` append a new work segment.
  - Direct mutation of `last.end` works because Pinia state is reactive, but you must call `persistAndRecompute` after.

---

## WP3-T3 — Getters: workedMs, displayMs, breakState, currentView

- **Goal:** Derived state used by the UI.
- **Files:** `src/stores/clock.ts`.
- **Approach:** Add getters:
  ```ts
  getters: {
    recomputeResult(state): ReturnType<typeof recomputeBreaks> {
      if (!state.entry) {
        return { segments: [], state: 'running' as const, workedMs: 0, displayMs: 0 }
      }
      return recomputeBreaks(state.entry.segments, state.now)
    },

    workedMs(): number { return this.recomputeResult.workedMs },
    displayMs(): number { return this.recomputeResult.displayMs },
    breakState(): import('@/domain/types').BreakState {
      return this.recomputeResult.state
    },
    breakEndsAt(): number | undefined { return this.recomputeResult.breakEndsAt },

    currentSegment(state): Segment | null {
      if (!state.entry) return null
      const segs = state.entry.segments
      return segs[segs.length - 1] ?? null
    },

    isClockedIn(state): boolean {
      if (!state.entry) return false
      const last = state.entry.segments[state.entry.segments.length - 1]
      return !!last && last.type === 'work' && last.end === undefined
    },

    isOnBreak(): boolean {
      return this.breakState === 'break30' || this.breakState === 'break15'
    },

    isClockedOut(state): boolean {
      if (!state.entry) return false
      const last = state.entry.segments[state.entry.segments.length - 1]
      return !!last && last.type === 'work' && last.end !== undefined
    },

    viewState(): ViewState {
      if (!this.entry) return { kind: 'clock-in' }
      if (this.isOnBreak) return { kind: 'break' }
      if (this.isClockedOut) return { kind: 'clocked-out' }
      return { kind: 'running' }
    },
  }
  ```
- **Dependencies:** WP3-T1, WP3-T2, WP1-T4.
- **Acceptance criteria:**
  - All getters return the expected values for the four states (no entry, running, on break, clocked out).
  - `viewState` returns the right `ViewState` for each case.
- **V&V:** WP3-T8 store tests.
- **Pitfalls:**
  - The `recomputeResult` getter recomputes on every state access. For our scale (a handful of segments) this is fine. Do not memoize — `now` changes every second and the result must follow.
  - The `ReturnType<typeof recomputeBreaks>` trick imports the type without circular runtime deps.

---

## WP3-T4 — Adjustment and edit actions

- **Goal:** Wire `+1/+5/+10min` and the "edit clock-in time" UI to the domain helpers.
- **Files:** `src/stores/clock.ts`.
- **Approach:**
  ```ts
  import { adjustOpenWorkSegmentStart, setFirstWorkSegmentStart } from '@/domain/adjust'
  import type { AdjustmentMinutes } from '@/domain/adjust'

  async function adjustStart(minutes: AdjustmentMinutes) {
    if (!this.entry) return
    const last = this.entry.segments[this.entry.segments.length - 1]
    if (!last || last.type !== 'work' || last.end !== undefined) return
    this.entry.segments = adjustOpenWorkSegmentStart(this.entry.segments, minutes)
    await this.persistAndRecompute()
  }

  async function editClockIn(newStart: number) {
    if (!this.entry) return
    const first = this.entry.segments[0]
    if (!first || first.type !== 'work') return
    this.entry.segments = setFirstWorkSegmentStart(this.entry.segments, newStart)
    await this.persistAndRecompute()
  }
  ```
- **Dependencies:** WP3-T2, WP1-T5.
- **Acceptance criteria:**
  - `adjustStart(5)` on a running entry moves the open work segment's start earlier by 5 minutes.
  - `adjustStart` while on break or clocked out is a no-op (early return).
  - `editClockIn` updates only the first segment's start; the rest are preserved.
  - After either action, `recomputeBreaks` has been re-run (the persisted entry has canonical segments).
- **V&V:** WP3-T8.
- **Pitfalls:**
  - After `adjustStart`, a break that was previously `running` may now be `break30` (if the shift pushes workedMs past 6h). The `persistAndRecompute` call handles this — verify in tests.

---

## WP3-T5 — Per-second tick

- **Goal:** Update `state.now` once per second while the document is visible, so the elapsed display updates.
- **Files:** `src/stores/clock.ts` (or a separate composable, see Approach).
- **Approach:** Use `@vueuse/core`'s `useIntervalFn`:
  ```ts
  import { useIntervalFn } from '@vueuse/core'

  // inside the store, a non-reactive field for the interval handle:
  // (Pinia options API doesn't easily hold non-reactive refs; use a module-level variable)
  let tickHandle: { pause: () => void; resume: () => void } | null = null

  function startTick(this: ReturnType<typeof useClockStore>) {
    if (tickHandle) return
    tickHandle = useIntervalFn(() => {
      this.now = Date.now()
    }, 1000)
  }

  function stopTick() {
    if (tickHandle) {
      tickHandle.pause()
      tickHandle = null
    }
  }
  ```
  Alternatively, expose `tick()` as an action and call `setInterval` from `App.vue` in WP4. Either works; the `useIntervalFn` approach keeps the store self-contained.
- **Dependencies:** WP3-T1.
- **Acceptance criteria:**
  - When `startTick` is called, `store.now` advances roughly once per second.
  - When `stopTick` is called, `store.now` stops advancing.
  - The tick does not throw when `entry` is null.
- **V&V:** WP3-T8.
- **Pitfalls:**
  - `useIntervalFn` from `@vueuse/core` must be called within a component setup context **or** with the proper scope. If it errors when called from a Pinia action, fall back to plain `setInterval` and clear it in `stopTick`.
  - Pinia's options-API doesn't have a setup context. A cleaner approach: put `startTick`/`stopTick` as plain functions in the store module (not as actions) and have `App.vue` call them in `onMounted`/`onBeforeUnmount`. Pick whatever works.

---

## WP3-T6 — Visibility regain recompute

- **Goal:** When the page becomes visible after being hidden, refresh `now` and recompute state immediately (iOS pauses JS timers in background).
- **Files:** `src/stores/clock.ts` plus a wiring point in `App.vue` (deferred to WP4).
- **Approach:**
  ```ts
  async function onVisible() {
    this.now = Date.now()
    if (this.entry) {
      await this.persistAndRecompute()
    }
    // also check for midnight rollover
    await this.checkRollover()
  }
  ```
  Wire `visibilitychange` in `App.vue` (WP4) → call `store.onVisible()`. For now, just define the action.
- **Dependencies:** WP3-T2.
- **Acceptance criteria:**
  - `onVisible` updates `now` to the current time.
  - If a break was open and has since ended while the page was hidden, `onVisible` closes it and opens a new work segment.
  - `onVisible` is safe to call when `entry` is null.
- **V&V:** WP3-T8.
- **Pitfalls:**
  - Don't rely on the per-second tick for correctness. The tick is cosmetic; `onVisible` is the source of truth on resume.

---

## WP3-T7 — Midnight rollover + persistence-on-boot

- **Goal:** Two lifecycle pieces:
  1. On boot, load today's entry from IndexedDB.
  2. Detect when local-day changes (either at midnight while open, or after being hidden across midnight) and reset.
- **Files:** `src/stores/clock.ts`.
- **Approach:**
  ```ts
  async function init() {
    await this.load()
    this.loadStatus = 'ready'
    this.startTick()
    await this.checkRollover()
  }

  async function checkRollover() {
    if (!this.entry) return
    if (isExpired(this.entry.date, new Date(this.now))) {
      await this.reset()
    }
  }
  ```
  Call `store.init()` from `App.vue`'s `onMounted` (WP4).
- **Dependencies:** WP3-T2, WP3-T6, WP2-T2, WP1-T2.
- **Acceptance criteria:**
  - After `init`, `loadStatus === 'ready'` and (if there was a today entry in IndexedDB) `entry` is populated.
  - If `now` is past local midnight relative to `entry.date`, `checkRollover` deletes the entry.
  - `checkRollover` is a no-op when there is no entry.
- **V&V:** WP3-T8.
- **Pitfalls:**
  - `init` must be idempotent — calling it twice should not load the entry twice or start two ticks.
  - The tick (T5) also calls `checkRollover` implicitly via `now` updating; make the rollover check a part of the recompute pipeline if you want, or call it from the tick.

---

## WP3-T8 — `navigator.storage.persist()` trigger + store tests

- **Goal:** Two final pieces:
  1. Trigger `requestPersistence()` on the first clock-in.
  2. Comprehensive Pinia store tests.
- **Files:** `src/stores/clock.ts`, `src/stores/clock.test.ts`.
- **Approach:** In `clockIn`:
  ```ts
  import { requestPersistence } from '@/storage/persist'

  let persistenceRequested = false

  async function clockIn(startMs?: number) {
    if (!persistenceRequested) {
      persistenceRequested = true
      void requestPersistence() // fire-and-forget
    }
    // ... existing logic
  }
  ```
  Use a module-level flag so persistence is requested at most once per page session.

  Test cases (`clock.test.ts`):
  - **Boot / init:** after `init`, when IndexedDB has an entry for today, `entry` is populated and `loadStatus === 'ready'`.
  - **Boot with empty storage:** after `init`, `entry` is null and `loadStatus === 'ready'`.
  - **clockIn then clockOut:** entry has one work segment, closed.
  - **clockIn twice:** second call is a no-op when already running (or appends if clocked out — see WP3-T2 pitfalls).
  - **adjustStart(5):** open segment's start moves 5min earlier; `recomputeBreaks` reruns.
  - **adjustStart on break:** no-op.
  - **editClockIn:** first segment's start changes; breaks recomputed.
  - **reset:** entry deleted from storage, `entry` null.
  - **onVisible after a break has ended:** open break is closed, new work segment opens, `breakState` becomes `running`.
  - **onVisible with no entry:** no-op, no throw.
  - **checkRollover past midnight:** entry from yesterday is deleted.
  - **Persistence:** after each mutating action, `getEntry(date)` from `fake-indexeddb` returns the same object as the in-memory `entry`.
  - **viewState:** returns the correct `ViewState` for the four cases.
- **Dependencies:** WP3-T1 through WP3-T7.
- **Acceptance criteria:**
  - All listed test cases pass.
  - The persistence flag prevents more than one call to `navigator.storage.persist` per session.
- **V&V:** `pnpm test -- src/stores/clock.test.ts`.
- **Pitfalls:**
  - Mock `Date.now` / inject `now` for tests; do not depend on real wall-clock.
  - Use `setActivePinia(createPinia())` in `beforeEach` for store tests.
  - For the persistence test, mock `requestPersistence` with `vi.spyOn` and assert it was called once.

---

## End of WP3

Once WP3-T8 passes, the store is fully functional. The app still has no UI, but every business rule and persistence flow is implemented and tested. Proceed to `04-ui.md`.
