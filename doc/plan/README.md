# Implementation plan

Step-by-step plan for implementing the Clocked PWA. Designed to be executed by a smaller agent working one task at a time.

## How to use this plan

1. Work the work packages **in strict order**: WP0 → WP8 → WP1 → ... → WP7. WP8 restructures storage from the old `entries`/segment model to the new `settings`+`worktime`/in-out-punch model and must be completed before any WP1–WP3 tasks are attempted, since those packages describe the old model. Do not skip ahead.
2. Within each WP, work the tasks in order (T1, T2, ...). Tasks have explicit `Dependencies` listing prior task IDs.
3. Each task has: **Goal**, **Files**, **Approach** (with code skeletons where helpful), **Dependencies**, **Acceptance criteria**, **V&V**, **Pitfalls**.
4. After every task, run the V&V commands listed. Do not mark a task done until acceptance criteria are met **and** V&V passes.
5. After every WP, also run the global V&V from `doc/test-vnv-strategy.md` (`pnpm lint && pnpm typecheck && pnpm build && pnpm test`).
6. Update `doc/discussion.md` if you discover a constraint that contradicts these docs — do not silently deviate.

## File index

| File | Work package | Tasks |
| --- | --- | --- |
| `00-scaffolding.md` | WP0 — Project scaffolding | 11 |
| `01-domain.md` | WP1 — Core domain logic | 6 |
| `02-storage.md` | WP2 — Storage layer | 4 |
| `03-store.md` | WP3 — Pinia store | 8 |
| `04-ui.md` | WP4 — UI components | 5 |
| `05-pwa.md` | WP5 — PWA wiring | 5 |
| `06-styling.md` | WP6 — Styling & polish | 5 |
| `07-vnv.md` | WP7 — Manual V&V | 9 |
| `08-restructure-storage.md` | WP8 — Storage restructure (settings + worktime) | 12 |
| `09-redesign-ui.md` | WP9 — UI redesign (Figma v1.0) | 10 |

**Total: ~75 tasks.**

**Note on WP8:** This work package supersedes parts of WP1, WP2, and WP3. After WP8 is complete, the old `entries` store, `Entry`/`Segment` types, and `recomputeBreaks` function are removed. Do not work WP1/WP2/WP3 tasks before WP8 — they describe the old model.

**Note on WP9:** This work package supersedes WP4 and WP6 for the visual layer. Work WP9 only after WP8 — it depends on the new store getters and the `Recomputed.segments` field added in WP9-T2/T3, which build on the WP8 punch/settings model. WP4's data-flow, lifecycle, and accessibility guidance still apply where WP9 does not override them. The WP4 `BreakOverlay` component is deleted by WP9-T9; mandatory breaks are rendered inline by `RunningView`.

## Library versions (majors pinned)

All `package.json` installs should use these major version ranges (latest minor/patch within the major is fine):

Runtime:
- `vue@^3.5`
- `pinia@^2.2`
- `@vueuse/core@^11`

Dev:
- `vite@^5.4`
- `@vitejs/plugin-vue@^5.1`
- `vue-tsc@^2.1`
- `vite-plugin-pwa@^0.20`
- `idb@^8`
- `tailwindcss@^4`
- `@tailwindcss/vite@^4`
- `vitest@^2.1`
- `@vue/test-utils@^2.4`
- `happy-dom@^15`
- `fake-indexeddb@^6`
- `eslint@^9`
- `@vue/eslint-config-typescript@^14`
- `eslint-plugin-vue@^9`
- `typescript@^5.6`

## Global conventions

- **Package manager:** `pnpm` only. Do not commit `package-lock.json` or `yarn.lock`.
- **TypeScript:** strict mode. No `any` without a comment explaining why.
- **File layout (post-WP8):**
  ```
  src/
    domain/        # pure logic, no Vue dependency
      types.ts
      date.ts
      format.ts
      clock.ts          # injectable clock (now() / setClock)
      recompute.ts      # break derivation from punches + settings
      settings.ts       # settings merge-patch + invariant enforcement
      adjust.ts         # adjust first punch in
      *.test.ts
    storage/       # idb wrapper
      db.ts
      settings.ts
      worktime.ts
      persist.ts
      *.test.ts
    debug/         # console debug API
      api.ts
      global.d.ts
      *.test.ts
    stores/        # Pinia
      clock.ts
      clock.test.ts
    components/    # Vue SFCs
      ClockInView.vue
      RunningView.vue
      BreakOverlay.vue
    App.vue
    main.ts
  ```
- **Tests live next to the source file** as `*.test.ts`.
- **No comments in code** unless asked. Self-documenting names.
- **Lint → typecheck → build → test** order before every commit (see `AGENTS.md`).
