# WP11 — Calendar & historic data archive

Goal: stop discarding today's punch data at midnight; archive it as raw `Worktime` records (date + punches) into a new `history` object store keyed by `YYYY-MM-DD`. Add a calendar icon in the top bar (next to the gear) that opens a calendar dialog. The calendar shows the last 4 calendar weeks (Mon–Sun) including the current week; a green dot marks any day with clock-in/out data. Clicking a day shows the full `recompute()` segment list (work / gap / mandatory-break) for that day below the grid. The dialog is fully scrollable; the app behind it is scroll-locked while any dialog is visible. Add a "Delete historic data" button to `SettingsDialog` (with two-click confirm) that wipes the entire `history` store.

Scope of stored data: the existing `Worktime` type (`{date: string, punches: Array<{in: number, out?: number}>}`) is reused as-is for history records — it contains only raw punch-in/punch-out events and no aggregates. All derived values (worked, breaks, segments) are recomputed at view time from the stored punches + the current settings, so settings changes retroactively affect how historic days are displayed.

**Strict order:** T1 → T2 → ... → T10.

---

## WP11-T1 — Date helpers for week alignment

- **Goal:** pure functions for the Monday-based weekday index, the 4-calendar-week window, day arithmetic, and the date-string key builder.
- **Files (edit):** `src/domain/date.ts`, `src/domain/date.test.ts`.
- **Approach:** add to `date.ts`:
  ```ts
  export function mondayBasedWeekday(d: Date): number {
    const js = d.getDay()
    return (js + 6) % 7
  }

  export function startOfWeekMonday(d: Date): Date {
    const out = new Date(d)
    out.setHours(0, 0, 0, 0)
    out.setDate(out.getDate() - mondayBasedWeekday(d))
    return out
  }

  export function lastFourWeeksRange(today: Date): { start: Date; end: Date } {
    const thisMonday = startOfWeekMonday(today)
    const start = new Date(thisMonday)
    start.setDate(start.getDate() - 21)
    const end = new Date(thisMonday)
    end.setDate(end.getDate() + 6)
    return { start, end }
  }

  export function addDays(d: Date, days: number): Date {
    const out = new Date(d)
    out.setDate(out.getDate() + days)
    return out
  }

  export function ymd(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  ```
  - `mondayBasedWeekday`: 0=Mon … 6=Sun → direct column index for the `Mon..Sun` header.
  - `lastFourWeeksRange`: `start` = Monday 3 weeks before today's week; `end` = Sunday of today's week. Exactly 28 days inclusive; always whole Mon–Sun weeks; always contains today.
  - `ymd`: date-string key builder for the `history` store (mirrors `todayString` but parameterised).
  - Note: the final plan skeleton must use `end.getDate() + 6` (Sunday of today's week). A first-draft skeleton with `+ 27` spanned 48 days — caught by the test `covers exactly 28 days inclusive`.
- **Tests:** for each function; `mondayBasedWeekday` (Mon=0, Sun=6, Tue/Sat), `startOfWeekMonday` (mid-week → same-week Monday, Sunday → previous Monday, at local midnight), `lastFourWeeksRange` (known Wed/Mon/Sunday anchors, 27-day diff, contains today), `addDays` (month rollover, no input mutation), `ymd` (zero-padding). Use `new Date(2026, 7, 17, 10, 0)` numeric constructors to avoid string-date timezone pitfalls.
- **Dependencies:** none.
- **Acceptance criteria:** `pnpm typecheck` clean; all tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/domain/date.test.ts`.
- **Pitfalls:** local (not UTC) day semantics everywhere; do not add a Date library.

---

## WP11-T2 — DB schema v3: `history` store + CRUD

- **Goal:** add a third object store `history` (out-of-line keys keyed by `YYYY-MM-DD`); bump DB to version 3; thin CRUD wrappers.
- **Files (edit):** `src/storage/db.ts`. **Files (new):** `src/storage/history.ts`, `src/storage/history.test.ts`.
- **Approach:**
  - `db.ts`: `DB_VERSION = 3`; export `STORE_HISTORY = 'history'`; split the upgrade into `oldVersion < 2` (drop `entries`, create `settings`/`worktime`) and `oldVersion < 3` (create `history`). Guard each with `contains` so fresh installs (oldVersion 0) run both blocks.
  - `history.ts`:
    ```ts
    export async function getHistoryDay(date: string): Promise<Worktime | null>
    export async function putHistoryDay(worktime: Worktime): Promise<void>  // key = worktime.date
    export async function deleteHistoryDay(date: string): Promise<void>
    export async function getAllHistory(): Promise<Worktime[]>
    export async function getHistoryRange(startYMD, endYMD): Promise<Record<string, Worktime>>  // IDBKeyRange.bound
    export async function clearHistory(): Promise<void>  // db.clear(STORE_HISTORY)
    ```
  - Keyed by `worktime.date`; the archive call passes the original record as-is. `getHistoryRange` is a single batched read. Reuse the existing `Worktime` type — no parallel types, no conversion.
- **Tests:** empty DB null; round-trip; overwrite same date; delete; getAll array; range inclusivity (both bounds); clear empties. `beforeEach` clears history.
- **Dependencies:** none.
- **Acceptance criteria:** typecheck clean; all tests pass; existing storage tests still pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/storage/history.test.ts src/storage/persist.test.ts`.
- **Pitfalls:** `IDBKeyRange.bound` is inclusive both ends; `db.clear` empties but keeps the store; the v3 upgrade must not touch `settings`/`worktime`; do not close open punches in storage (that is the store's job in T3).

---

## WP11-T3 — Store: archive-on-rollover + history actions

- **Goal:** `reset()` archives the current worktime before clearing (closing any open punch at `out = 86399`); new actions `loadHistoryRange(start, end)` and `clearHistory()`; new state `historyCache`.
- **Files (edit):** `src/stores/clock.ts`, `src/stores/clock.test.ts`.
- **Approach:**
  - state: add `historyCache: null as Record<string, Worktime> | null`.
  - `reset()`:
    ```ts
    if (this.worktime && this.worktime.punches.length > 0) {
      const archived = JSON.parse(JSON.stringify(this.worktime)) as Worktime
      const last = archived.punches[archived.punches.length - 1]
      if (last && last.out === undefined) last.out = 86399
      await putHistoryDay(archived)
    }
    await clearWorktime()
    this.worktime = null
    this._isClockedIn = false
    ```
  - `loadHistoryRange(start: Date, end: Date)`: `getHistoryRange(ymd(start), ymd(end))`, merge today's worktime if it has punches, set `historyCache`.
  - `clearHistory()`: `await clearHistory()` (storage), set `historyCache = {}`.
- **Tests:** archive on rollover (closed punch deep-equal); open punch closed at 86399; no archive when empty; consecutive days; `loadHistoryRange` populates and merges today; today not merged when empty/null; `clearHistory` wipes store + cache. Update `beforeEach` to clear history. Keep the existing `checkRollover` assertions intact.
- **Dependencies:** WP11-T1, WP11-T2.
- **Acceptance criteria:** typecheck clean; all store tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/stores/clock.test.ts`.
- **Pitfalls:** the existing `checkRollover` test mutates `store.worktime.date` then expects `null` — extend it, don't break it. For the consecutive-days test, the mock clock must advance to the next day before the second rollover, otherwise `isExpired` never fires. Deep-copy before archiving (aliasing). `historyCache` is not auto-refreshed on tick; the dialog overlays today live (T8).

---

## WP11-T4 — Debug API: `getHistory()` and `clearHistory()`

- **Goal:** expose `window.__clocked.getHistory()` / `clearHistory()`; update `help()`; `simulateMidnight()` now exercises the archive path automatically.
- **Files (edit):** `src/debug/api.ts`, `src/debug/global.d.ts`, `src/debug/api.test.ts`.
- **Approach:** `getHistory` returns `getAllHistory()`; `clearHistory` calls `store.clearHistory()`; add both to the `Window['__clocked']` interface and to `help()`.
- **Tests:** empty → `[]`; `simulateMidnight` archives the day (dynamic expected date via the mock clock); open punch archived at 86399 on `clear()`; `clearHistory` wipes. Update `beforeEach` to clear history.
- **Dependencies:** WP11-T2, WP11-T3.
- **Acceptance criteria:** typecheck clean; all debug API tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/debug/api.test.ts`.
- **Pitfalls:** `simulateMidnight`'s archived date derives from the mock clock's "today" at `setPunches` time — compute the expected date dynamically, don't hardcode.

---

## WP11-T5 — Scroll-lock composable

- **Goal:** lock body scroll while any modal dialog is mounted; apply to Settings, EditTimes, and Calendar.
- **Files (new):** `src/components/ui/useScrollLock.ts`, `src/components/ui/useScrollLock.test.ts`. **Files (edit):** `SettingsDialog.vue`, `EditTimesDialog.vue`.
- **Approach:**
  ```ts
  export function useScrollLock(): void {
    let prev: string | null = null
    onMounted(() => {
      if (typeof document === 'undefined') return
      prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    })
    onBeforeUnmount(() => {
      if (typeof document === 'undefined') return
      if (prev === null) document.body.style.removeProperty('overflow')
      else document.body.style.overflow = prev
    })
  }
  ```
  Call `useScrollLock()` at the top of each dialog's `<script setup>`.
- **Tests:** lock on mount, restore on unmount, restore a previous inline value. Do **not** test simultaneous-lock nesting (the naive save/restore restores the value captured at its own mount — acceptable because only one dialog is ever visible).
- **Dependencies:** none.
- **Acceptance criteria:** typecheck clean; tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/components/ui/useScrollLock.test.ts`.
- **Pitfalls:** only call inside `setup()`; happy-dom honours `style.overflow`. iOS Safari may still touch-scroll — documented, `position: fixed` fallback deferred.

---

## WP11-T6 — `CalendarGrid` component

- **Goal:** 28-cell (4×7) grid, `Mon..Sun` header, green dot on days with data, today outlined, selected highlighted, `select` emitted.
- **Files (new):** `src/components/CalendarGrid.vue`, `src/components/CalendarGrid.test.ts`.
- **Approach:** props `today: Date`, `history: Record<string, Worktime>`, `selectedDate: string | null`; emits `select: [ymd: string]`. Compute 28 cells via `lastFourWeeksRange` + `addDays`. Cells are `<button>`s with `aria-label = ymd`, `aria-pressed` for selected. Green dot = `span` with `style="background-color: var(--color-work)"` when `history[ymd]?.punches?.length`.
- **Tests:** 28 cells + header; 2 dots for 2 data days; 0 dots empty; today border class; selected class + aria-pressed + emitted YMD; first/last cell labels match the 4-week window.
- **Dependencies:** WP11-T1.
- **Acceptance criteria:** typecheck clean; tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/components/CalendarGrid.test.ts`.
- **Pitfalls:** always exactly 28 cells; previous/next-month day-of-month numbers render naturally; no month name in the grid.

---

## WP11-T7 — `DayEventList` component

- **Goal:** render the full `recompute()` segments for a day with start/end `HH:MM`, duration, and daily totals.
- **Files (new):** `src/components/DayEventList.vue`, `src/components/DayEventList.test.ts`.
- **Approach:** props `worktime: Worktime | null`, `settings: Settings | null`, `nowSec: number` (seconds-since-midnight, **not** epoch-ms). Compute `recompute(props.worktime.punches, props.settings, props.nowSec)`; map `segments` to rows (`secToTimeInput` for labels, `formatHHMM((endSec - startSec) * 1000)` for durations). Total worked = `workedSeconds * 1000`, breaks = `breakSeconds * 1000`. Row left-border colour per type (`border-l-work` / `border-l-gap` / `border-l-break`). Empty day → "No events for this day.".
- **Tests:** null/empty message; closed punch → `Work`, `08:00 – 09:00`, `01:00`; open punch live end; mandatory-break at 7h (`in:0`, `nowSec:25200` → Break + `06:30`); multi-punch day has Gap + Work.
- **Dependencies:** WP11-T1 (format helpers exist in `src/domain/format.ts`).
- **Acceptance criteria:** typecheck clean; tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/components/DayEventList.test.ts`.
- **Pitfalls:** `recompute` returns `endSec` always defined (open punch → `nowSec`). Pass seconds directly; do not round-trip through epoch-ms + `secondsSinceMidnight` (timezone-fragile — caught when a test showed 11:00 instead of 10:00).

---

## WP11-T8 — `CalendarDialog` component

- **Goal:** modal hosting `CalendarGrid` + `DayEventList`, styled like `SettingsDialog`, internal scroll, body scroll-lock.
- **Files (new):** `src/components/CalendarDialog.vue`, `src/components/CalendarDialog.test.ts`.
- **Approach:**
  - `useScrollLock()`; `today` computed from `store.now`; `selectedDate` defaults to today's YMD; `onMounted` calls `store.loadHistoryRange(range.start, range.end)`.
  - `history` computed overlays today's live worktime onto `store.historyCache` (so live punch changes propagate).
  - `selectedWorktime` = `history[selectedDate] ?? null`; `nowSec` = live `secondsSinceMidnight(store.now)` for today else `86399`.
  - Shell: `fixed inset-0 z-50`, backdrop `@click.self="emit('close')"`, panel `max-h-[85dvh] flex flex-col`, header `shrink-0`, body `overflow-y-auto`.
- **Tests:** loadHistoryRange called on mount; renders grid (29 buttons = 28 cells + close); selecting a history day shows its segments; no-data day shows message; today merged live shows open-punch work; backdrop and × close; body scroll locked then restored.
- **Dependencies:** WP11-T3, WP11-T5, WP11-T6, WP11-T7.
- **Acceptance criteria:** typecheck clean; tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/components/CalendarDialog.test.ts`.
- **Pitfalls:** use the same pinia instance for the store mutations and the mount plugin (a fresh `createPinia()` in the plugin isolates the component from the mutated store). Use `max-h-[85dvh]` not `85vh`.

---

## WP11-T9 — App header wiring + Settings delete-history button

- **Goal:** calendar icon button in the header between the date label and the gear; open `CalendarDialog`; "Delete historic data" button in `SettingsDialog` with two-click confirm.
- **Files (edit):** `src/App.vue`, `src/App.test.ts`, `src/components/SettingsDialog.vue`, `src/components/SettingsDialog.test.ts`.
- **Approach:**
  - `App.vue`: `calendarOpen` ref; calendar icon button (inline SVG, `aria-label="Calendar"`, `:disabled="store.loadStatus !== 'ready'"`); render `<CalendarDialog v-if="calendarOpen" @close="calendarOpen = false" />` beside `SettingsDialog`.
  - `SettingsDialog.vue`: `confirmDelete` ref reset in `onBeforeUnmount`; `onDeleteHistory()` toggles confirm then calls `store.clearHistory()`; footer button before Cancel with text `Delete historic data` / `Click again to confirm`.
- **Tests:** App — calendar button opens the dialog; Settings — two-click calls `clearHistory` exactly once; confirm state resets on remount.
- **Dependencies:** WP11-T3, WP11-T8.
- **Acceptance criteria:** typecheck clean; tests pass.
- **V&V:** `pnpm typecheck && pnpm test -- src/App.test.ts src/components/SettingsDialog.test.ts`.
- **Pitfalls:** no native `window.confirm()` (design language). Reset confirm state on unmount. Existing `findButton` helper matches by text — new button texts are additive.

---

## WP11-T10 — Documentation + Firefox MCP V&V walkthrough

- **Goal:** record the capability and constraints; run a scripted Firefox MCP verification pass.
- **Files (edit):** `doc/decisions.md` (ADRs 030–034), `doc/architecture.md` (history store, calendar dialog, components diagram, debug API), `doc/test-vnv-strategy.md` (test layers 4/5/6, manual items 13–14, debug walkthrough), `doc/plan/README.md` (file index, total ~91), `doc/plan/11-calendar.md` (this file).
- **Approach:** append the ADRs (numbered after the existing highest, ADR-029); update architecture storage/data-model/rollover/UI sections; extend the V&V checklist; drop this WP into the plan dir.
- **Firefox MCP walkthrough** (run after `pnpm preview`):
  1. Navigate to `http://localhost:4173/`; wait for load.
  2. Seed + archive: `window.__clocked.setPunches([{in: 28800, out: 32400}])`, then `simulateMidnight()`; assert `getHistory()` length 1.
  3. Screenshot baseline; open the calendar via the `aria-label="Calendar"` button (snapshot → click by UID).
  4. Screenshot the dialog; assert `document.body.style.overflow === 'hidden'`.
  5. Click a dotted day; screenshot the event list; assert text contains `Work` and `Total worked`.
  6. Seed today's live punch; click today; screenshot; verify live open-punch work segment.
  7. Close via ×; assert overflow restored.
  8. Open Settings; click "Delete historic data" twice; assert `getHistory()` returns `[]`.
  9. Reopen calendar; verify dots gone.
  10. Set viewport 390×844; reopen calendar; verify no horizontal overflow.
  11. Final green sweep: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
- **Dependencies:** WP11-T1 through T9.
- **Acceptance criteria:** docs consistent; Firefox walkthrough completes; full command chain green.
- **V&V:** the commands + the walkthrough + manual device checks (real PWA install, screen-lock timer survival, offline launch, iOS touch-scroll).
- **Pitfalls:** find the real next ADR number before writing (do not guess); the DB `history` store contains the archived date under the *previous* day's YMD after `simulateMidnight`; use `__clocked.useRealClock()` or compute offsets relative to real `Date.now()` when the mock clock is active.

---

## Summary table

| Task | Files touched | New | Depends on |
| --- | --- | --- | --- |
| T1 — Date helpers | `src/domain/date.ts`, `src/domain/date.test.ts` | 5 functions + tests | — |
| T2 — DB v3 + history CRUD | `src/storage/db.ts`, `src/storage/history.ts`, `src/storage/history.test.ts` | store + module + tests | — |
| T3 — Store archive + history actions | `src/stores/clock.ts`, `src/stores/clock.test.ts` | edit + tests | T1, T2 |
| T4 — Debug API history methods | `src/debug/api.ts`, `src/debug/global.d.ts`, `src/debug/api.test.ts` | edits + tests | T2, T3 |
| T5 — Scroll-lock composable | `src/components/ui/useScrollLock.ts`, `useScrollLock.test.ts`, `SettingsDialog.vue`, `EditTimesDialog.vue` | new + edits | — |
| T6 — `CalendarGrid` | `src/components/CalendarGrid.vue`, `CalendarGrid.test.ts` | new | T1 |
| T7 — `DayEventList` | `src/components/DayEventList.vue`, `DayEventList.test.ts` | new | T1 |
| T8 — `CalendarDialog` | `src/components/CalendarDialog.vue`, `CalendarDialog.test.ts` | new | T3, T5, T6, T7 |
| T9 — App header + Settings button | `src/App.vue`, `App.test.ts`, `SettingsDialog.vue`, `SettingsDialog.test.ts` | edits | T3, T8 |
| T10 — Docs + Firefox MCP V&V | `doc/decisions.md`, `doc/architecture.md`, `doc/test-vnv-strategy.md`, `doc/plan/README.md`, `doc/plan/11-calendar.md` | edits | T1–T9 |

**Total: 10 tasks.**