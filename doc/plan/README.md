# Implementation plan

Step-by-step plan for implementing the Clocked PWA. Designed to be executed by a smaller agent working one task at a time.

## How to use this plan

1. Work the work packages **in strict order**: WP0 → WP1 → ... → WP7. Do not skip ahead.
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

**Total: ~53 tasks.**

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
- **File layout:**
  ```
  src/
    domain/        # pure logic, no Vue dependency
      types.ts
      date.ts
      format.ts
      recomputeBreaks.ts
      *.test.ts
    storage/       # idb wrapper
      db.ts
      entries.ts
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
