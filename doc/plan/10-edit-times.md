# WP10 — Editable punch times (Timeline → time-picker dialog)

Goal: let the user edit any `in`/`out` punch of the current day by clicking the **Timeline** (track bar or any segment list row). A modal styled identically to `SettingsDialog` opens, listing every punch event ("Clocked in", "Clocked out") as its own row with the time as an `<input type="time">`. Tapping the time uses the OS-native time picker. Save commits through a new store action `replacePunches`; out-of-order edits are rejected with an inline error and the dialog stays open.

Scope: **edit only** (no add/delete punches). The running punch has only a "Clocked in" row (no "Clocked out" row appears).

**Strict order:** T1 → T2 → T3 → T4 → T5 → T6.

---

## WP10-T1 — Time↔seconds domain helpers

- **Goal:** Add pure functions to convert between seconds-since-midnight and the `"HH:MM"` string format used by `<input type="time">`. These are reused by the dialog (T3) and unit-tested in isolation. They live in the domain layer so they can be exercised without Vue.
- **Files:** `src/domain/format.ts` (add functions), `src/domain/format.test.ts` (add cases).
- **Approach:**

  Add to `src/domain/format.ts`:
  ```ts
  const SECONDS_PER_DAY = 86400

  export function secToTimeInput(sec: number): string {
    const clamped = Math.max(0, Math.min(SECONDS_PER_DAY - 1, Math.round(sec)))
    const h = Math.floor(clamped / 3600)
    const m = Math.floor((clamped % 3600) / 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  export function timeInputToSec(value: string): number {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
    if (!m) return 0
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
    return Math.max(0, Math.min(SECONDS_PER_DAY - 1, h * 3600 + min * 60))
  }
  ```
  Why clamp to `[0, 86399]`: punches are seconds-since-midnight (ADR-010) and the existing store/`recompute` code assumes that range. The OS picker can only return `HH:MM`, so sub-minute precision is intentionally dropped — seconds are zeroed on edit (documented ADR, see T6).

  Add to `src/domain/format.test.ts`:
  - `secToTimeInput(0)` → `"00:00"`, `(28800)` → `"08:00"`, `(86399)` → `"23:59"`.
  - `secToTimeInput` clamps negatives and `>= 86400` to the valid range.
  - `timeInputToSec("08:00")` → `28800`, `"00:00")` → `0`, `"23:59")` → `86399`.
  - `timeInputToSec` clamps `"24:00"` → `86399`, `"-01:00")` → `0`, and returns `0` for garbage like `""` / `"abc"` / `"8"` (the regex only matches `H:M`).
  - Round-trip: `timeInputToSec(secToTimeInput(s))` equals `s` (rounded to the minute) for any `s` in range — note that `s = 28830` (08:00:30) rounds to `"08:00"` and back to `28800`.

- **Dependencies:** none.
- **Acceptance criteria:**
  - `pnpm test -- src/domain/format.test.ts` passes.
  - `pnpm typecheck` clean.
- **V&V:** `pnpm typecheck && pnpm test -- src/domain/format.test.ts`.
- **Pitfalls:**
  - `<input type="time">` returns `"HH:MM"` (24h) in most browsers; some older iOS variants may include seconds (`"HH:MM:SS"`). The regex only matches `H:M`; if seconds appear, the value is rejected → `0`. If you need to support seconds, extend the regex to `^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$` and add `s*60`. Keep the simpler version first; verify on iOS in manual V&V (T6) before extending.
  - Do not use `new Date()` to compute these — keep the functions pure and timezone-free (seconds-since-midnight is a local-day concept, not an epoch).

---

## WP10-T2 — `replacePunches` store action

- **Goal:** Add a single store action that replaces today's entire `punches` array, recomputes `_isClockedIn` from the last punch, and persists. Refactor the existing debug `setPunches` helper to call this action instead of mutating state directly — this routes all punch mutations through the store (single source of truth for normalization and persistence) and keeps the debug API honest.
- **Files:** `src/stores/clock.ts` (add action), `src/stores/clock.test.ts` (add cases), `src/debug/api.ts` (refactor `setPunches`), `src/debug/api.test.ts` (adjust expectations if needed).
- **Approach:**

  In `src/stores/clock.ts`, add inside `actions`:
  ```ts
  async replacePunches(punches: Array<{ in: number; out?: number }>) {
    if (!this.worktime) return
    this.worktime.punches = punches.map(p => ({
      in: Math.max(0, Math.min(86399, Math.round(p.in))),
      ...(p.out === undefined ? {} : { out: Math.max(0, Math.min(86399, Math.round(p.out))) }),
    }))
    const last = punches[punches.length - 1]
    this._isClockedIn = !!(last && last.out === undefined)
    await this.persistAndRecompute()
  },
  ```
  Notes:
  - The action **copies/clamps** each punch defensively. The dialog (T3) validates before calling, but the store is the last line of defense against bad data entering `recompute`.
  - Recompute `_isClockedIn` from the last punch's `out` — this matches the logic currently inlined in the debug `setPunches` and in `init()`. If the dialog commits a draft where the last punch now has an `out`, the app transitions to `clocked-out` automatically.
  - The existing `editClockIn(newIn)` action stays — it is used by `adjustStart`-style paths and tests. (Optionally mark it `@deprecated` in a comment is forbidden by the "no comments" rule — just leave it.)

  In `src/debug/api.ts`, change `setPunches` to:
  ```ts
  setPunches: async (punches: Array<{ in: number; out?: number }>) => {
    if (!store.worktime) {
      store.worktime = { date: todayString(new Date(now())), punches: [] }
    }
    await store.replacePunches(punches)
  },
  ```
  This keeps the debug API's behavior (it can seed punches even when no worktime exists yet — note the added branch for the empty-worktime case, since `replacePunches` no-ops when `worktime` is null) while delegating to the action. Verify `src/debug/api.test.ts` still passes; if any test asserted the old direct-mutation shape, update it to assert the same end state through the action.

  **Tests to add in `src/stores/clock.test.ts`** (new `describe('replacePunches', ...)` block):
  - After `clockIn` at 08:00, call `replacePunches([{ in: 25200 }, { in: 28800, out: 32400 }])` → `worktime.punches` deep-equals the clamped input, `_isClockedIn === false` (last punch has `out`), `viewState.kind === 'clocked-out'`.
  - Running punch preserved: `replacePunches([{ in: 28800 }])` → `_isClockedIn === true`, `viewState.kind === 'running'`.
  - Clamping: `replacePunches([{ in: -100 }, { in: 90000, out: 100000 }])` → `punches[0].in === 0`, `punches[1].in === 86399`, `punches[1].out === 86399`.
  - No-op when `worktime` is null: `store.worktime = null; await store.replacePunches([...])` → `store.worktime` stays null.
  - Persistence: after `replacePunches`, `await getWorktime()` deep-equals `store.worktime` (mirrors the existing `persisted worktime matches in-memory` test pattern at `src/stores/clock.test.ts:103`).

- **Dependencies:** none (uses existing `persistAndRecompute`).
- **Acceptance criteria:**
  - All new and existing store tests pass.
  - `pnpm test -- src/debug/api.test.ts` still passes (debug API behavior unchanged from a caller's perspective).
  - `pnpm typecheck` clean.
- **V&V:** `pnpm typecheck && pnpm test -- src/stores/clock.test.ts src/debug/api.test.ts`.
- **Pitfalls:**
  - Do **not** mutate the caller's array — `punches.map(...)` produces a fresh array. The dialog keeps its own draft and passes it in; if it reused the same array reference, later edits would alias.
  - Keep `out === undefined` as the "open punch" sentinel; do **not** coerce `undefined` to `0`. The conditional spread `...(p.out === undefined ? {} : { out: ... })` preserves the absence of `out`.
  - `_isClockedIn` must be recomputed from the *new* last punch, not the old one. A common bug is computing it before assigning `this.worktime.punches`.

---

## WP10-T3 — `EditTimesDialog` component

- **Goal:** Build the modal, structurally mirroring `SettingsDialog.vue` (same overlay/backdrop/×-button/Cancel-Save footer), that lets the user edit every punch event via `<input type="time">`. One row per event: each punch contributes a "Clocked in" row, and (only if `out !== undefined`) a "Clocked out" row directly below it. The currently-running punch has only its "Clocked in" row. Editing a time opens the OS-native time picker (the browser handles this for `<input type="time">`). Save validates; on success it calls `store.replacePunches(draft)` and emits `close`; on validation failure it shows an inline error and stays open.
- **Files (new):** `src/components/EditTimesDialog.vue`, `src/components/EditTimesDialog.test.ts`.
- **Approach:**

  The dialog holds a **draft** deep copy of `store.worktime.punches` (seeded in `setup` from the current store state — same pattern as `SettingsDialog`'s `draft` reactive). It builds a flat event list for rendering but keeps the draft as the canonical punches array.

  ```vue
  <script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { secToTimeInput, timeInputToSec } from '@/domain/format'

  const emit = defineEmits<{ close: [] }>()
  const store = useClockStore()

  interface DraftPunch { in: string; out: string | null }

  const draft = reactive<DraftPunch[]>(
    (store.worktime?.punches ?? []).map(p => ({
      in: secToTimeInput(p.in),
      out: p.out === undefined ? null : secToTimeInput(p.out),
    })),
  )

  const rows = computed(() => {
    const r: Array<{ punchIndex: number; field: 'in' | 'out'; label: string; value: string }> = []
    draft.forEach((p, i) => {
      r.push({ punchIndex: i, field: 'in', label: 'Clocked in', value: p.in })
      if (p.out !== null) r.push({ punchIndex: i, field: 'out', label: 'Clocked out', value: p.out })
    })
    return r
  })

  const error = ref<string | null>(null)

  function validate(): string | null {
    const punches = draft.map(p => ({
      in: timeInputToSec(p.in),
      ...(p.out === null ? {} : { out: timeInputToSec(p.out) }),
    }))
    for (const p of punches) {
      if (p.out !== undefined && p.out < p.in)
        return 'Clocked-out time cannot be before clocked-in time.'
    }
    for (let i = 0; i < punches.length - 1; i++) {
      const out = punches[i].out
      if (out !== undefined && out > punches[i + 1].in)
        return `Punch ${i + 1} ends after punch ${i + 2} starts.`
    }
    return null
  }

  async function save() {
    const err = validate()
    if (err) { error.value = err; return }
    const punches = draft.map(p => ({
      in: timeInputToSec(p.in),
      ...(p.out === null ? {} : { out: timeInputToSec(p.out) }),
    }))
    await store.replacePunches(punches)
    emit('close')
  }
  </script>

  <template>
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background-color: rgba(0,0,0,0.8)"
      @click.self="emit('close')"
    >
      <div class="bg-surface border border-border-2 w-full max-w-md mx-4">
        <div class="flex items-center justify-between px-6 py-4 border-b border-border">
          <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Edit times</span>
          <button
            type="button"
            class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
            aria-label="Close"
            @click="emit('close')"
          >×</button>
        </div>

        <div class="px-6 py-5 flex flex-col gap-3">
          <div
            v-for="(row, i) in rows"
            :key="`${row.punchIndex}-${row.field}`"
            class="flex items-center justify-between"
          >
            <span class="font-mono text-sm text-text-dim">{{ row.label }}</span>
            <input
              type="time"
              :value="row.value"
              @change="(e: Event) => {
                const v = (e.target as HTMLInputElement).value
                draft[row.punchIndex][row.field] = v
                error.value = validate()
              }"
              class="font-mono text-sm w-24 bg-surface border border-border-2 text-text px-2 py-1 text-right focus:outline-none focus:border-work"
            />
          </div>

          <div v-if="error" class="font-mono text-xs text-overtime mt-2">
            {{ error }}
          </div>
        </div>

        <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            class="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-border-2 text-text-faint hover:text-text hover:border-text-faint transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            type="button"
            class="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-work text-bg font-bold hover:bg-work-hi transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="error !== null"
            @click="save"
          >Save</button>
        </div>
      </div>
    </div>
  </template>
  ```
  Key points:
  - **Why per-event rows:** the user explicitly said "in a list all events like clocked in and clocked out" — one row per event, not one row per punch. The flat `rows` computed + `punchIndex`/`field` back-references achieve this while keeping the draft as the canonical punches array.
  - **Why live validation + disabled Save:** matches the no-tinkering philosophy of the rest of the UI. The error updates on every `@change` so the user sees it disappear as they fix the value; Save is gated by `:disabled="error !== null"` so a click never silently does nothing.
  - **Why `<input type="time">`:** this is the standard, reliable way to invoke the OS-native time picker on Android (WebAPK) and iOS. No JS time-picker library is needed; the AGENTS.md "keep the app usable in airplane mode" rule forbids remote dependencies, and a custom wheel picker is out of scope.
  - The modal reuses the **exact class structure** of `SettingsDialog.vue` (overlay `fixed inset-0 z-50`, panel `bg-surface border border-border-2 w-full max-w-md mx-4`, header/footer dividers, button variants) so the visual language is identical.
  - `error` is a plain `ref` (add `ref` to the vue import list — it is missing in the skeleton above; remember to include it). Use `text-overtime` (red) for the error text — that token exists in `main.css` from WP9-T1.

  **Tests** (`src/components/EditTimesDialog.test.ts`, mirroring `SettingsDialog.test.ts`):
  - Mounts with `store.worktime = { date, punches: [{ in: 28800, out: 32400 }, { in: 36000 }] }` → renders four rows: `Clocked in`, `Clocked out`, `Clocked in` (the running punch has no out row). Assert `wrapper.findAll('input[type="time"]').length === 3`.
  - Assert the first time input's value is `"08:00"` (`secToTimeInput(28800)`).
  - Save happy path: spy on `store.replacePunches`, change the first input's value to `"07:30"`, click Save → `replacePunches` called with `[{ in: 27000, out: 32400 }, { in: 36000 }]` and `close` emitted.
  - Out-of-order: set the first out to `"06:00"` (before its in `"07:30"`) → the inline error text appears and contains "before"; Save is **disabled** (assert `:disabled` on the Save button) and `replacePunches` is **not** called; `close` is **not** emitted.
  - Cross-punch order: two punches `[{in:28800,out:36000},{in:32400}]` → the first `out` (10:00) exceeds the second `in` (09:00) → error mentions "after"; Save disabled.
  - Cancel button and backdrop click both emit `close` without calling `replacePunches`.
  - When `store.worktime` is null, mounting renders an empty body (no rows) and does not throw — defensive guard.

- **Dependencies:** WP10-T1 (helpers), WP10-T2 (`replacePunches`).
- **Acceptance criteria:**
  - `pnpm test -- src/components/EditTimesDialog.test.ts` passes.
  - `pnpm typecheck` clean.
  - Visual: `pnpm dev` → set punches via `window.__clocked.setPunches([...])` → click Timeline → dialog opens, tapping a time opens the OS picker (Chrome devtools shows the desktop picker; real device shows native), Save closes and updates the timeline.
- **V&V:** `pnpm typecheck && pnpm test -- src/components/EditTimesDialog.test.ts`, then `pnpm preview` on a phone for the real native-picker check.
- **Pitfalls:**
  - `@change` fires on picker selection and on blur/Enter; on desktop Chrome the time input emits intermediate states like `"07:"` while typing — using `@change` avoids spurious errors during typing. The native picker commits a full `HH:MM` on selection, which triggers `change`. This is the chosen approach (recorded in T6's ADR).
  - `defineEmits<{ close: [] }>()` — the close event has no payload, matching `SettingsDialog`.
  - Do **not** read `store.worktime` reactively inside the dialog — the draft is seeded once on mount; if the store changes underneath (e.g. a rollover while the dialog is open) the draft is stale by design. This matches `SettingsDialog`'s behavior.

---

## WP10-T4 — Wire `Timeline` to open the dialog

- **Goal:** Make the entire `Timeline` component (track bar + segment list rows) clickable to open `EditTimesDialog`. Use a local `ref<boolean>` in `Timeline.vue` (not lifted to parents) — the dialog is logically tied to the timeline, and `Timeline` is already rendered by both `ClockInView` and `RunningView`, so embedding keeps the wiring in one place. Add a cursor/affordance hint.
- **Files:** `src/components/Timeline.vue` (edit), `src/components/Timeline.test.ts` (add cases).
- **Approach:**

  In `src/components/Timeline.vue`:
  1. Import `ref` and `EditTimesDialog`.
  2. Add `const editOpen = ref(false)`.
  3. Wrap the existing root `<div v-if="store.segments.length > 0" ...>` content so the **whole** component is clickable: change the root to a `<button type="button" class="w-full max-w-xl text-left block" @click="editOpen = true" :aria-label="'Edit times'">` ... `</button>`. Then render the dialog: `<EditTimesDialog v-if="editOpen" @close="editOpen = false" />` after the button (as a sibling, not inside the button — modals should not nest in buttons).
  4. Add `cursor-pointer` and a subtle hover affordance (`hover:opacity-80 transition-opacity`) to the clickable container so users know it is interactive.
  5. Keep the existing `title` attributes on segments — they remain for hover tooltips; the click opens the dialog instead of doing nothing.

  Why a `<button>` wrapper rather than a `<div @click>`: accessibility — the whole timeline becomes a single focusable, keyboard-activatable control with a clear `aria-label`. The inner `<div>`s and `title`s remain non-interactive children (no nested buttons — the segment `<div>`s are not buttons, so this is valid HTML).

  Why embed the dialog in `Timeline` rather than lifting to `App.vue`: `Timeline` is the only entry point that needs it; embedding avoids threading an `@edit` event up through `ClockInView`/`RunningView` and back down as a prop. The dialog reads the store directly, so no props are needed beyond `@close`.

  **Tests** (`src/components/Timeline.test.ts`):
  - With segments present, clicking the timeline (e.g. `wrapper.find('button[aria-label="Edit times"]').trigger('click')`) → the dialog renders (assert text `Edit times` appears in `wrapper.text()`).
  - Closing the dialog (trigger `close` on the dialog component) sets `editOpen` back to false (the dialog text disappears).
  - When no segments, the timeline renders nothing and the button is absent (existing behavior preserved).

- **Dependencies:** WP10-T3.
- **Acceptance criteria:**
  - `pnpm test -- src/components/Timeline.test.ts` passes.
  - `pnpm dev`: click anywhere on the timeline (track or a row) opens the dialog; backdrop/×/Cancel close it.
- **V&V:** `pnpm test -- src/components/Timeline.test.ts` then `pnpm dev` smoke check.
- **Pitfalls:**
  - Do **not** put the dialog *inside* the `<button>` — it would render the modal markup as button content. Render it as a sibling after the button.
  - The existing `v-if="store.segments.length > 0"` gating stays on the clickable container — when there are no segments, nothing renders and no dialog can open (there's nothing to edit).
  - If the button wrapper breaks the existing flex/grid layout of the timeline rows, drop the `<button>` and instead use a `<div>` with `@click`, `tabindex="0"`, `role="button"`, and a `@keydown.enter` handler. The `<button>` approach is preferred for a11y but must not break the visual layout.

---

## WP10-T5 — Full V&V and integration test sweep

- **Goal:** Run the full verification suite and add any missing integration coverage. Catch regressions in `App.test.ts`, `RunningView.test.ts`, `ClockInView.test.ts` introduced by the Timeline wrapper change in T4 (e.g. an existing test that does `wrapper.find('button')` inside Timeline and now unexpectedly matches the new wrapper button).
- **Files:** `src/App.test.ts`, `src/components/RunningView.test.ts`, `src/components/ClockInView.test.ts` (only if tests break).
- **Approach:**
  1. Run `pnpm lint && pnpm typecheck && pnpm build && pnpm test`. Investigate any failure.
  2. Likely adjustments:
     - Any test that does `wrapper.find('button')` *inside* a mounted `Timeline` (none currently, but check) now finds the wrapper button — update selectors to be specific.
     - `RunningView.test.ts:66` does `await wrapper.find('button').trigger('click')` against `RunningView` — the first `<button>` in `RunningView` is the **Clock Out** button, not the timeline wrapper (the timeline renders later in the template). Confirm this still holds after T4; if the timeline's wrapper button now sorts first in DOM order, change the selector to find by text `Clock Out`.
     - `ClockInView.test.ts` similarly: the Clock In button should remain the first button. Confirm.
  3. Add an `App.test.ts` case: clock in, advance time, then assert the timeline is present and clickable (mount `App`, find the timeline button by aria-label, click, assert dialog text `Edit times` appears at the app root level).
  4. Manual PWA checks per `doc/test-vnv-strategy.md`:
     - `pnpm preview`, install the app, open it.
     - Use `window.__clocked.setPunches([{in:28800,out:32400},{in:36000}])` in the console, then tap the timeline → dialog opens → tap a time → native picker appears → change → Save → timeline updates.
     - Try an out-of-order edit → Save disabled, error shown.
     - Reload the page → edited times persist (proves `replacePunches` wrote through to IndexedDB).
     - Verify offline (airplane mode) that the dialog and picker still work (no remote dependency).

- **Dependencies:** WP10-T1 through T4.
- **Acceptance criteria:**
  - `pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green.
  - Manual checklist above all passes on at least one real device (Android + iOS if available).
- **V&V:** the commands above.
- **Pitfalls:**
  - The `@vue/test-utils` `find('button')` returns the **first** button in DOM order. After T4, the Timeline's wrapper button is added *inside* `Timeline`, which is rendered *after* the action buttons in `RunningView`/`ClockInView`. So DOM order should be unchanged — but verify rather than assume; test selectors are fragile.
  - iOS Safari's `<input type="time">` picker does not always fire `change` on dismiss — sometimes only on explicit "Done". Test this on a real device; if the draft doesn't update, switch to `@input` plus the "incomplete value = no error" validation strategy described in T3's pitfalls.

---

## WP10-T6 — Documentation updates

- **Goal:** Record the new capability and its constraints in the project docs so future sessions and the V&V checklist reflect it.
- **Files:** `doc/decisions.md` (new ADR), `doc/architecture.md` (UI section), `doc/test-vnv-strategy.md` (manual checklist), `doc/plan/README.md` (file index), `doc/plan/10-edit-times.md` (this file — drop in as the new WP).
- **Approach:**
  - In `doc/decisions.md`, append an ADR (next available number — check the file; likely ADR-025 or higher):
    - **Title:** "Editable punch times via the OS time picker from the Timeline."
    - **Context:** previously the only edit affordances were the WP4 `+Nmin`/`edit-start` controls, removed in WP9-T6/T7. The user requested that any in/out time be editable by clicking the timeline; the dialog reuses the `SettingsDialog` modal style and `<input type="time">` to invoke the OS-native picker (Android WebAPK + iOS add-to-home-screen).
    - **Decision:** clicking anywhere on the `Timeline` opens `EditTimesDialog`, which lists each punch's `in` and (if present) `out` as separate rows with `<input type="time">`. Save routes through the new `store.replacePunches(punches)` action, which clamps to `[0, 86399]` and recomputes `_isClockedIn` from the last punch. Out-of-order edits (`out < in`, or `punches[i].out > punches[i+1].in`) are rejected with an inline error and the Save button is disabled; the dialog stays open. The debug API `setPunches` is refactored to call `replacePunches` so all punch mutations go through one action.
    - **Consequences:** editing drops sub-minute precision (seconds are zeroed) because `<input type="time">` only carries `HH:MM`. This is acceptable: punch times are user-corrected approximations, and the device clock is already user-editable (ADR per `doc/decisions.md:57`). Deleting or adding punches is **not** supported from the UI — use the debug API for that.
  - In `doc/architecture.md`, add a short note in the UI section: "`Timeline` is clickable and opens `EditTimesDialog` (modal) for editing any punch's in/out via the OS time picker; see ADR-0xx."
  - In `doc/test-vnv-strategy.md`, add an "Edit times" manual checklist item: open dialog, edit a time, Save, verify timeline updates and persists across reload; verify out-of-order rejection; verify the OS native picker appears on a real device.
  - In `doc/plan/README.md`, add a row to the file index: `| 10-edit-times.md | WP10 — Editable punch times | 6 |` and bump the total count comment.
  - Drop this work-package description into `doc/plan/10-edit-times.md`.

- **Dependencies:** WP10-T1 through T5 (docs reflect what was actually built).
- **Acceptance criteria:** docs render correctly; cross-references (ADR number, file index) are consistent; no broken anchors.
- **V&V:** `pnpm lint` (markdown is not linted, but check links manually); visual review of the rendered docs.
- **Pitfalls:**
  - Read the existing `doc/decisions.md` to find the real next ADR number before writing — do not guess.
  - Keep the ADR factual; do not include the implementation skeletons (those live in this WP file).

---

## Summary table

| Task | Files touched | New | Depends on |
| --- | --- | --- | --- |
| T1 — Time↔seconds helpers | `src/domain/format.ts`, `src/domain/format.test.ts` | 2 functions + tests | — |
| T2 — `replacePunches` action | `src/stores/clock.ts`, `src/stores/clock.test.ts`, `src/debug/api.ts`, `src/debug/api.test.ts` | 1 action, refactor | — |
| T3 — `EditTimesDialog` | `src/components/EditTimesDialog.vue`, `src/components/EditTimesDialog.test.ts` | new component + tests | T1, T2 |
| T4 — Wire Timeline | `src/components/Timeline.vue`, `src/components/Timeline.test.ts` | edit | T3 |
| T5 — V&V sweep | `src/App.test.ts`, `src/components/*.test.ts` (as needed) | edits | T1–T4 |
| T6 — Docs | `doc/decisions.md`, `doc/architecture.md`, `doc/test-vnv-strategy.md`, `doc/plan/README.md`, `doc/plan/10-edit-times.md` | edits | T1–T5 |

**Open decision flagged for the implementing agent** (resolve in T3, record in T6's ADR): use `@change` (recommended — commits on picker selection, clean validation) vs `@input` (live but needs "incomplete value = no error" handling). Default to `@change` unless manual iOS testing in T5 shows it misses commits.