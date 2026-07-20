# Architecture

> Status: draft. Several open questions in `discussion.md` may revise parts of this. Treat anything marked *(pending)* as not yet final.

## Components

```
┌─────────────────────────────────────────────┐
│  UI (Vue 3, vanilla TS, no SFC-only)         │
│   - ClockInView    (big red button + adjust) │
│   - RunningView    (elapsed HH:MM, edit/reset)│
│   - BreakOverlay   (during mandatory break)  │
└───────────────┬─────────────────────────────┘
                │  reads / writes
┌───────────────▼─────────────────────────────┐
│  Pinia store (single source of truth)        │
│   - today's entry                             │
│   - derived: workedMs, breakState, displayMs │
└───────────────┬─────────────────────────────┘
                │  persists
┌───────────────▼─────────────────────────────┐
│  Storage layer (idb wrapper on IndexedDB)    │
│   - "entries" object store, key by date      │
└──────────────────────────────────────────────┘
```

No router, no backend, no network calls at runtime. Single SPA bundle served from root; service worker caches the app shell.

## Data model

### Entry (one per local calendar day)

```ts
interface Entry {
  date: string;       // 'YYYY-MM-DD', local calendar day of clock-in (key)
  startEpochMs: number;// wall-clock ms when clock-in happened
  // adjustment history kept only if we decide to audit; otherwise just update startEpochMs
  // (pending: see discussion.md "Tamper / audit")
}
```

Only **today's** entry is used for the running timer. Previous day's entry is deleted on rollover *(pending: history decision in discussion.md)*.

### Day boundary

- "Today" = local calendar day. Compare `entry.date` against the current local date string.
- On app focus / visibility change / tick: if current local date != `entry.date`, delete the entry and reset to the clock-in view.

## Runtime flow

### Clock in
1. User taps the big red button (or uses a custom time via OS picker).
2. Store writes an `Entry` with `date` = today, `startEpochMs` = chosen time (default `Date.now()`).
3. UI switches to `RunningView`.

### Tick
- A `setInterval` updates the displayed value every second while the document is visible.
- On `visibilitychange` -> visible: recompute from `startEpochMs` (do **not** rely on the tick having run while hidden — iOS may pause timers).
- Internally we work in ms; the UI renders `Math.floor(ms / 60000)` minutes -> `HH:MM`.

### Mandatory breaks

Worked time is measured from `startEpochMs`. *(pending: whether thresholds are wall-clock or worked-time-based — see discussion.md q5.)*

Conceptual state machine:

```
running --6h--> break30 --30min--> running --9h--> break15 --15min--> running
```

- When worked time reaches 6h, enter `break30` state for 30 min.
- When worked time reaches 9h (after the 30 min break resumed), enter `break15` state for 15 min.
- During a break, the **displayed** elapsed time is frozen at the threshold; the break itself does not count as worked time.
- After the break duration elapses, automatically resume `running`. *(pending: auto-resume vs. manual tap — see discussion.md q4.)*

Display:
```
displayMs = workedMs - breaksAlreadyTaken
```
i.e. the user sees worked time **minus** the mandatory break durations.

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
- We currently keep only today's entry; the schema allows historical rows if that decision changes.
- No localStorage for entries (size + eviction risk); localStorage may be used only for ephemeral UI state if needed.
