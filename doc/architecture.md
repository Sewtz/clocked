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
│   - today's entry (ordered segments)           │
│   - selectors: workedMs, displayMs, breakState │
└───────────────┬──────────────────────────────┘
                │  persists
┌───────────────▼──────────────────────────────┐
│  Storage layer (idb wrapper on IndexedDB)     │
│   - "entries" object store, key by date       │
└───────────────────────────────────────────────┘
```

No router, no backend, no network calls at runtime. Single SPA bundle served from root; service worker caches the app shell.

## Data model

### Entry (one per local calendar day)

A day is modeled as an **ordered list of segments**. Segments alternate between `work` and `break`; the currently-open segment has `end === undefined`.

```ts
type Segment =
  | { type: 'work';  start: number; end?: number }
  | { type: 'break'; start: number; end?: number; duration: 30 | 15 }; // duration in minutes

interface Entry {
  date: string;        // 'YYYY-MM-DD', local calendar day (primary key)
  segments: Segment[]; // ordered; first is always 'work'
}
```

Only **today's** entry is stored. Previous day's entry is deleted on rollover. No history is kept.

### Why segments (not a single `startEpochMs`)

- Multiple clock-out / clock-in cycles per day produce multiple work segments.
- Mandatory breaks are forced pauses within the day, not just subtractions from a total — they are themselves segments so that the break overlay has a clear start/end to count down.
- Accumulated worked time = sum of `work` segment durations; breaks never contribute to it by construction.

### Day boundary

- "Today" = local calendar day. Compare `entry.date` against the current local date string.
- On app focus / visibility change / tick: if current local date != `entry.date`, delete the entry and reset to the clock-in view.

## Runtime flow

### Clock in
1. User taps the big red button (or uses a custom time via the OS time picker).
2. Store appends a new `work` segment with `start = chosen time` (default `Date.now()`).
3. UI switches to `RunningView`.

### Clock out
- Close the current open segment (set `end = Date.now()`).
- UI switches back to `ClockInView` with a "clocked out" state and a clock-in button to resume.

### Tick
- `setInterval` updates the displayed value every second while the document is visible.
- On `visibilitychange` -> visible: recompute from the segments (do **not** rely on the tick having run while hidden — iOS pauses timers).
- Internally all math is in ms; UI renders `Math.floor(ms / 60000)` minutes -> `HH:MM`.

### Adjustment buttons (+1 / +5 / +10 min)

- These add to **worked time** by moving the recorded start of the currently-open work segment **earlier** (to the left on the timeline).
- Implementation: `openWorkSegment.start -= N * 60_000`.
- No matching "−" buttons in scope.

### Custom time picker

- Opens the OS time picker (`<input type="time">` on platforms that surface one).
- The picked time is converted to an epoch-ms for today's local date and used as the start of the (currently-open or new) work segment.

### Edit clock-in after the fact

- User edits the start of the first work segment (or any work segment, depending on UI scope).
- After any mutation to segment starts, the store **recomputes break eligibility from scratch** (see state machine below). Breaks may appear, disappear, or shift.

### Mandatory breaks — state machine

Worked time is **accumulated across all work segments** (excluding break segments). Thresholds:

- After **6h** of accumulated worked time → fire 30 min break (once per day).
- After **9h** of accumulated worked time → fire 15 min break (once per day).

Conceptual state machine (driven by `workedMs`):

```
running --workedMs>=6h--> break30 --30min elapsed--> running --workedMs>=9h--> break15 --15min elapsed--> running
```

Recompute algorithm (run on every tick, on visibility regain, and after any segment mutation):

1. Walk segments in order, accumulating `workedMs` over `work` segments and `breakMs` over `break` segments.
2. When accumulated worked time crosses 6h and no 30 min break has been recorded yet:
   - close the current work segment at the crossing instant,
   - insert a `break` segment `{ duration: 30, start: crossingInstant }`.
3. When accumulated worked time crosses 9h (after the 30 min break) and no 15 min break has been recorded yet:
   - close the current work segment at the crossing instant,
   - insert a `break` segment `{ duration: 15, start: crossingInstant }`.
4. If a break segment is currently open (no `end`), check whether `now - break.start >= duration`:
   - if yes: set `end = break.start + duration`, append a new `work` segment `{ start: break.end }`.
   - if no: state is `break`, with `breakEndsAt = break.start + duration`.

### Display

```
displayMs = workedMs   // breaks are excluded by construction (they are not 'work' segments)
```

The UI shows `formatHHMM(displayMs)`.

### Break overlay

While the current segment is an open `break`:
- Hide the elapsed-time display.
- Show "Break — NN:NN remaining" counting down from `breakEndsAt - now`.
- Auto-resume when the countdown reaches 0 (the recomputation in step 4 above closes the break and opens a new work segment).
- Clock-out is **disabled** during a mandatory break — breaks cannot be skipped.

### Reset / midnight rollover

- Manual reset: delete today's entry, return to `ClockInView`.
- Midnight rollover: detected on next tick / visibility; delete entry, return to `ClockInView`. Previous day is not carried over.

## PWA wiring

- `vite-plugin-pwa` with `autoUpdate` + workbox `generateSW` (app-shell caching only).
- Manifest: name "Clocked", standalone display, icons, theme color (red), maskable icon for Android.
- Register `navigator.storage.persist()` on first user interaction (the first clock-in tap is a natural trigger). Required for iOS to avoid eviction of IndexedDB.
- SW requires `localhost` or HTTPS; test via `pnpm preview`.

## Persistence

- IndexedDB via `idb`, one object store `entries` keyed by `date`.
- Only today's entry is kept; the schema is forward-compatible with history if that decision is ever revisited.
- No localStorage for entry data (size + eviction risk); localStorage may be used only for ephemeral UI state if needed.
