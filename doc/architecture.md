# Architecture

## Components

```
┌──────────────────────────────────────────────┐
│  UI (Vue 3, vanilla TS, no SFC-only)          │
│   - ClockInView    (clock-in button + worked)  │
│   - RunningView    (elapsed HH:MM, status,     │
│                     clock-out, mandatory break) │
│   - SettingsDialog (gear icon, break config)   │
│   - EditTimesDialog (click Timeline, edit any  │
│     in/out via OS time picker)                 │
│   - StatsGrid / DailyTargetBar / Timeline      │
│   - BreakBanner / MilestoneHint                │
│   - ui/NumberInput / ui/Toggle                 │
└───────────────┬──────────────────────────────┘
                │  reads / writes
┌───────────────▼──────────────────────────────┐
│  Pinia store (single source of truth)         │
│   - today's worktime (in/out punches)         │
│   - settings (persistent key-value)           │
│   - getters: workedMs, segments, breakMs,     │
│     remainingMs, overtimeMs, workPercent,     │
│     daySpanMs, nextMilestone                  │
│   - recompute: derives segments (work/gap/    │
│     break) from punches + settings, injects   │
│     mandatory pauses                          │
└───────────────┬──────────────────────────────┘
                │  persists
┌───────────────▼──────────────────────────────┐
│  Storage layer (idb wrapper on IndexedDB)     │
│   - "settings" object store (key 'settings')  │
│   - "worktime" object store (key 'worktime')  │
└───────────────────────────────────────────────┘
                │  developer debug (always on)
┌───────────────▼──────────────────────────────┐
│  Debug API (window.__clocked)                 │
│   - injectable clock (tickTo/tickForward)     │
│   - setPunches, setSettings, simulateMidnight │
│   - writes through to real IDB                │
└───────────────────────────────────────────────┘
```

No router, no backend, no network calls at runtime. Single SPA bundle served from root; service worker caches the app shell.

## Data model

### IndexedDB stores (DB `clocked`, version 2)

Two object stores, single out-of-line-key record each:

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
interface Worktime {
  date: string                         // 'YYYY-MM-DD', local day of the record
  punches: Array<{ in: number; out?: number }>
}
```

- `date` is the local calendar day when the record was created (used for rollover detection).
- `in` / `out` are **seconds since midnight** of that local day.
- An open punch has `out === undefined` (the user is currently clocked in).
- New punches are appended at the end.
- On midnight rollover, the record is cleared (deleted).

### Day boundary

- "Today" = local calendar day. Compare the persisted worktime date against the current local date.
- On app focus / visibility change / tick: if the worktime record is from a previous day, clear it and reset to the clock-in view.

### Why in/out punches (not segments)

- Simpler mental model: the user clocks in and out; each pair is one session.
- Breaks are **auto-derived** from gaps between punches and configurable threshold settings — they are not stored explicitly.
- Worked time = Σ(out − in) for each closed punch, minus auto-derived break time.
- The `Recomputed` type (returned by `recompute()`) includes a `segments: DerivedSegment[]` array for UI rendering (timeline strip, stats grid). Each segment is typed `'work'`, `'gap-break'`, or `'mandatory-break'` and carries a start/end seconds-since-midnight. Segments are not stored — they are derived on every read.

## Break derivation algorithm

Input: `punches` (in/out seconds-since-midnight) + `settings` + `nowSeconds` (seconds since midnight).

1. Compute `workedGross = Σ(out_i − in_i)` over closed punches; an open punch counts `now − in`.
2. Compute gaps = `in_{i+1} − out_i` between consecutive punches.
3. **Gap classification (per-break, ordered):**
   - Walk gaps chronologically.
   - A gap satisfies **break1** iff `gap > break1_duration`. The first `break1_duration` of that gap counts as break1; the remainder is "clocked out" (neither work nor break).
   - After break1 is satisfied (by gap or by an elapsed mandatory pause), a later gap satisfies **break2** iff `gap > break2_duration`. The first `break2_duration` of that gap counts as break2; remainder is "clocked out".
   - A single very long gap (`> break1_duration + break2_duration`) satisfies both breaks in one pass.
   - Short gaps (`<=` relevant break duration) do not satisfy any break; they remain `gap-break` segments but contribute 0 to `breakSeconds`.
4. **Mandatory pause budget:** For each enabled break NOT satisfied by a gap, a mandatory pause of that break's full duration may be injected at its trigger point (subject to live/elapsed rule below).
5. **Walk punches** accumulating `workedElapsed` (work seconds, excluding gaps and mandatory pauses).
   - When `workedElapsed` crosses `break1_trigger` and break1 not gap-satisfied:
     - Insert `mandatory-break` segment of `break1_duration` at the trigger second.
     - If `nowSec < trigger + break1_duration` → **live**: `breakState='break1'`, `breakEndsAtMs` set, exit walk.
     - Else (`nowSec >= trigger + break1_duration`) → **elapsed**: `breakState='running'`, continue walk so break2 can be evaluated.
   - When `workedElapsed` crosses `break2_trigger` (after break1 done) and break2 not gap-satisfied:
     - Same live/elapsed logic for break2.
6. `breakSeconds = sum of consumed gap portions + sum of mandatory pause durations (live or elapsed)`.
   `workedSeconds = max(0, workedGross − breakSeconds)`.
7. `displaySeconds = workedSeconds` (breaks excluded).

### State machine

```
running --worked>=break1_trigger--> break1 --duration elapsed--> running --worked>=break2_trigger--> break2 --duration elapsed--> running
```

Breaks fire exactly once each per day. After break2 is satisfied, no more breaks trigger.

## Runtime flow

### Clock in
1. User taps the rectangular acid-green Clock In button on `ClockInView`.
2. Store appends a new punch `{ in: nowSeconds }` (wall clock).
3. UI switches to `RunningView`.

### Clock out
- Set the last punch's `out = nowSeconds` (open punch closed).
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

- Detected on next tick / visibility change: if the worktime record `date` differs from the current local date, clear worktime and return to `ClockInView`. Previous day is not carried over.

## PWA wiring

- `vite-plugin-pwa` with `autoUpdate` + workbox `generateSW` (app-shell caching only).
- Manifest: name "Clocked", standalone display, icons, theme color (red), maskable icon for Android.
- Register `navigator.storage.persist()` on first user interaction (the first clock-in tap is a natural trigger). Required for iOS to avoid eviction of IndexedDB.
- SW requires `localhost` or HTTPS; test via `pnpm preview`.

## Persistence

- IndexedDB via `idb`, two object stores: `settings` (key `'settings'`) and `worktime` (key `'worktime'`).
- On first boot (no settings record), write `DEFAULT_SETTINGS`.
- Worktime is cleared on midnight rollover.
- No localStorage for entry data (size + eviction risk); localStorage may be used only for ephemeral UI state if needed.

## Developer debug API (always on)

A global `window.__clocked` object provides getters and mutation methods that write through to real IndexedDB. See `doc/plan/08-restructure-storage.md` for the full API surface. Key features:
- An injectable clock (`src/domain/clock.ts`) lets the debug API set a mock "now" via `tickTo(sec)` / `tickForward(sec)` without touching the real system clock.
- `setPunches([{in, out?}])` overwrites today's punches for testing arbitrary scenarios.
- `simulateMidnight()` forces a rollover check.
