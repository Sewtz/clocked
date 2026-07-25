# Decisions

ADR-style log. Each entry: context → decision → consequences. Append new decisions, don't rewrite history.

---

## ADR-001 — Vanilla TS + Vite + Vue 3, no SFC-only toolchain

- **Context:** small single-page PWA; need a reactive UI without heavy build tooling.
- **Decision:** Vite + TypeScript + Vue 3, written with vanilla TS (no `.vue` SFC compiler-only patterns where avoidable; SFCs are fine but the project must not depend on SFC-only conventions that break type-checking).
- **Consequences:** `vue-tsc --noEmit` works cleanly; standard Vite plugins; no extra framework abstraction.

## ADR-002 — Pinia for state

- **Context:** single source of truth for today's entry and derived elapsed/break state.
- **Decision:** use Pinia.
- **Consequences:** one store (`useClockStore`) holds the entry and selectors; UI subscribes reactively.

## ADR-003 — IndexedDB via `idb`, no localStorage for entries

- **Context:** entries must survive reloads and screen lock; iOS evicts non-persistent storage under pressure; localStorage has size limits.
- **Decision:** store entries in IndexedDB using the `idb` wrapper; request `navigator.storage.persist()` on first user interaction.
- **Consequences:** async read/write at app boot; UI must handle the brief "loading" window.

## ADR-004 — PWA via `vite-plugin-pwa` `generateSW`

- **Context:** app needs to be installable and offline-capable; no custom service-worker logic is required for the MVP.
- **Decision:** use `vite-plugin-pwa` with `autoUpdate` and workbox `generateSW` for app-shell caching.
- **Consequences:** if we later need custom SW behavior (e.g. background sync fallback), switch to `injectManifest` mode.

## ADR-005 — pnpm as the only package manager

- **Context:** consistent commands across sessions; avoid duplicate lockfiles.
- **Decision:** use `pnpm`; do not commit `package-lock.json` or `yarn.lock`.
- **Consequences:** all developer commands in `AGENTS.md` use `pnpm`.

## ADR-006 — Display `HH:MM`, internally count ms

- **Context:** user wants hours and minutes; tracking seconds precisely is needed for break thresholds.
- **Decision:** the store computes everything in ms; the UI formats as `HH:MM` (no seconds).
- **Consequences:** the per-second tick only updates the display; thresholds are derived from segment timestamps.

## ADR-007 — Timer survives screen lock via stored segment timestamps

- **Context:** iOS pauses JS timers in background; a running interval cannot be relied on.
- **Decision:** do not tick while hidden. On `visibilitychange` -> visible, recompute elapsed and break state from the stored segments.
- **Consequences:** no drift; correct time shown immediately on resume; the per-second tick is purely cosmetic.

## ADR-008 — No backend, fully offline

- **Context:** product must work in airplane mode; privacy of personal work times.
- **Decision:** no backend, no runtime network calls. App must remain usable after first install with no connectivity.
- **Consequences:** no analytics, no remote config, no auth.

## ADR-009 — Device clock is not trusted for tamper-evidence

- **Context:** the +min buttons and the OS time picker intentionally let the user backdate the clock-in; device clock is user-editable. The app is a personal helper.
- **Decision:** record only the wall-clock time the user chose. Do not attempt to detect tampering. No separate "true" timestamp field.
- **Consequences:** no audit log; export/import (if added) round-trips the user-chosen values.

## ADR-010 — Day = local calendar day; midnight resets; no history

- **Context:** user expects "today" to be their local day; previous day should not bleed in; no night shifts; history is not needed.
- **Decision:** `date` is `YYYY-MM-DD` in local time. On app becoming visible past midnight, if the stored entry's date is earlier, delete it and show the clock-in view. Previous days are not stored beyond their lifetime.
- **Consequences:** no night-shift support; no historical view; storage footprint stays tiny.

## ADR-011 — Day modeled as ordered work/break segments

- **Context:** user can clock out and back in multiple times per day; mandatory breaks are forced pauses within the day; both need clear start/end timestamps for the timer and the break overlay.
- **Decision:** represent a day as an ordered list of `Segment`s, each either `{ type: 'work', start, end? }` or `{ type: 'break', start, end?, duration: 30 | 15 }`. The currently-open segment has `end === undefined`.
- **Consequences:** accumulated worked time = sum of `work` segment durations (breaks excluded by construction); breaks have concrete start/end for the countdown UI; multiple sessions are first-class.

## ADR-012 — Mandatory breaks fire on accumulated worked time

- **Context:** the 6h / 9h thresholds could be wall-clock-from-first-start or accumulated worked time. The latter matches labor-rule intent (breaks don't count as work).
- **Decision:** thresholds use **accumulated worked time** (sum of `work` segment durations, excluding breaks). The 30 min break fires once when worked time first reaches 6h; the 15 min break fires once when worked time first reaches 9h after the 30 min break.
- **Consequences:** with a 30 min break at 6h, the 15 min break fires at 9h worked = 9h30m wall-clock from start (ignoring other pauses). Recomputation is needed after any segment mutation.

## ADR-013 — Break overlay with auto-resume; clock-out disabled during break

- **Context:** when a mandatory break fires, the user needs to know it is happening and how long remains; breaks are mandatory.
- **Decision:** while a mandatory break is live, the UI shows an inline banner with an MM:SS countdown. When `nowSec >= trigger + duration`, the break auto-closes and state reverts to `running`. Clock-out is **allowed** during a mandatory break (supersedes the original 'disabled' decision): clocking out closes the open punch, ends the day, and retains the derived break segment in the timeline.
- **Consequences:** breaks still cannot be *skipped* while the user remains clocked in; the only way to end a live break early is to clock out, which ends the day.

## ADR-014 — +min buttons move the open work segment's start earlier

- **Context:** the +1/+5/+10 min buttons exist to correct for the delay between the terminal clock-in and opening the app. The user actually started a bit before the recorded instant, so worked time should grow.
- **Decision:** `+Nmin` decreases the `start` of the currently-open work segment by `N * 60_000` ms. No matching "−" buttons in scope.
- **Consequences:** elapsed grows by N minutes; break thresholds may be reached earlier than the original timeline; the recompute step handles this automatically.

## ADR-015 — Editing clock-in recomputes break eligibility

- **Context:** if the user edits the clock-in time after a break has already fired, the prior break may no longer be valid (or a new one may be due).
- **Decision:** any mutation to segment timestamps triggers a full recompute of the break state from the start of the day. Existing break segments may be removed, moved, or new ones inserted.
- **Consequences:** the recompute algorithm must be deterministic and idempotent; covered by unit tests.

## ADR-016 — Explicit clock-out; clock-in resumes

- **Context:** users take personal errands mid-day and need the timer to stop and resume.
- **Decision:** provide a clock-out action that closes the current open work segment. A subsequent clock-in appends a new work segment. Accumulated worked time is the sum across all work segments of the day.
- **Consequences:** the entry may have many work segments; the recompute algorithm walks them all in order.

## ADR-017 — Clocked-out view shows the worked-time account + Reset day

- **Context:** when clocked out, the UI collapsed to a plain clock-in button with no "Ready to work?" heading; the user lost visibility of how much they had already worked today and had no way to reset the day without clocking back in.
- **Decision:** in `ClockInView`, when `store.viewState.kind === 'clocked-out'`, render `formatHHMM(store.workedMs)` above the red button with the label "Worked today", and surface a "Reset day" button below the custom-time picker (same styling/action as `RunningView`'s reset). The heading stays "Ready to work?".
- **Consequences:** the worked-time account is visible without re-clocking-in; Reset is reachable from both running and clocked-out views; the display is static when clocked out (no open work segment, so `workedMs` doesn't change between ticks); covered by new component tests.

## ADR-018 — Build and deploy via GitHub Actions to GitHub Pages

- **Context:** the app is a static PWA that Vite builds into a `dist/` folder. It needs to be hosted somewhere HTTPS-enabled for the service worker to register. The source is on GitHub and the project has no backend, so GitHub Pages is a natural zero-cost fit.
- **Decision:** deploy with a GitHub Actions workflow that builds on every push to `main` and publishes `dist/` to Pages via `actions/deploy-pages`. The Vite `base` is set to `/clocked/` (matching the repo name as a project site) via the `BASE_URL` environment variable in CI. The PWA manifest's `start_url` and `scope` match this base.
- **Consequences:** deployment is automatic on push; the service worker scope is `/clocked/` so the PWA registers correctly under the sub-path; local `pnpm dev` is unaffected (defaults to `/`); the `BASE_URL` env var must be present during production build for the paths to be correct.

## ADR-019 — Two-object-store schema: `settings` + `worktime`

- **Context:** the original single-store `entries` model (one row per day, keyed by date, with work/break segments) was replaced to simplify manual in/out tracking. The new model needs both long-lived configurable settings and a per-day punch list that resets at midnight.
- **Decision:** DB `clocked` at version 2. Two object stores, each holding a single record with an out-of-line key:
  - `settings` (key `'settings'`): persistent key-value record with daily target/limit and configurable break thresholds.
  - `worktime` (key `'worktime'`): today's in/out punches as seconds-since-midnight; cleared at midnight rollover.
- **Consequences:** schema is cleanly separated; settings survive midnight; worktime is ephemeral per day; version 2 upgrade drops the old `entries` store (no migration — no real user data exists).

## ADR-020 — Drop `entries` store without migration

- **Context:** the existing `entries` store holds data in a fundamentally incompatible shape (epoch-ms segments with explicit break segments). The codebase is a fresh scaffold with no real user data.
- **Decision:** in the DB upgrade from v1→v2, delete the `entries` object store if present. Do not attempt to convert old data to the new punch format.
- **Consequences:** any IndexedDB data from a prior session is silently discarded on upgrade. Clean slate.

## ADR-021 — Punches stored as seconds-since-midnight

- **Context:** worktime resets every midnight. Using epoch-ms would require comparing dates across records; seconds-since-midnight naturally scopes to the current day and is reset-friendly.
- **Decision:** in the `worktime` store, `in` and `out` values are integer seconds elapsed since midnight of the current local day (range 0–86399). An open punch has `out === undefined`.
- **Consequences:** if a user is clocked in across midnight, the worktime is cleared and the in-punch is lost (consistent with ADR-010). No night-shift support. Conversion utility `secondsSinceMidnight(epochMs)` in `src/domain/date.ts`.

## ADR-022 — Break derivation from gaps + configurable triggers

- **Context:** breaks are no longer stored as explicit segments. Instead they are derived algorithmically from the gap between punches (real-world pauses) plus mandatory-break durations from settings when gaps don't suffice. This mirrors the user's description: "if there is a gap of at least the duration of break1_duration, this shall be used as the first mandatory break time. Otherwise, the clocked worktime shall pause for the duration of a mandatory break and then resume."
- **Decision:** the recompute algorithm (a) accumulates worked gross from in/out deltas, (b) collects gaps between consecutive punches, (c) for each enabled break (break1 then break2; break2 only after break1 satisfied), when accumulated worked time crosses the trigger threshold, consumes a qualifying gap or introduces a mandatory pause. If total gap time ≥ sum of enabled break durations, gaps cover all break time.
- **Consequences:** no break segments stored; the break overlay is driven by derived `breakEndsAt`; the algorithm is deterministic and idempotent. The hardcoded 6h/9h thresholds are replaced by the configurable `Settings.break1_trigger`/`break2_trigger`.

## ADR-023 — break2_enabled requires break1_enabled

- **Context:** the user specified that break2 should only be eligible if break1 is enabled. This prevents a scenario where the second mandatory break fires without the first.
- **Decision:** enforce in `setSettings`: if `break1_enabled` is set to `false`, cascade-disable `break2_enabled` to `false`. Setting `break2_enabled` to `true` when `break1_enabled` is `false` is rejected (no-op). The recompute algorithm also defensively skips break2 if break1 is disabled.
- **Consequences:** invariant holds at all layers (settings setter, recompute). Tested in both settings tests and debug API tests.

## ADR-024 — Injectable clock (`src/domain/clock.ts`)

- **Context:** the recompute algorithm and store need to read the current time. Tests and the developer debug API need to control time deterministically without mocking `Date.now()` globally.
- **Decision:** introduce a single `now()` function in `src/domain/clock.ts` backed by an injectable `ClockFn`. Default returns `Date.now()`. `setClock(fn | null)` swaps it. The store and all downstream functions call `clock.now()` instead of `Date.now()`.
- **Consequences:** production behavior is unchanged (default fn). Tests inject a deterministic clock. The debug API's `tickTo`/`tickForward`/`useRealClock` operate through `setClock`.

## ADR-024 — Worked time freezes during a live mandatory break; breakSeconds counts up

- **Context:** the original FX1 fix (doc/fix/01-break-derivation-fixes.md step 5/6) prescribed deducting the full break duration from worked time the instant a mandatory break triggers (live or elapsed). This caused `workedSeconds` to jump down by 30 min at break start and tick back up during the break — the opposite of the intended "work time freezes during break" behavior documented in `test-vnv-strategy.md:18`.
- **Decision:** during a live mandatory break (`nowSec < trigger + duration`), `mandatoryBreakSeconds` adds only the elapsed break time `nowSec - trigger` (capped at the break duration). Once the break elapses (`nowSec >= trigger + duration`), the full duration is deducted. `workedSeconds = workedGross - breakSeconds` thus freezes at the trigger value while the break is live, and `breakSeconds` counts up from 0 to the break duration.
- **Consequences:** the big elapsed display (`workedSeconds`) pauses at the trigger (e.g. 6h) for the 30 min break, then resumes. The "Breaks" stat (`breakSeconds`) shows 0 → 30 min during the live break. The `mandatory-break` segment in the timeline still spans the full future `trigger + duration` so the banner countdown is correct. Supersedes the live-break deduction in FX1 (ADR-022/FX1 step 5/6).

## ADR-024b — Break2 fires at correct time (consumed includes break duration in elapsed path)

- **Context:** in the elapsed mandatory break path, `consumed` only included the time to reach the trigger, not the break duration itself. This made `remainingDur = dur - consumed` count the break time as work time, and `workedElapsed += dur - consumed` accumulated wall-clock instead of worked time. As a result, break2 fired 30 min early (at 9h wall clock = 8h30m worked instead of 9h wall clock = 9h worked).
- **Decision:** in the elapsed path for both break1 and break2, add the break duration to `consumed` after inserting the mandatory break. This excludes the break duration from `remainingDur` (used for the next break's trigger check) and from the `workedElapsed` accumulation.
- **Consequences:** break2 now fires at the correct worked time (9h = 9h30m wall clock after a 30min break). The fix applies to any future break (break3, etc.) by the same pattern.

## ADR-025 — Always-on developer debug API (`window.__clocked`)

- **Context:** the user requested a way to test times as a developer in the browser console without modifying app code. The debug API needs to be available unconditionally (chosen over DEV-only gating).
- **Decision:** expose a `window.__clocked` object installed at app boot. Getters re-evaluate on each access. Mutations write through to real IndexedDB (so test data survives reload). Key methods: `setSettings`, `setPunches`, `punchIn`/`punchOut`, `tickTo`/`tickForward`/`useRealClock`, `simulateMidnight`, `clear`, `resetSettings`, `state` snapshot, `help()`. All methods operate through the real store and storage layer.
- **Consequences:** developers can test arbitrary in/out patterns and verify break firing without building a dedicated UI. The API ships in production (always on) but is unobtrusive — only accessible via the console. The injectable clock (ADR-024) is consumed here.

## ADR-026 — Redesign UI (dark mono + acid green, mandatory-break banner)

- **Context:** the WP4 UI had a functional but visually unpolished design: red/gray palette, break overlay as a full-screen modal, +Nmin/custom-time/edit-start affordances for in/out punch adjustment. The user commissioned a Figma redesign (v1.0) with a dark mono palette, acid-green accent (`#b8ff57`), JetBrains Mono typeface, mandatory-break banner (inline, not overlay), and a gear-cog settings dialog.
- **Decision:** strip all WP4 visual scaffolding. New palette: `--color-bg: #0a0a0a`, `--color-surface: #141414`, `--color-work: #b8ff57`, `--color-break: #a0a0a0`, etc. Delete `BreakOverlay.vue`. Rewrite `ClockInView.vue` and `RunningView.vue` with rectangular buttons, status dot, timeline strip, stats grid, daily target bar, milestone hint, mandatory-break countdown banner. Add `SettingsDialog.vue` (modal overlay with two NumberInputs and a Toggle per break). Add `ui/NumberInput.vue` and `ui/Toggle.vue` shared components. All WP4 affordances (+Nmin, custom-time, edit-start, reset-day, "Ready to work") removed. The data model and store are unchanged; the redesign is purely a UI/component layer change.
- **Consequences:** WP4 and WP6 doc files are superseded and carry a banner. `Segments` getter added to the store (WP9-T3) solely for the timeline and stats display — the data model types are unchanged at the persistence level. The mandatory-break banner counts down in MM:SS format (the only exception to HH:MM display per ADR-006). No new diagrams are needed — the architecture is identical to WP8 except for the component list.

## Resolved (no longer pending)

All questions in `discussion.md` have been answered. New decisions will be appended here as they arise during implementation.

## ADR-027 — Per-gap break classification (superseded by ADR-028)

- **Context:** the original aggregate gap rule (ADR-022) summed all gaps and compared against the total required break time. This allowed many small gaps (e.g. bathroom breaks) to satisfy mandatory break requirements, which doesn't match labor-rule intent.
- **Decision:** a gap counts as a break only if it is strictly longer than that break's own duration. 
  - break1 is satisfied by a gap `> break1_duration`.
  - The same gap also satisfies break2 if `> break1_duration + break2_duration` (a "very long" gap).
  - break2 can be satisfied by a *later* gap `> break2_duration`, but only after break1 is already satisfied.
  - Only the consumed break durations count toward `breakSeconds`; the remainder of a satisfying gap is "clocked out" time (neither work nor break).
  - If no qualifying gap exists by the time worked time crosses a break's trigger, a mandatory pause of that break's full duration is injected at the trigger point. The pause is "live" while `nowSec < trigger + duration` (banner shows countdown), then "elapsed" thereafter (historical segment, state reverts to `running`, walk continues for next break).
- **Consequences:** short gaps no longer cover mandatory breaks; the timeline still shows them as `gap-break` segments. The mandatory-break expiry (Bug A) and break2 reachability (Bug B) fall out naturally from the per-break walk. Clock-out during a live break (Bug C) is now permitted and ends the day cleanly.

## ADR-028 — Gaps are neutral; mandatory breaks fitted at gap start

- **Context:** the per-gap break classification (ADR-027) still treated qualifying gaps as `gap-break` segments and counted them toward `breakSeconds`. The user clarified that gaps should be **neutral** — neither work nor break — except when a mandatory break is fitted into a gap. When a gap is long enough to contain a mandatory break (`gap >= break_duration`), the break is placed at the **beginning** of the gap as a `mandatory-break` segment, and the gap remainder becomes a neutral `gap` segment. The break order is maintained (break1 before break2, both can be fitted into the same gap if long enough). If a gap does not fit a break, the entire gap is neutral and the mandatory pause is injected at the trigger during work.
- **Decision:**
  1. Replace `gap-break` segment type with `gap` (neutral).
  2. When a gap satisfies a break (`gap >= break_duration`), create a `mandatory-break` segment at the gap start (counts toward `breakSeconds` via `mandatoryBreakSeconds`), then a `gap` segment for the remainder.
  3. If a gap satisfies both breaks, create `mandatory-break` (break1) followed by `mandatory-break` (break2) at the start of the gap, then `gap` for the remainder.
  4. Change gap-satisfies condition from `>` to `>=` ("can fit" means at least as long).
  5. `gapBreakSeconds` is removed; `breakSeconds = mandatoryBreakSeconds` only.
  6. Timeline renders `gap` with neutral color/label ("Gap"), `mandatory-break` as "Brk" + "auto" tag with break color, `work` as before.
- **Consequences:** the "Breaks" stat now shows only mandatory break time. Gaps are visually neutral in the timeline. The mandatory-break logic is unchanged (breaks still fire at triggers when no fitting gap exists). ADR-027's gap-counting portion is superseded; the per-gap walk and break order remain.
