# Test & V&V strategy

Verification = "did we build it right" (automated). Validation = "did we build the right thing" (manual PWA + behavior checks). Run both after every implementation change. Do not declare a task done until they pass.

## Test layers

### 1. Unit tests (Vitest)

Target: pure logic, no DOM. Keep this layer fast and deterministic.

#### Break / segment recomputation (`recomputeBreaks.ts` or similar)

Given a list of segments and a "now" value, returns the canonical segment list (with breaks inserted/removed as needed) plus `{ state: 'running' | 'break30' | 'break15', workedMs, displayMs, breakEndsAt? }`.

Cases:
- Single work segment, < 6h: no break inserted. `workedMs = now - start`.
- Single work segment crossing 6h: a `break(30)` segment is inserted at the crossing instant, the work segment is split, the open segment becomes the break.
- During the 30 min break: state `break30`, `breakEndsAt = break.start + 30 * 60_000`.
- At break + 30 min: break closes, new `work` segment opens, state `running`.
- Worked time reaches 9h (after the 30 min break): `break(15)` inserted at the crossing instant.
- At break + 15 min: state `running` again.
- Multiple work segments (clock-out + clock-in): worked time accumulates across all of them; breaks fire at the correct accumulated thresholds.
- Editing the first work segment's start backward (e.g. via +5min) reduces start, increases worked time, may push a break to fire earlier; recompute is idempotent and deterministic.
- Editing the first work segment's start forward (e.g. via the OS time picker) may remove a previously-fired break if worked time no longer reaches the threshold.
- Breaks fire exactly once each per day, regardless of how many sessions.

#### Day rollover

- Given an entry with `date` = yesterday and `now` past local midnight, the selector returns "expired".
- Given an entry with `date` = today, not expired.

#### Formatting

- `formatHHMM(ms)` for boundary values: 0, 59999, 60000, 6h, 6h30m, 9h, 9h15m, 10h.

#### Adjustment helpers

- `+1min / +5min / +10min` decrease `openWorkSegment.start` by `60_000 / 300_000 / 600_000` ms respectively.
- Adjustment is a no-op (or disabled) while the current segment is a break.

### 2. Component tests (Vitest + @vue/test-utils, happy-dom)

- `ClockInView`:
  - tapping the red button calls the store action with `Date.now()` (mocked).
  - adjustment buttons call the store action that shifts the open segment start earlier.
  - custom-time field delegates to `<input type="time">` and writes the picked value.
  - when the entry already has segments but is currently clocked out, the button shows "clock in (resume)" and appends a new work segment.
  - when clocked-out (entry with at least one closed work segment), renders `formatHHMM(workedMs)` above the red button with label "Worked today", and renders a Reset day button that calls `store.reset`; neither is rendered in the fresh clock-in state.
- `RunningView`:
  - renders `HH:MM` from the store's `displayMs`.
  - edit and reset actions invoke store mutations.
  - clock-out closes the open work segment and returns to `ClockInView`.
- `BreakOverlay`:
  - renders the correct remaining time, counting down.
  - when `now` reaches `breakEndsAt`, the overlay closes and `RunningView` resumes.
  - clock-out button is hidden / disabled while the overlay is shown.

### 3. Store tests (Pinia, in-memory)

- `clockIn(now)` appends a new work segment to today's entry (or creates the entry if none).
- `clockOut(now)` closes the current open segment.
- `adjustStart(deltaMs)` mutates the open work segment's start and triggers recompute.
- `editClockIn(newStart)` mutates the first work segment's start and triggers recompute.
- `reset()` deletes today's entry.
- selectors return correct values for running / break states.
- midnight rollover path: when the store detects `date != today`, it deletes the entry and resets state.

### 4. Storage tests (IndexedDB via `fake-indexeddb`)

- `getToday(date)` returns `undefined` when empty.
- `put(entry)` then `getToday(date)` round-trips, including multi-segment entries.
- `deleteToday(date)` removes the row.
- persistence across "reload": re-create the db instance, entry is still there.

## Manual V&V (run after any change, at minimum after storage/SW/UI changes)

Run with `pnpm preview` (serves on `localhost`, so the real SW registers):

1. **Installable**
   - Chrome / Edge on desktop: install icon present; "Install" works.
   - Android Chrome: prompt appears, "Add to Home screen" produces a standalone WebAPK.
   - iOS Safari: Share -> "Add to Home Screen"; opens standalone (no browser chrome).

2. **Offline-capable**
   - With the app installed, disable network, reload. App shell loads from SW; clock-in works.

3. **Timer survives screen lock (iOS especially)**
   - Clock in, lock the screen for several minutes, unlock. Displayed elapsed time should match wall-clock minus breaks, with no drift. (Verifies ADR-007.)

4. **Entries persist after reload**
   - Clock in, hard reload. Today's entry and elapsed time come back from IndexedDB.

5. **Multiple sessions per day**
   - Clock in, work a bit, clock out, clock back in. Accumulated worked time is the sum across both sessions; display jumps correctly.

10. **Clocked-out account display**
    - Clock in, work a bit, clock out. Verify the "Worked today" label and the correct worked time appear above the red Clock In button. Tap Reset day and confirm the entry is wiped and the view returns to the plain clock-in screen.

6. **Mandatory breaks**
   - Use the edit-clock-in or a dev-only "time travel" helper to push the start back far enough to cross 6h / 9h. Verify:
     - at 6h worked, the 30 min break overlay appears with the correct countdown,
     - after 30 min it auto-resumes and the elapsed display resumes,
     - at 9h worked (after the 30 min break), the 15 min break overlay appears,
     - after 15 min it auto-resumes.
   - Verify the clock-out button is disabled during a break.

7. **+min adjustment buttons**
   - Tap +1min / +5min / +10min and confirm the elapsed display grows by exactly that amount, and the recorded clock-in time moves earlier by the same amount.

8. **Midnight rollover**
   - Set the device clock to 23:59, clock in, advance device clock past midnight, focus the app. Entry should be gone, clock-in button should be back.

9. **Persistence permission (iOS)**
   - First clock-in triggers `navigator.storage.persist()`. Confirm in DevTools / via `navigator.storage.persisted()` that it resolved to `true`.

## Storage / SW-specific checks (when those areas change)

- Bump the SW cache / verify the new bundle is served after `autoUpdate` (force reload, observe "update ready" if configured).
- Run the `fake-indexeddb` suite plus a manual reload after a schema change to confirm no IndexedDB errors in the console.
- Confirm no `localStorage` writes for entry data (only IndexedDB).

## Required command order

```bash
pnpm lint      # 1. eslint (flat config)
pnpm typecheck # 2. vue-tsc --noEmit
pnpm build     # 3. production build -> dist/
pnpm test      # 4. unit + component + store + storage suites
pnpm preview   # 5. manual V&V above
```

`lint -> typecheck -> build` is mandatory before every commit. `test` and the manual `preview` V&V are mandatory before declaring a feature done.
