# Architecture

## Components

```
┌──────────────────────────────────────────────┐
│  UI (Vue 3, vanilla TS, no SFC-only)          │
│   - ClockInView    (big red button + adjust)  │
│   - RunningView    (elapsed HH:MM, edit/reset,│
│                     clock-out)                 │
│   - BreakOverlay   (countdown, auto-resume)   │
└───────────────┬──────────────────────────────┘
                │  reads / writes
┌───────────────▼──────────────────────────────┐
│  Pinia store (single source of truth)         │
│   - today's worktime (in/out punches)         │
│   - settings (persistent key-value)           │
│   - selectors: workedSeconds, breakState, …   │
│   - recompute: derives breaks from punches    │
│     + settings, injects mandatory pauses      │
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

## Break derivation algorithm

Input: `punches` (in/out seconds-since-midnight) + `settings` + `nowSeconds` (seconds since midnight).

1. Compute `workedGross = Σ(out_i − in_i)` over closed punches; an open punch counts `now − in`.
2. Compute gaps = `in_{i+1} − out_i` between consecutive punches.
3. For each enabled break `B` (break1 first, then break2; break2 only eligible after break1 is satisfied):
   - When accumulated worked time-so-far crosses `B.trigger`:
     - If a real gap ≥ `B.duration` exists at or before the trigger point, consume that gap as the break (count its duration toward break time, no pause introduced).
     - Otherwise, introduce a **mandatory pause** of `B.duration`. The break state becomes `break1`/`break2`, and `breakEndsAt = triggerWallClock + B.duration` (epoch-ms for the overlay countdown).
   - A disabled break (`*_enabled = false`) is skipped entirely.
4. **Aggregate rule:** if `Σ gaps ≥ sum of enabled break durations`, use all gaps as break time (no mandatory pauses introduced).
5. `breakSeconds = consumed gaps + introduced pauses`; `workedSeconds = workedGross − breakSeconds`.
6. `displaySeconds = workedSeconds` (breaks are excluded).

### State machine

```
running --worked>=break1_trigger--> break1 --duration elapsed--> running --worked>=break2_trigger--> break2 --duration elapsed--> running
```

Breaks fire exactly once each per day. After break2 is satisfied, no more breaks trigger.

## Runtime flow

### Clock in
1. User taps the big red button (or uses a custom time via the OS time picker).
2. Store appends a new punch `{ in: secondsSinceMidnight(chosenTime) }`.
3. UI switches to `RunningView`.

### Clock out
- Set the last punch's `out = secondsSinceMidnight(now())`.
- UI switches back to `ClockInView` with a "clocked out" state and a clock-in button to resume.
- The clocked-out view displays the accumulated worked time (label "Worked today") above the red button, plus a Reset day button.

### Tick
- `setInterval` updates the displayed value every second while the document is visible.
- All time values are read from the **injectable clock** (`src/domain/clock.ts`, default `Date.now()`) to support the debug API's `tickTo`/`tickForward`.
- On `visibilitychange` -> visible: recompute from punches (do **not** rely on the tick having run while hidden — iOS pauses timers).
- Internally all math is in seconds; UI displays `Math.floor(displaySeconds / 3600)` hours and `Math.floor((displaySeconds % 3600) / 60)` minutes -> `HH:MM`.

### Adjustment buttons (+1 / +5 / +10 min)

- These add to worked time by moving the **start of the earliest punch** earlier (decrease `punches[0].in`).
- Implementation: `punches[0].in -= N * 60`.
- After adjustment, the recompute pipeline re-derives break state from scratch.

### Custom time picker

- Opens the OS time picker (`<input type="time">`).
- The picked time is converted to seconds-since-midnight and used as the start of a new punch.

### Edit clock-in after the fact

- User edits the `in` time of the first punch.
- After any mutation, the store **recomputes break eligibility from scratch** (see algorithm above). Breaks may appear, disappear, or shift.

### Mandatory breaks — overlay

When the recompute algorithm introduces a mandatory pause:
- `breakState` becomes `'break1'` or `'break2'`.
- `breakEndsAt` is an epoch-ms timestamp (wall clock when the pause ends).
- The UI shows "Break — NN:NN remaining" counting down from `breakEndsAt - now`.
- Auto-resume when `now >= breakEndsAt` (the recompute returns `breakState = 'running'`).
- Clock-out is **disabled** during a mandatory break — breaks cannot be skipped.

### Reset / midnight rollover

- Manual reset: delete the worktime record, clear in-memory state, return to `ClockInView`.
- Midnight rollover: detected on next tick / visibility; clear worktime, return to `ClockInView`. Previous day is not carried over.

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
