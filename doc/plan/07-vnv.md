# WP7 — Manual V&V

Goal: walk through every user-visible flow and platform behavior before declaring the MVP done. This WP has no code changes; it's the acceptance gate.

Each task is a step-by-step procedure. Run `pnpm build && pnpm preview` before each task (unless noted) so you're testing the production build with the real service worker.

**Strict order:** T1 → T2 → ... → T9.

---

## WP7-T1 — Fresh-install installability

- **Goal:** Verify the app installs cleanly on a clean browser state.
- **Procedure:**
  1. `pnpm build && pnpm preview`
  2. Open `http://localhost:4173` in a fresh Chrome / Edge profile (no cached SW).
  3. Wait for the page to load. The big red "Clock In" button should appear.
  4. Click the install icon in the address bar (or `⋮ → Install`).
  5. Accept the prompt.
  6. The app should open in a standalone window (no browser chrome).
  7. Close the window and re-open from the OS app launcher / desktop — the standalone app launches directly.
- **Pass criteria:**
  - Install prompt appears.
  - Standalone window opens.
  - Re-launching from the OS works.
- **Dependencies:** WP5.
- **Notes:**
  - If the install icon is missing, check DevTools → Application → Manifest for errors. Common causes: missing icon at 192px or 512px, manifest JSON invalid, `display` not set to `standalone` or `fullscreen`.

---

## WP7-T2 — Offline capability after first load

- **Goal:** Confirm the SW caches the app shell and the app loads with no network.
- **Procedure:**
  1. After WP7-T1 (app installed), open DevTools → Network → check "Offline".
  2. Reload the app.
  3. The app should render the Clock In screen.
  4. Click Clock In — the timer should start.
  5. Reload again (still offline) — the timer state should persist from IndexedDB.
  6. Uncheck "Offline", reload — app should continue to work normally.
- **Pass criteria:**
  - App renders offline.
  - Clock-in works offline.
  - Entry persists across offline reloads.
- **Dependencies:** WP7-T1.
- **Notes:**
  - If the page is blank offline, the SW didn't precache `index.html`. Check `globPatterns` in `vite.config.ts` includes `**/*.html`.

---

## WP7-T3 — Timer survives screen lock (iOS especially)

- **Goal:** Confirm the timer keeps correct time across screen lock.
- **Procedure:**
  1. Clock in.
  2. Note the displayed worked time.
  3. Lock the screen / switch away for 5 minutes (use a wall clock to be precise).
  4. Unlock / return to the app.
  5. The displayed time should have advanced by approximately 5 minutes (within a few seconds).
  6. Repeat with a 10-minute lock.
- **Pass criteria:**
  - Displayed time matches wall-clock elapsed (within ±5 seconds).
  - No drift accumulates over multiple locks.
- **Dependencies:** WP7-T2, WP3-T6 (visibility regain recompute).
- **Notes:**
  - This is the critical iOS test. iOS Safari pauses JS timers in the background; only `visibilitychange` + the stored segment timestamps make the timer correct on resume.
  - If the timer is wrong, check that `onVisible` is being called (add a `console.log` temporarily) and that it calls `persistAndRecompute`.

---

## WP7-T4 — Entries persist after reload

- **Goal:** Confirm IndexedDB round-trips correctly.
- **Procedure:**
  1. Clock in.
  2. Work for 2 minutes.
  3. Hard reload the page (`Ctrl+Shift+R` / `Cmd+Shift+R`).
  4. The app should land in `RunningView` with the worked time still increasing from the original start.
  5. Clock out.
  6. Reload.
  7. The app should show the `clocked-out` state (big red button "Clock In (resume)").
  8. Clock in again — a new work segment is appended.
- **Pass criteria:**
  - Reload preserves entry and state.
  - Multiple segments accumulate correctly across reloads.
- **Dependencies:** WP7-T3, WP2-T2.
- **Notes:**
  - In DevTools → Application → IndexedDB → `clocked` → `entries`, you should see one row with `date` = today and a `segments` array.

---

## WP7-T5 — +1min / +5min / +10min buttons

- **Goal:** Verify the adjustment buttons work in both contexts: at clock-in time and during the running session.
- **Procedure:**
  1. Fresh state (no entry).
  2. Tap `+5min`. The app should clock in with a start time 5 minutes in the past.
  3. The displayed worked time should be approximately `00:05`.
  4. In `RunningView`, tap `+1min`. The displayed time should jump to `00:06`.
  5. Tap `+10min`. The displayed time should jump to `00:16`.
  6. In DevTools, inspect the entry's first segment's `start` — it should be 5 minutes earlier than the original `Date.now()` was at clock-in.
  7. Tap "Reset day". Confirm the entry is gone.
- **Pass criteria:**
  - Each button adds exactly the labeled minutes to worked time.
  - The stored start moves earlier by the corresponding delta.
- **Dependencies:** WP4-T2, WP4-T3.
- **Notes:**
  - The `+Nmin` buttons at clock-in pass a shifted `startMs` to `clockIn()`. The `+Nmin` buttons in `RunningView` call `store.adjustStart(N)`. They are different code paths; both must work.

---

## WP7-T6 — Custom time picker

- **Goal:** Verify `<input type="time">` works on all platforms.
- **Procedure:**
  1. Fresh state.
  2. Tap the custom time field. On iOS, the native time picker should appear.
  3. Pick `09:30` and confirm.
  4. The app should clock in with a start of today at 09:30 local.
  5. The displayed worked time should be `Date.now()` minus today-at-09:30, in `HH:MM`.
  6. Reset.
  7. In `RunningView` (clock in first), tap the edit field, change the clock-in time, and confirm.
  8. The displayed worked time should update to reflect the new start.
- **Pass criteria:**
  - OS time picker appears on iOS and Android.
  - The chosen time is converted to the correct epoch-ms for today's local date.
  - Editing the clock-in time recomputes breaks (covered in WP7-T7 if the new start crosses a threshold).
- **Dependencies:** WP4-T2, WP4-T3, WP1-T2.
- **Notes:**
  - `<input type="time">` returns a `'HH:MM'` string. `localEpochForTodayMs(h, m)` builds the epoch.
  - If the picked time is later than `now`, the worked time goes negative — clamp it (or warn). Currently the recompute function should clamp; verify in the display.

---

## WP7-T7 — Mandatory breaks

- **Goal:** Verify the 6h / 9h break logic end-to-end.
- **Procedure (uses the edit-clock-in to "time travel"):**
  1. Fresh state.
  2. Clock in at the current time.
  3. Edit the clock-in time back to 5h55m ago (i.e. `now - 5h55m`).
  4. The displayed worked time should be `05:55`.
  5. Wait (or fake-tick) until the worked time reaches 6h.
  6. The `BreakOverlay` should appear with `30:00` remaining.
  7. The clock-out button should be inaccessible (overlay covers the screen).
  8. Wait 30 minutes (or use a dev-only "time travel" helper if you added one).
  9. The overlay should disappear and the running view should resume.
  10. Edit the clock-in time back further so that worked time reaches 9h.
  11. The 15 min break overlay should appear.
  12. After 15 minutes, it should auto-resume.
  13. Edit the clock-in forward (less worked time). The break should disappear if worked time no longer reaches the threshold.
- **Pass criteria:**
  - 30 min break fires at 6h worked.
  - 15 min break fires at 9h worked (after the 30 min break).
  - Each break fires exactly once.
  - Editing clock-in forward removes no-longer-eligible breaks.
  - Editing clock-in backward may trigger breaks earlier.
- **Dependencies:** WP1-T4, WP3-T4.
- **Notes:**
  - For "wait 30 minutes" without actually waiting, the easiest approach is to add a hidden `?devTime=<epoch>` query param that overrides `Date.now()` in the store. If you add this, document it in `doc/discussion.md` and remove it before release.
  - Alternative: use the browser DevTools "Sensors" tab to override the system clock — but this doesn't affect `Date.now()` in JS directly.
  - The break countdown uses `formatMMSS` (minutes:seconds), not `formatHHMM`.

---

## WP7-T8 — Midnight rollover

- **Goal:** Verify the day resets past local midnight.
- **Procedure:**
  1. Set the device clock (or OS clock for `pnpm preview` on desktop) to 23:58 local.
  2. Clock in.
  3. Wait 3 minutes (or change the clock to 00:01 the next day).
  4. Click away and back to the app (or trigger `visibilitychange` by switching tabs).
  5. The app should show the `ClockInView` (no entry).
  6. In DevTools → IndexedDB, the previous day's entry should be gone.
- **Pass criteria:**
  - After midnight + visibility regain, the entry is deleted.
  - The clock-in button is back.
- **Dependencies:** WP3-T7.
- **Notes:**
  - Changing the OS clock may not immediately trigger `visibilitychange`. Switch to another app/tab and back to force the recompute.
  - The previous day's entry is permanently deleted (no history per ADR-010).

---

## WP7-T9 — Persistence permission (iOS)

- **Goal:** Verify `navigator.storage.persist()` was requested on first clock-in and granted.
- **Procedure (iOS):**
  1. Open the installed PWA on iOS Safari.
  2. Open the Web Inspector (via Mac Safari → Develop → [device]).
  3. In the console, type `await navigator.storage.persisted()` — should return `false` initially.
  4. Tap Clock In.
  5. Re-run `await navigator.storage.persisted()` — should return `true`.
  6. Open IndexedDB in Web Inspector — the `clocked` DB and `entries` store should exist with one row.
  7. Restart the device (or just close and reopen the PWA).
  8. Reload the app — the entry should still be there.
- **Pass criteria:**
  - `navigator.storage.persisted()` returns `true` after the first clock-in.
  - Entry survives device restart / app close.
- **Dependencies:** WP3-T8.
- **Notes:**
  - iOS may prompt the user to grant persistent storage. The first clock-in is the trigger.
  - Without persistence, iOS may evict IndexedDB after 7 days of no use. With it, the data survives.
  - On Android Chrome, the same check applies but persistence is usually granted silently.

---

## End of WP7

If all nine tasks pass, the MVP is verified. The app:
- installs on Android and iOS,
- runs offline,
- clocks in/out with correct accumulated time,
- handles mandatory breaks automatically,
- survives screen lock and reloads,
- persists across device restarts,
- resets correctly at midnight.

Time to ship 🚀 (after a final `pnpm lint && pnpm typecheck && pnpm build && pnpm test`).
