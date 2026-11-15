# Architecture

## Components

```
┌──────────────────────────────────────────────┐
│  UI (Vue 3, vanilla TS, no SFC-only)          │
│   - ClockInView    (clock-in button + worked)  │
│   - RunningView    (elapsed HH:MM, status,     │
│                     clock-out, mandatory break) │
│   - SettingsDialog (gear icon, break config)   │
│   - CalendarDialog (calendar icon, 4-week grid, │
│     day event list)                            │
│   - EditTimesDialog (day editor: edit, add,    │
│     delete events of any day; OS time picker)  │
│   - FaultyDayView  (today's events don't       │
│     alternate: issue list + Fix times)         │
│   - StatsGrid / DailyTargetBar / Timeline      │
│   - BreakBanner / MilestoneHint                │
│   - ui/NumberInput / ui/Toggle / ui/useScrollLock │
└───────────────┬──────────────────────────────┘
                │  reads / writes
┌───────────────▼──────────────────────────────┐
│  Pinia store (single source of truth)         │
│   - today's worktime (in/out event list)      │
│   - settings (persistent key-value)           │
│   - getters: analysis, isFaulty, workedMs,    │
│     segments, breakMs,                        │
│     remainingMs, overtimeMs, workPercent,     │
│     daySpanMs, nextMilestone                  │
│   - recompute: derives segments (work/gap/    │
│     break) from the punches of a valid event  │
│     list + settings, injects                  │
│     mandatory pauses                          │
└───────────────┬──────────────────────────────┘
                │  persists
┌───────────────▼──────────────────────────────┐
│  Storage layer (idb wrapper on IndexedDB)     │
│   - "settings" object store (key 'settings')  │
│   - "worktime" object store (key 'worktime')  │
│   - "history" object store (key 'YYYY-MM-DD') │
└───────────────────────────────────────────────┘
                │  developer debug (always on)
┌───────────────▼──────────────────────────────┐
│  Debug API (window.__clocked)                 │
│   - injectable clock (tickTo/tickForward)     │
│   - setEvents, setHistoryDay, setSettings,    │
│     simulateMidnight                          │
│   - writes through to real IDB                │
└───────────────────────────────────────────────┘
```

No router, no backend, no network calls at runtime. Single SPA bundle served from root; service worker caches the app shell.

## Data model

### IndexedDB stores (DB `clocked`, version 4)

Three object stores: `settings` (single persistent record), `worktime` (single day record), `history` (archived days).

#### `settings` (key `'settings'`, persistent, not reset at midnight)

```ts
interface Settings {
  daily_target: number        // 28800 (8 h) — reached indicator (no UI yet)
  daily_limit: number         // 36000 (10 h) — hard stop (no UI yet)
  break1_enabled: boolean     // true
  break1_trigger: number      // 21600 (6 h)  — seconds of worked time
  break1_duration: number     // 1800 (30 min)
  break2_enabled: boolean     // true (only when break1_enabled is true)
  break2_trigger: number      // 32400 (9 h)
  break2_duration: number     // 900 (15 min)
}
const DEFAULT_SETTINGS: Settings = { /* values above */ }
```

**Invariant:** `break2_enabled` may only be `true` when `break1_enabled` is `true`. If `break1_enabled` is set to `false`, `break2_enabled` is cascade-disabled to `false`.

#### `worktime` (key `'worktime'`, single day, reset after midnight)

```ts
interface PunchEvent {
  type: 'in' | 'out'
  t: number                            // seconds since local midnight, 0–86399
}
interface Worktime {
  date: string                         // 'YYYY-MM-DD', local day of the record
  events: PunchEvent[]                 // sorted by t; stored order breaks ties
}
```

- `date` is the local calendar day when the record was created (used for rollover detection).
- `t` is **seconds since midnight** of that local day.
- The list is kept sorted by `t`. Clock-in/out append; edits insert at the right place (ADR-036).
- Whether the day is valid is **derived**, never stored (see *Event sequences and faulty days*).
- On midnight rollover, the record is archived to the `history` store (see below) and cleared.

#### Event sequences and faulty days

`analyse(events, { allowOpen })` (`src/domain/events.ts`) classifies a day:

- **valid** — starts with `in` and alternates `in`/`out`. A trailing `in` (still clocked in) is valid only when `allowOpen` is true, i.e. for today. A valid day yields `punches: Array<{ in, out? }>` (the pairs) for `recompute()`.
- **faulty** — anything else, with one issue per offending event: `starts-with-out`, `double-in`, `double-out`, `open-past-day` (a past day ending clocked in), `unsorted` (defensive; the UI keeps lists sorted).

A faulty day is **saved as-is and flagged** (ADR-037): no worked time, breaks or segments; clock-in/out are blocked; `viewState` is `faulty`. The user fixes it in the day editor. An empty event list means no day: today returns to the clock-in view and a past day is deleted from `history`.

#### `history` (key `'YYYY-MM-DD'`, persistent, archived at rollover)

```ts
type HistoryRecord = Worktime          // { date: 'YYYY-MM-DD', events: PunchEvent[] }
```

- Values are raw `Worktime` records (date + events) — **no aggregates**; recompute is at view time with current settings, so settings changes retroactively affect how historic days are displayed.
- On midnight rollover, `reset()` archives today's worktime: a **valid** day that is still open gets an `out` event at 86399 (23:59:59) first; a **faulty** day is archived unchanged. The record is written keyed by its `date`, then the live `worktime` record is cleared.
- Past days can be edited from the calendar (ADR-038) via `store.replaceDayEvents(date, events)`.
- Today's live worktime is overlaid onto the history cache at view time so the calendar shows today's dot and live segments.

### Day boundary

- "Today" = local calendar day. Compare the persisted worktime date against the current local date.
- On app focus / visibility change / tick: if the worktime record is from a previous day, clear it and reset to the clock-in view.

### Why a flat event list (not pairs, not segments)

- It stores exactly what the user did: each clock-in and clock-out is one event (ADR-036). Any sequence — including a faulty one after a deletion — can be stored, and validity is computed.
- Pairs ("punches") are derived from a valid list and only exist in memory, as the input to `recompute()`.
- Breaks are **auto-derived** from gaps between punches and configurable threshold settings — they are not stored explicitly.
- Worked time = Σ(out − in) for each closed punch, minus mandatory pauses injected *during* work. Breaks fitted into a gap do not reduce worked time, because the gap was never worked (ADR-035).
- The `Recomputed` type (returned by `recompute()`) includes a `segments: DerivedSegment[]` array for UI rendering (timeline strip, stats grid). Each segment is typed `'work'`, `'gap-break'`, or `'mandatory-break'` and carries a start/end seconds-since-midnight. Segments are not stored — they are derived on every read.

## Break derivation algorithm

Input: `punches` (in/out pairs derived by `analyse()` from a **valid** event list; faulty days are never recomputed) + `settings` + `nowSeconds` (seconds since midnight).

1. Compute `workedGross = Σ(out_i − in_i)` over closed punches; an open punch counts `now − in`.
2. Compute gaps = `in_{i+1} − out_i` between consecutive punches.
3. **Gap classification (per-break, ordered):**
   - A break only **applies** once the day's worked time reaches its trigger: `workedGross >= break_trigger` (ADR-042). A break that doesn't apply is neither fitted nor injected.
   - Walk gaps chronologically.
   - An applicable **break1** is fitted into the first gap with `gap >= break1_duration` (ADR-028). The first `break1_duration` of that gap becomes a `mandatory-break` segment; the remainder is a neutral `gap`.
   - After break1 is fitted, an applicable **break2** is fitted into the remaining part of that gap or a later gap with `>= break2_duration`.
   - A gap taken **before** the trigger still counts once the trigger is reached (breaks may be taken in advance). Until then the gap is neutral.
   - Gaps that don't fit an applicable break stay neutral `gap` segments and contribute 0 to `breakSeconds`.
4. **Mandatory pause budget:** For each enabled break NOT satisfied by a gap, a mandatory pause of that break's full duration may be injected at its trigger point (subject to live/elapsed rule below).
5. **Walk punches** accumulating `workedElapsed` (work seconds, excluding gaps and mandatory pauses).
   - When `workedElapsed` crosses `break1_trigger` and break1 not gap-satisfied:
     - Insert `mandatory-break` segment of `break1_duration` at the trigger second.
     - If `nowSec < trigger + break1_duration` → **live**: `breakState='break1'`, `breakEndsAtMs` set, exit walk.
     - Else (`nowSec >= trigger + break1_duration`) → **elapsed**: `breakState='running'`, continue walk so break2 can be evaluated.
   - When `workedElapsed` crosses `break2_trigger` (after break1 done) and break2 not gap-satisfied:
     - Same live/elapsed logic for break2.
6. `breakSeconds = sum of gap-fitted break durations + sum of injected mandatory pause durations (live or elapsed)`.
   `workedSeconds = max(0, workedGross − injected mandatory pause durations)` — gap-fitted breaks are **not** subtracted, since gap time is not part of `workedGross` (ADR-035).
7. `displaySeconds = workedSeconds` (breaks excluded).

### State machine

```
running --worked>=break1_trigger--> break1 --duration elapsed--> running --worked>=break2_trigger--> break2 --duration elapsed--> running
```

Breaks fire exactly once each per day. After break2 is satisfied, no more breaks trigger.

## Runtime flow

### Clock in
1. User taps the rectangular acid-green Clock In button on `ClockInView`.
2. Store inserts an event `{ type: 'in', t: nowSeconds }` (wall clock). Blocked while the day is faulty or on a mandatory break.
3. UI switches to `RunningView`.

### Clock out
- Append `{ type: 'out', t: max(nowSeconds, last.t) }` — never before its `in`, even if the device clock went backwards. Blocked while the day is faulty.
- UI switches back to `ClockInView` with a "clocked out" label and a Clock In button to resume.
- The clocked-out view displays accumulated worked time ("Worked today"), stats, daily-target bar, and timeline. No Reset-day button — use `window.__clocked.clear()` in the console for development.

### Tick
- `setInterval` updates the displayed value every 1 s while the document is visible.
- All time values read from the **injectable clock** (`src/domain/clock.ts`, default `Date.now()`) to support the debug API's `tickTo`/`tickForward`.
- On `visibilitychange` -> visible: recompute from punches (do **not** rely on the tick having run while hidden — iOS pauses timers).
- All displays are HH:MM (ADR-006); the sole exception is the mandatory-break countdown banner which shows MM:SS.

### Mandatory breaks — inline banner

When the recompute algorithm introduces a mandatory pause:
- `viewState.kind` becomes `'break'` (break1 or break2).
- The break timer is derived from `breakEndsAt - now()` (epoch-ms diff).
- The inline `BreakBanner` counts down MM:SS; when it reaches zero the state reverts to `running`.
- Clock-out is **allowed** during a mandatory break; it closes the open punch, ends the day, and retains the derived break segment in the timeline. Once clocked out, `viewState` becomes `clocked-out` regardless of any lingering derived break state.

### Midnight rollover

- Detected on app start (`init`) and when the app becomes visible again (`visibilitychange`) — **not** on the 1 s tick. The intended use is the installed PWA on a phone, which is hidden/locked overnight, so the check runs when it is reopened. A desktop browser tab left in the foreground across midnight keeps showing the previous day until it is hidden and shown again or reloaded; this is accepted (ADR-041). If the worktime record `date` differs from the current local date, archive the previous day to the `history` store (a valid open day closed at 23:59:59; a faulty day unchanged) and clear worktime, returning to `ClockInView`.
- `replaceDayEvents` runs the same check before saving, so an edit made after midnight but before the next tick archives yesterday first and writes to the right day.

### Editing a day

- `EditTimesDialog` takes a `date` (default today). It is opened from the Timeline (valid today), from **Fix times** on `FaultyDayView`, and from **Edit day** in the calendar (today and past days, including empty ones; never future days).
- One row per event with an OS time picker and a delete button; an add row (in/out + time) inserts sorted. Rows re-sort when a time change is committed.
- `analyse()` runs live: offending rows are highlighted with the issue text. Saving is **always** allowed; a faulty draft shows "Day will be saved as faulty".
- Save calls `store.replaceDayEvents(date, events)`: events are clamped to 0–86399 and sorted; today writes the live `worktime`, a past date writes `history` and the calendar cache; an empty list removes the day; future dates are ignored.

### Faulty day (main screen)

- `viewState.kind === 'faulty'` renders `FaultyDayView`: "Times need fixing", today's events with the issue on the offending one, no clock buttons, and **Fix times** (opens the editor). The header status dot turns red.

### Calendar dialog

- A calendar icon in the top bar (between the date label and the gear) opens `CalendarDialog`, a modal styled identically to `SettingsDialog`.
- `CalendarGrid` renders the last 4 calendar weeks (Mon–Sun, 28 cells); a green dot marks a valid day with events, a red dot a faulty day (open clock-in counts as valid only for today); today is outlined in grey; the selected day gets an accent (acid-green) border, a light green tint and a bold green number, and is written out above its events (e.g. "Tuesday, 10 Nov 2026").
- Clicking a day renders `DayEventList` below the grid. It opens with a **day summary** — Worked, Breaks, and the balance against `daily_target` (`Overtime +HH:MM`, `Undertime −HH:MM`, `On target`; today while below target shows `Remaining HH:MM` like the main screen; `—` for a faulty day; none for an empty day). Below it, for a valid day, the full `recompute()` segments (work / gap / mandatory-break) with `HH:MM` start/end and durations; for a faulty day, the raw events with issue hints and "totals unavailable". Historic days pass `nowSec = 86399`; today passes the live seconds-since-midnight so an open punch updates live.
- **Edit day** next to the selected date opens the day editor for that date (disabled for future days); the history range is reloaded when it closes.

### Sharing working times (ADR-044)

- The **Share** icon in the calendar header opens `ShareDialog`: presets (This week, Last week, This month, Last month) and From–To date inputs; the default is last week.
- `store.loadDaysForExport(from, to)` reads any range from `history` plus the live day (it does not touch the calendar cache). `buildExport()` (`src/domain/export.ts`) turns it into one row per calendar day with `analyse()` + `recompute()` — status `ok`/`open`/`faulty`/empty — and totals over valid days. The dialog previews worked, breaks, balance and lists faulty days (**Fix** selects the day in the calendar when it is in the grid).
- **Share** builds the CSV (`toCsv`: BOM, `;`, CRLF, raw events per day, TOTAL row), the subject and the mail text (`toMailText`) and calls `shareExport()` (`src/share/share.ts`): Web Share with the file where supported (share sheet → Mail), else download + `mailto:` draft. The dialog closes when shared and shows a hint after the fallback.
- The dialog body scrolls internally (`max-h-[85dvh]`); the app behind is scroll-locked via the `useScrollLock` composable (applied to Settings, EditTimes, and Calendar dialogs).

## PWA wiring

- `vite-plugin-pwa` with `autoUpdate` + workbox `generateSW` (app-shell caching only).
- Manifest: name "Clocked", standalone display, icons, theme color (red), maskable icon for Android.
- Register `navigator.storage.persist()` on first user interaction (the first clock-in tap is a natural trigger). Required for iOS to avoid eviction of IndexedDB.
- SW requires `localhost` or HTTPS; test via `pnpm preview`.

## Persistence

- IndexedDB via `idb`, three object stores: `settings` (key `'settings'`), `worktime` (key `'worktime'`), `history` (key `'YYYY-MM-DD'`).
- **v3 → v4 upgrade** (ADR-039): inside the version-change transaction, every `worktime` and `history` record is rewritten from `{ punches }` to `{ events }` (`src/storage/migrate.ts`). Already-converted records are skipped; on failure the upgrade is aborted and the DB stays at v3.
- On first boot (no settings record), write `DEFAULT_SETTINGS`.
- Worktime is archived to `history` and cleared on midnight rollover.
- No localStorage for entry data (size + eviction risk); localStorage may be used only for ephemeral UI state if needed.

## Developer debug API (always on)

A global `window.__clocked` object provides getters and mutation methods that write through to real IndexedDB. See `doc/plan/08-restructure-storage.md` for the full API surface. Key features:
- An injectable clock (`src/domain/clock.ts`) lets the debug API set a mock "now" via `tickTo(sec)` / `tickForward(sec)` without touching the real system clock.
- `setEvents([{type, t}])` overwrites today's events for testing arbitrary scenarios (faulty sequences allowed); `setHistoryDay(date, events)` writes or (with `[]`) deletes a past day.
- `state.analysis` shows whether today's sequence is valid and lists its issues.
- `seedDemoWeek()` writes five example weekdays before today (one faulty) into history (`src/debug/demo.ts`). The `pnpm demo` build (`VITE_DEMO=1`, port 4176) runs it automatically when the history is empty and shows a "Demo" badge.
- `simulateMidnight()` forces a rollover check.
- `getHistory()` returns all archived records; `clearHistory()` wipes the history store.
