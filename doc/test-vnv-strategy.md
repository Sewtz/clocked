# Test & V&V strategy

Verification = "did we build it right" (automated). Validation = "did we build the right thing" (manual PWA + behavior checks). Run both after every implementation change. Do not declare a task done until they pass.

## Test layers

### 1. Unit tests (Vitest)

Target: pure logic, no DOM. Keep this layer fast and deterministic.

#### Break / segment recomputation (`recompute.ts`)

Given a list of in/out punches, settings, and a "now" value, returns `{ workedSeconds, breakSeconds, displaySeconds, breakState, breakEndsAtMs, targetReached, limitReached }`.

Cases:
- Single punch, < break1_trigger: no break, worked = (now - in) clamped.
- Single punch crossing break1_trigger: break state becomes `break1`, `breakEndsAt` computed from trigger instant + break1_duration.
- During the break: state `break1`, `breakEndsAt` correct, worked seconds frozen at trigger point; **breakSeconds counts up from 0 to break1_duration as the break elapses**.
- After break1 duration: state `running` again, worked continues accumulating.
- Same for break2 (only after break1 satisfied).
- Gap between punches >= break duration: mandatory break fitted at gap start (becomes `mandatory-break` segment), gap remainder is neutral `gap` segment; no mandatory pause introduced during work.
- Multiple gaps: breaks fitted at the start of qualifying gaps (`gap >= break_duration`); no mandatory pauses introduced during work. Gap remainders are neutral.
- Insufficient gap + trigger crossing: mandatory pause introduced.
- break1_disabled: break1 and break2 both skipped, no breaks regardless of worked time.
- break2_enabled requires break1_enabled: defensive check skips break2 if break1 is disabled.
- No punches: worked = 0, break = 0, state = running.
- Open punch (no out): counted up to now.
- targetReached / limitReached flags based on daily_target / daily_limit.

#### Day rollover

- Worktime record from yesterday → cleared.
- Worktime record from today → kept.

#### Formatting

- `formatHHMM(seconds)` for boundary values: 0, 3599, 3600, 6h, 6h30m, 9h, 9h15m, 10h.
- `formatMMSS(seconds)` for break countdown.

#### Adjustment helpers

- `+1min / +5min / +10min` decrease `punches[0].in` by `60 / 300 / 600` seconds respectively.
- Adjustment when no open punch or no entry is a no-op.

#### Settings helpers

- `applySettingsPatch(partial)` merges patch into settings, enforces break2 cascade-disable.
- Reject setting `break2_enabled=true` when `break1_enabled=false`.

### 2. Component tests (Vitest + @vue/test-utils, happy-dom)

- `ClockInView`:
  - tapping the rectangular green button calls the store action with current time.
  - when clocked-out, renders `formatHHMM(workedSeconds)` above the green button with label "Worked today"; neither the button nor the label renders in the fresh clock-in state.
- `RunningView`:
  - renders `HH:MM` from the store's `displayMs`.
  - clock-out closes the open punch and returns to `ClockInView`.
  - Clock Out button is shown **both while running and during a mandatory break**.
- `BreakBanner`:
  - renders the correct remaining time, counting down MM:SS.
  - when `now` reaches `breakEndsAt`, the banner disappears and `RunningView` resumes (state reverts to `running`).

### 3. Store tests (Pinia, in-memory)

- `clockIn(now)` appends a new punch to today's worktime (or creates it if none).
- `clockOut()` closes the last open punch.
- `adjustStart(deltaSeconds)` moves the first punch's in earlier and triggers recompute.
- `editClockIn(newIn)` mutates the first punch's in and triggers recompute.
- `reset()` clears the worktime record.
- `setSettings(partial)` merges patch, enforces break2 cascade.
- Getters return correct values for running / break states.
- Midnight rollover path: when the store detects the worktime record is from yesterday, it clears it and resets state.

### 4. Storage tests (IndexedDB via `fake-indexeddb`)

- DB v2 schema: `settings` store (key `'settings'`) and `worktime` store (key `'worktime'`).
- `getSettings()` returns null when empty; `putSettings` round-trips.
- `getWorktime()` returns null when empty; `putWorktime` round-trips punches array.
- `clearWorktime()` deletes the worktime record.
- DB upgrade v1→v2: drops `entries` store, creates both new stores.

### 5. Debug API tests

- `__clocked.setSettings(partial)` merges and persists.
- `__clocked.setSettings({break1_enabled: false})` cascade-disables break2.
- `__clocked.setPunches([{in: 0}])` writes through to IDB.
- `__clocked.tickTo(36000)` advances clock, getters reflect new now.
- `__clocked.simulateMidnight()` clears worktime.
- `__clocked.state.settings` reflects current persisted settings.

## Manual V&V (run after any change, at minimum after storage/SW/UI changes)

Run with `pnpm preview` (serves on `localhost`, so the real SW registers):

1. **Installable** — same as before.
2. **Offline-capable** — same as before.
3. **Timer survives screen lock** — same as before.
4. **Entries persist after reload** — clock in, hard reload. Worktime + elapsed come back.
5. **Multiple sessions per day** — clock in/out/in, accumulated worked time correct.
6. **Clocked-out account display** — same as before.
7. **Mandatory breaks** — use `window.__clocked.setPunches` + `tickTo` to test break1/break2 firing, **inline banner** appearance, auto-resume (state reverts to `running` when countdown reaches 00:00), and clock-out during break (should close the punch, end the day, retain the break segment in the timeline). Also verify break enable/disable toggles work:
   - `__clocked.setSettings({break1_enabled: false})` — no breaks fire at any workload.
   - `__clocked.setSettings({break1_enabled: true, break2_enabled: true})` — both breaks fire in order.
   - `__clocked.setSettings({break1_enabled: false, break2_enabled: true})` — break2 silently stays false.
8. **+min adjustment buttons** — same as before.
9. **Midnight rollover** — same as before.
10. **Persistence permission** — same as before.
11. **Edit times** — click the Timeline (track or list rows) → `EditTimesDialog` opens. Tap a time input → OS native time picker appears. Change a time → Save → Timeline updates. Verify out-of-order edits (out before in, or gap violation) show an inline red error and Save stays disabled. Reload page → edited times persist.
12. **Debug API console walkthrough** — run the `__clocked.help()` snippet, verify each method works without errors:
    ```js
    __clocked.help()
    __clocked.setPunches([{in: 0}, {in: 32400, out: 36000}])
    __clocked.state          // verify worked, break, viewState
    __clocked.tickTo(40000)  // advance 1111s
    __clocked.state          // verify worked grew
    __clocked.simulateMidnight()
    __clocked.state          // verify worktime cleared, viewState clock-in
    __clocked.setSettings({break1_enabled: false})
    __clocked.settings.break1_enabled // false
    __clocked.settings.break2_enabled // also false (cascaded)
    __clocked.resetSettings()
    __clocked.useRealClock()
    ```

## Storage / SW-specific checks (when those areas change)

- Bump the SW cache / verify the new bundle is served after `autoUpdate`.
- Run the `fake-indexeddb` suite plus a manual reload after a schema change (v1→v2) to confirm no IndexedDB errors in the console.
- Confirm no `localStorage` writes for entry data (only IndexedDB).

## Required command order

```bash
pnpm lint      # 1. eslint (flat config)
pnpm typecheck # 2. vue-tsc --noEmit
pnpm build     # 3. production build -> dist/
pnpm test      # 4. unit + component + store + storage + debug suites
pnpm preview   # 5. manual V&V above
```

`lint -> typecheck -> build` is mandatory before every commit. `test` and the manual `preview` V&V are mandatory before declaring a feature done.
