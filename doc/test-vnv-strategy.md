# Test & V&V strategy

Verification = "did we build it right" (automated). Validation = "did we build the right thing" (manual PWA + behavior checks). Run both after every implementation change. Do not declare a task done until they pass.

## Test layers

### 1. Unit tests (Vitest)

Target: pure logic, no DOM. Keep this layer fast and deterministic.

- **Break state machine** (`breaks.ts` or similar):
  - given `startEpochMs` and a "now" value, returns `{ state: 'running' | 'break30' | 'break15', workedMs, displayMs, breakEndsAt? }`.
  - cases:
    - before 6h: `running`, display = worked.
    - exactly 6h: transition to `break30`, display frozen at 6h.
    - mid-30min-break: still `break30`, display still 6h.
    - at 6h + 30min: back to `running`, display resumes.
    - at 9h (worked, i.e. after the 30 min break): transition to `break15`.
    - past 9h + 15min: `running` again.
  - *(pending: confirm threshold basis — wall-clock vs worked-time. Whichever is decided, encode it explicitly and test both edges.)*
- **Day rollover**:
  - given today's entry and a "now" past local midnight, the selector returns "expired".
  - given today's entry and a "now" the same day, not expired.
- **Formatting**:
  - `formatHHMM(ms)` for boundary values: 0, 59999, 60000, 6h, 6h30m, 9h, 10h.
- **Adjustment helpers**:
  - `+1min / +5min / +10min` produce the expected new `startEpochMs` (and direction — pending q6).

### 2. Component tests (Vitest + @vue/test-utils, happy-dom)

- `ClockInView`: tapping the red button calls the store action with `Date.now()` (mocked).
- `ClockInView`: adjustment buttons call the store action with shifted start.
- `ClockInView`: custom-time field delegates to `<input type="time">` and writes the picked value.
- `RunningView`: renders `HH:MM` from the store's `displayMs`.
- `RunningView`: edit and reset actions invoke store mutations.
- `BreakOverlay` (if present): renders correct remaining break time and switches back to `RunningView` when the break ends.

### 3. Store tests (Pinia, in-memory)

- `clockIn(now)` writes an entry to a fake storage.
- `reset()` deletes today's entry.
- selectors return correct values for running / break states.
- midnight rollover path: when the store detects `date != today`, it deletes the entry and resets state.

### 4. Storage tests (IndexedDB via `fake-indexeddb`)

- `getToday(date)` returns `undefined` when empty.
- `put(entry)` then `getToday(date)` round-trips.
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

5. **Mandatory breaks**
   - Simulate by editing the clock-in time back far enough to cross 6h / 9h, or by using a dev-only "time travel" helper. Verify:
     - at 6h, the 30 min break kicks in and the display freezes at 6h,
     - after 30 min it resumes,
     - at 9h the 15 min break kicks in,
     - after 15 min it resumes.

6. **Midnight rollover**
   - Set the device clock to 23:59, clock in, advance device clock past midnight, focus the app. Entry should be gone, clock-in button should be back.

7. **Persistence permission (iOS)**
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
