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

## ADR-006 — Display `HH:MM`, internally count seconds/ms

- **Context:** user wants hours and minutes; tracking seconds precisely is needed for break thresholds.
- **Decision:** the store computes everything in ms; the UI formats as `HH:MM` (no seconds).
- **Consequences:** the per-second tick only updates the display; thresholds are derived from `Date.now() - startEpochMs`.

## ADR-007 — Timer survives screen lock via stored start timestamp

- **Context:** iOS pauses JS timers in background; a running interval cannot be relied on.
- **Decision:** do not tick while hidden. On `visibilitychange` -> visible, recompute elapsed from `startEpochMs` and the break state.
- **Consequences:** no drift; correct time shown immediately on resume; the per-second tick is purely cosmetic.

## ADR-008 — No backend, fully offline

- **Context:** product must work in airplane mode; privacy of personal work times.
- **Decision:** no backend, no runtime network calls. App must remain usable after first install with no connectivity.
- **Consequences:** no analytics, no remote config, no auth.

## ADR-009 — Device clock is not trusted for tamper-evidence

- **Context:** the +min buttons and the OS time picker intentionally let the user backdate the clock-in; device clock is user-editable.
- **Decision:** record only the wall-clock time the user chose. Do not attempt to detect tampering.
- **Consequences:** no separate "true" timestamp field; export/import (if added) round-trips the user-chosen value.

## ADR-010 — Day = local calendar day; midnight resets

- **Context:** user expects "today" to be their local day; previous day should not bleed in.
- **Decision:** `date` is `YYYY-MM-DD` in local time. On app becoming visible past midnight, if the stored entry's date is earlier, delete it and show the clock-in view.
- **Consequences:** no night-shift support (pending — see `discussion.md` q1).

## Pending decisions (tracked in `discussion.md`)

- History beyond today vs. delete-at-midnight (q2).
- Explicit clock-out vs. continuous session until midnight (q3).
- Break UX: auto-resume vs. manual tap (q4).
- Break threshold basis: wall-clock vs. worked-time (q5).
- Adjustment button direction / sign (q6).
- Multiple sessions per day (q7).
- Re-editing clock-in after a break has triggered (q8).
- Audit fields given ADR-009 (q9).
