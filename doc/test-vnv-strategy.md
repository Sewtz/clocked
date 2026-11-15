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

#### Event sequences (`events.ts`)

- `analyse()`: empty day valid; alternating sequence valid with derived pairs; trailing `in` valid only with `allowOpen`; each issue kind (`starts-with-out`, `double-in`, `double-out`, `open-past-day`, `unsorted`) reported on the offending index; multiple issues; `in`/`out` at the same second.
- `eventsToPunches` / `punchesToEvents`: pairs → events → pairs is lossless; pairing a faulty list throws.
- `insertEvent` sorted and stable on ties; `removeEvent` by index; neither mutates its input.

#### Export (`export.ts`, `share.ts`)

- Presets (Monday weeks, months, year boundary), inclusive date lists; day rows for ok/open/faulty/empty days; totals over valid days with faulty dates listed.
- CSV: BOM, `;`, CRLF, exact rows incl. TOTAL, quoting, no cell starting with `=`/`+`/`-`/`@` outside the `*_min` columns. Mail text: lines, faulty note, attached vs downloaded hint, open day, empty period.
- `shareExport`: share sheet with file/subject/text; cancel → no fallback; no file sharing or `NotAllowedError` → download + `mailto:`. `mailtoUrl` encodes and shortens long bodies.

#### Day rollover

- Worktime record from yesterday → cleared.
- Worktime record from today → kept.
- On rollover the expired day is archived to the `history` store; a valid open day gets an `out` at 86399 first, a faulty day is archived unchanged.

#### Formatting

- `formatHHMM(seconds)` for boundary values: 0, 3599, 3600, 6h, 6h30m, 9h, 9h15m, 10h.
- `formatMMSS(seconds)` for break countdown.

#### Adjustment helpers

- `+1min / +5min / +10min` move the first `in` event earlier by `60 / 300 / 600` seconds (clamped at midnight), keeping the list sorted.
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
- `EditTimesDialog`: one row per event; delete flags the day faulty but Save stays enabled; add inserts sorted; committed time changes re-sort; past dates load from `historyCache`; Save calls `replaceDayEvents(date, events)`.
- `FaultyDayView`: lists events with the issue on the offending one, no clock buttons, **Fix times** opens the editor for today.
- `App`: a faulty day renders `FaultyDayView` and a red status dot.
- `Timeline`: renders nothing for faulty or empty days; passes the shown date to the editor.
- `BreakBanner`:
  - renders the correct remaining time, counting down MM:SS.
  - when `now` reaches `breakEndsAt`, the banner disappears and `RunningView` resumes (state reverts to `running`).

### 3. Store tests (Pinia, in-memory)

- `clockIn(now)` inserts an `in` event (or creates the day); `clockOut()` appends an `out`, never before its `in`.
- A faulty day: `viewState 'faulty'`, zero totals/segments, clock-in/out blocked, restored by `init()`, valid again once corrected.
- `replaceDayEvents(date, events)`: today → live worktime (sorted, clamped; `[]` clears to clock-in); past date → `history` + cache (`[]` deletes); future date ignored; archives a stale live record first.
- `adjustStart(deltaSeconds)` moves the first punch's in earlier and triggers recompute.
- `editClockIn(newIn)` mutates the first punch's in and triggers recompute.
- `reset()` clears the worktime record.
- `setSettings(partial)` merges patch, enforces break2 cascade.
- Getters return correct values for running / break states.
- Midnight rollover path: when the store detects the worktime record is from yesterday, it clears it and resets state.
- `reset()` archives before clearing; a valid open day is closed at `out = 86399`, a faulty day is archived unchanged.
- `loadHistoryRange` populates `historyCache` and merges today's live worktime into it.
- `clearHistory()` wipes the history store and empties the in-memory cache.

### 4. Storage tests (IndexedDB via `fake-indexeddb`)

- DB v2 schema: `settings` store (key `'settings'`) and `worktime` store (key `'worktime'`).
- DB v3 schema: adds `history` store (key `'YYYY-MM-DD'`); existing records preserved on upgrade.
- `getSettings()` returns null when empty; `putSettings` round-trips.
- `getWorktime()` returns null when empty; `putWorktime` round-trips the events array.
- `clearWorktime()` deletes the worktime record.
- `getHistoryDay` / `putHistoryDay` / `deleteHistoryDay` round-trip and delete archived records.
- `getHistoryRange(startYMD, endYMD)` returns only records within the inclusive range.
- `clearHistory()` empties the history store.
- DB upgrade v1→v2: drops `entries` store, creates both new stores.
- DB upgrade v3→v4 (`migrate.test.ts`): a real v3 DB seeded with `{ punches }` records (open day today + history days) opens as v4 with `{ events }`; settings untouched; fresh install creates all stores; `migrateRecord` skips already-migrated records.

### 5. Debug API tests

- `__clocked.setSettings(partial)` merges and persists.
- `__clocked.setSettings({break1_enabled: false})` cascade-disables break2.
- `__clocked.setEvents([{type: 'in', t: 0}])` writes through to IDB; a faulty sequence yields `state.viewState === 'faulty'` and `state.analysis` issues.
- `__clocked.setHistoryDay(date, events)` writes a past day; `[]` deletes it.
- `__clocked.tickTo(36000)` advances clock, getters reflect new now.
- `__clocked.simulateMidnight()` clears worktime.
- `__clocked.state.settings` reflects current persisted settings.
- `__clocked.getHistory()` returns archived records; `clear()` archives before clearing.
- `__clocked.clearHistory()` wipes the history store.

### 6. Calendar component tests

- `CalendarGrid` renders exactly 28 cells (4 Mon–Sun weeks), green dot per valid day, red dot (and `, faulty` label) per faulty day, open day valid only today, today outlined, selection highlighted, `select` emitted with the YMD.
- `DayEventList` renders a day summary above the events (Worked, Breaks, Overtime/Undertime/On target, Remaining for today, `—` when faulty, hidden when empty) and the recompute segments (work/gap/mandatory-break) with `HH:MM` start/end and durations; open punches show a live end time (today only); faulty days list raw events with issue hints and no totals.
- `CalendarDialog` loads history on mount, renders the grid + selected-day event list, closes on backdrop/×, and locks body scroll while mounted; **Edit day** is disabled for future dates and opens the editor otherwise; fixing a faulty past day turns its dot green.
- `useScrollLock` locks `document.body.style.overflow` on mount and restores it on unmount.

### 7. End-to-end scenarios (Playwright, `pnpm test:e2e`)

Replay typical usage against the **production build** in real Chromium (desktop + Pixel 7 profile): real IndexedDB, real service worker. `playwright.config.ts` builds into `dist-e2e/` and serves it on port 4175, so it never touches `dist/` or a running `pnpm preview`. Each test gets a fresh browser context (empty database). The timezone is pinned to `Europe/Berlin`; the browser clock is frozen with `page.clock.install` and moved with `fastForward` (due timers fire once — like a phone waking up).

| File | Scenarios |
| --- | --- |
| `e2e/workday.e2e.ts` | lunch day totals + timeline; running timer survives reload; mandatory break banner and resume |
| `e2e/editing.e2e.ts` | delete → faulty view (survives reload) → Fix times → totals back; correct a late clock-in; delete everything → clock-in screen; seeded faulty day |
| `e2e/calendar.e2e.ts` | midnight archive → calendar; forgot to clock out → 23:59; faulty day archived as-is → fixed from calendar; record a forgotten day; future locked; delete a past day; today live |
| `e2e/upgrade.e2e.ts` | real v3 DB with `{ punches }` on the same origin → v4 with `{ events }`, UI totals correct |
| `e2e/share.e2e.ts` | share sheet (stubbed) receives the CSV with BOM, subject and mail text; download fallback with the full month's CSV; **Fix** jumps to the faulty day |
| `e2e/offline.e2e.ts` | reload offline after first visit; manifest is installable |

First-time setup on Linux/WSL: `pnpm exec playwright install chromium` and the system libraries (`sudo apt-get install -y libnss3 libnspr4 libasound2t64` on Ubuntu 24.04, or `pnpm exec playwright install-deps chromium`). Debug with `pnpm test:e2e:ui` or the trace link printed on failure.

The manual checks below remain for what automation can't cover: add-to-home-screen on real Android/iOS devices, the native OS time picker, and real screen lock / background behaviour on iOS.

### Demo data (`pnpm demo`)

`pnpm demo` builds with `VITE_DEMO=1` into `dist-demo/` and serves it on port 4176 (own origin, own data). On first start with an empty history it writes the five weekdays before today (`src/debug/demo.ts`):

| Day | Events | Shows |
| --- | --- | --- |
| 1 | 08:00–12:00, 12:30–16:30 | break1 fitted into the lunch gap — 8h worked, 0:30 breaks |
| 2 | 07:45–13:45, 14:15–18:00 | break1 in the gap, break2 injected after 9h — 9h30 worked, 0:45 breaks |
| 3 | in 08:15, in 12:45, out 17:00 | **faulty** (deleted 12:00 clock-out) — red dot, "Two clock-ins in a row" |
| 4 | 09:00–17:30 | break1 injected after 6h — 8h worked, 0:30 breaks |
| 5 | 08:00–10:00, 10:10–12:30, 13:15–15:00 | neutral 10 min gap, break1 in the lunch — 6h05 worked |

A "Demo" badge appears in the header. `__clocked.seedDemoWeek()` rewrites those days in any build (including production) — handy after editing them. Production builds contain no auto-seeding.

## Manual V&V (run after any change, at minimum after storage/SW/UI changes)

Run with `pnpm preview` (serves on `localhost`, so the real SW registers):

1. **Installable** — same as before.
2. **Offline-capable** — same as before.
3. **Timer survives screen lock** — same as before.
4. **Entries persist after reload** — clock in, hard reload. Worktime + elapsed come back.
5. **Multiple sessions per day** — clock in/out/in, accumulated worked time correct.
6. **Clocked-out account display** — same as before.
7. **Mandatory breaks** — use `window.__clocked.setEvents` + `tickTo` to test break1/break2 firing, **inline banner** appearance, auto-resume (state reverts to `running` when countdown reaches 00:00), and clock-out during break (should close the punch, end the day, retain the break segment in the timeline). Also verify break enable/disable toggles work:
   - `__clocked.setSettings({break1_enabled: false})` — no breaks fire at any workload.
   - `__clocked.setSettings({break1_enabled: true, break2_enabled: true})` — both breaks fire in order.
   - `__clocked.setSettings({break1_enabled: false, break2_enabled: true})` — break2 silently stays false.
8. **+min adjustment buttons** — same as before.
9. **Midnight rollover** — same as before.
10. **Persistence permission** — same as before.
11. **Edit times** — click the Timeline (track or list rows) → `EditTimesDialog` opens. Tap a time input → OS native time picker appears. Change a time → leave the field → rows re-sort → Save → Timeline updates. Reload page → edited times persist.
11a. **Delete / add events, faulty day** — in the editor delete one event → the row after it is highlighted ("Two clock-ins in a row" etc.) and the footer says it will be saved as faulty → Save → main screen shows "Times need fixing", red status dot, no clock buttons. **Fix times** → add the missing event → Save → normal view, totals and Timeline return. Delete every event → Save → clock-in screen, no console errors.
11b. **Past days** — `__clocked.setHistoryDay('<past YYYY-MM-DD>', [{type:'in',t:28800},{type:'in',t:36000}])`, open the calendar → red dot, faulty list. **Edit day** → fix → Save → green dot and totals. Select an empty past day → **Edit day** → add in/out → valid day. Select a future day → **Edit day** disabled.
11c. **Rollover of a faulty day** — `__clocked.setEvents([{type:'in',t:28800},{type:'in',t:36000}])`, `__clocked.simulateMidnight()` → `getHistory()` contains the day unchanged (no 23:59:59 out); an open valid day is closed at 86399.
12. **Debug API console walkthrough** — run the `__clocked.help()` snippet, verify each method works without errors:
    ```js
    __clocked.help()
    __clocked.setEvents([{type: 'in', t: 0}, {type: 'out', t: 3600}, {type: 'in', t: 32400}])
    __clocked.state          // verify worked, break, viewState
    __clocked.tickTo(40000)  // advance 1111s
    __clocked.state          // verify worked grew
    __clocked.simulateMidnight()
    __clocked.state          // verify worktime cleared, viewState clock-in
    __clocked.getHistory()   // verify the archived day is present
    __clocked.clearHistory()
    __clocked.getHistory()   // verify []
    __clocked.setSettings({break1_enabled: false})
    __clocked.settings.break1_enabled // false
    __clocked.settings.break2_enabled // also false (cascaded)
    __clocked.resetSettings()
    __clocked.useRealClock()
    ```
13. **Calendar** — open the dialog from the top-bar calendar icon. Verify a 4-week Mon–Sun grid renders with green dots on days with data. Click a day → event list shows recompute segments (work/gap/break) with correct durations and totals. Today's open punch shows a live-updating duration. Verify the dialog scrolls internally while the body behind does not scroll. Use `__clocked.simulateMidnight()` to archive today, then reopen the calendar — yesterday's dot appears in history and today no longer shows a dot (empty worktime).
14. **Delete historic data** — open Settings, click "Delete historic data" (button shows "Click again to confirm"), click again → all calendar dots disappear. Reopen the calendar to confirm. Reload the page → history stays cleared.

## Storage / SW-specific checks (when those areas change)

- Bump the SW cache / verify the new bundle is served after `autoUpdate`.
- Run the `fake-indexeddb` suite plus a manual reload after a schema change (v1→v2) to confirm no IndexedDB errors in the console.
- **v3 → v4 upgrade on real data:** serve a `main` (v3) build, clock in/out and create history (`simulateMidnight`), then serve the v4 build on the **same origin** (same host and port) and reload. `__clocked.worktime` and `__clocked.getHistory()` show the same days as `events`; no console errors. Note that the upgrade is one-way: a v3 build can no longer open that origin's database.
- Confirm no `localStorage` writes for entry data (only IndexedDB).

## Required command order

```bash
pnpm lint      # 1. eslint (flat config)
pnpm typecheck # 2. vue-tsc --noEmit
pnpm build     # 3. production build -> dist/
pnpm test      # 4. unit + component + store + storage + debug suites
pnpm test:e2e  # 5. end-to-end scenarios (Playwright, production build)
pnpm preview   # 6. manual V&V above (device-only checks)
```

`lint -> typecheck -> build` is mandatory before every commit. `test`, `test:e2e` and the manual `preview` V&V are mandatory before declaring a feature done.

CI (`.github/workflows/ci.yml`, ADR-043) runs `lint`, `typecheck`, `test` and `test:e2e` on every pull request and before every deployment from `main`; a failing check blocks the deploy. On e2e failures, download the `playwright-report` artifact from the run and open it with `pnpm exec playwright show-report <dir>` (traces included).
