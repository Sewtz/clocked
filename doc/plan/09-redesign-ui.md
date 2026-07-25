# WP9 — UI redesign (Figma v1.0)

Goal: replace the WP4/WP6 light-mode UI with the dark, mono/acid-green design v1.0 captured in `share/designs/ui_v1.0/src/App.tsx` (a React reference implementation). The app becomes **dark-only** with a terminal aesthetic: JetBrains Mono everywhere, acid-green (`#b8ff57`) for work, orange (`#ffa94d`) for breaks, red (`#ff6b6b`) for overtime, on a near-black background. Displays are `HH:MM` per ADR-006, with one documented exception: the **mandatory-break countdown** uses `MM:SS` (a 30-minute countdown needs second resolution to be useful). The redesign drops the `BreakOverlay` full-screen overlay entirely — mandatory breaks are now surfaced as an **inline banner** inside `RunningView`, with no skip/resume buttons (ADR-013 still holds: breaks auto-resume, cannot be skipped).

**This WP supersedes WP4 (UI components) and WP6 (styling & polish) for the visual layer.** The component structure from WP4 (`ClockInView` / `RunningView` / `BreakOverlay`) is replaced: `BreakOverlay` is deleted; `ClockInView` and `RunningView` are rewritten; new shared sub-components (`StatsGrid`, `DailyTargetBar`, `Timeline`, `BreakBanner`, `MilestoneHint`) and a `SettingsDialog` are introduced. The data model and store from WP8 are unchanged at the type level — WP9 only adds read-only getters and a derived-segment list to the recompute output.

**Strict order:** T1 → T2 → ... → T10.

**Mapping from the React reference to our WP8 data model.** The React design models a day as an explicit list of `work`/`break` sessions with manual Break/Resume buttons. Our WP8 model has **no stored break sessions** — breaks are derived from gaps between in/out punches (a manual break = clock-out followed by clock-in) plus mandatory pauses injected by `recompute`. The redesign therefore:

- Drops the React "Break" and "Resume" buttons. A manual break is taken by pressing **Clock Out** (closes the punch, starts a gap) and resuming by pressing **Clock In** (opens a new punch, ends the gap). The gap is consumed as break time by the recompute algorithm (ADR-022).
- Keeps a single **Clock In** button on `ClockInView` (used for both the initial clock-in and resuming after a clock-out) and a single **Clock Out** button on `RunningView` (only shown while `running`, never during a mandatory break).
- The React "auto break" concept maps to our `breakState === 'break1' | 'break2'` (mandatory pause injected by recompute). The React `autoBreaksFired` set is **not** stored — it is derived in the `nextMilestone` getter from `workedMs >= trigger`.
- The React "Next milestone" hint and the stats grid (worked / breaks / remaining-or-overtime) become store getters + shared sub-components.
- The React per-session timeline list is rebuilt from the new `DerivedSegment[]` produced by `recompute` (T2): work segments come from punches, gap-breaks from gaps between punches, mandatory-breaks from injected pauses.

---

## WP9-T1 — Theme tokens, fonts, dark-only palette

- **Goal:** Lock the dark mono/acid-green visual language into Tailwind v4 `@theme` tokens, wire the JetBrains Mono font locally (no remote requests), and make the PWA manifest + `index.html` theme color dark-only. This replaces the existing `src/assets/main.css` tokens (which currently use a different green `#00ff41` and a sans-serif fallback) with the exact palette from `share/designs/ui_v1.0`.
- **Files:** `src/assets/main.css`, `vite.config.ts`, `index.html`, `package.json` (verify the devDep is present).
- **Approach:**

  `src/assets/main.css` — replace the entire `@theme` block and base styles with:
  ```css
  @import "tailwindcss";
  @import "@fontsource/jetbrains-mono/400.css";
  @import "@fontsource/jetbrains-mono/700.css";

  @theme {
    --color-bg:        #0a0a0a;
    --color-surface:   #0f0f0f;
    --color-surface-2: #141414;
    --color-border:    #1e1e1e;
    --color-border-2:  #2a2a2a;
    --color-text:      #e8e8e8;
    --color-text-dim:  #666666;
    --color-text-faint:#444444;
    --color-work:      #b8ff57;
    --color-work-hi:   #c8ff77;
    --color-break:     #ffa94d;
    --color-overtime:  #ff6b6b;
    --font-sans: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  html, body, #app { height: 100%; }

  body {
    margin: 0;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    background: var(--color-bg);
    color: var(--color-text);
  }

  #app {
    padding-top:    env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left:  env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
  ```
  Notes:
  - Tailwind v4 generates a utility for each `--color-*` token, so `bg-bg`, `bg-surface`, `text-work`, `border-border-2`, `text-text-faint`, etc. become available.
  - Both `--font-sans` and `--font-mono` resolve to JetBrains Mono — the design uses mono everywhere. The `font-mono` utility still works for the timer.
  - The WP6 light/dark `dark:` variants and `prefers-color-scheme` handling are **removed** (dark-only). Strip every `dark:` class from components in T6/T7.

  `vite.config.ts` — confirm the `VitePWA` manifest already sets `theme_color: '#0a0a0a'` and `background_color: '#0a0a0a'` (it does today). If either differs, set both to `#0a0a0a`. No other change.

  `index.html` — confirm there is a **single** `<meta name="theme-color" content="#0a0a0a" />` and **remove** any light/dark `media=`-scoped theme-color variants (WP6 added `(prefers-color-scheme: light)` and `dark` variants — delete them). The apple-mobile-web-app-status-bar-style should be `black-translucent` or `default`; leave as-is.

  `package.json` — `@fontsource/jetbrains-mono` is already a devDep (`^5.3.0`). No install needed unless `pnpm install` reports missing.

- **Dependencies:** none (WP0 scaffolding + WP8 already in place).
- **Acceptance criteria:**
  - `pnpm build` succeeds and `dist/assets/` contains JetBrains Mono `.woff2` files (e.g. `jetbrains-mono-latin-400-normal-*.woff2`).
  - `grep -r "fonts.googleapis" dist/` returns nothing (no remote font requests).
  - In `pnpm dev`, the page background is `#0a0a0a` and `text-work` renders acid green.
  - `index.html` has exactly one `<meta name="theme-color">`.
- **V&V:** `pnpm install && pnpm build && ls dist/assets/ | grep -i jetbrains` (expect woff2 files); `pnpm dev` visual smoke check.
- **Pitfalls:**
  - Do **not** import weights other than 400 and 700 — the design only uses those two; extra weights bloat the precache.
  - The `@import "tailwindcss";` line must come **before** `@import "@fontsource/..."` lines? No — CSS `@import` rules must all precede other rules, but their relative order among themselves is fine here. Keep Tailwind first to be safe; both are `@import` statements at the top.
  - Tailwind v4 maps `--color-border-2` to utilities `border-border-2` / `bg-border-2`. The hyphenated name is intentional and works.
  - If a token name clashes with a Tailwind default (e.g. `bg`), prefer keeping the explicit token; `bg-bg` reads oddly but is unambiguous. If it causes issues, rename `--color-bg` to `--color-canvas` and use `bg-canvas`. The components below assume `bg-bg`; adjust if renamed.

---

## WP9-T2 — Extend `recompute` with a derived segment list

- **Goal:** Add a `segments: DerivedSegment[]` field to the `Recomputed` output so the timeline (T5/T7) can render work spans, gap-breaks, and mandatory-breaks without re-walking the punches in the component layer. Also add the missing `DerivedSegment` type. While here, add the **baseline** unit tests for `recompute` that WP8-T4 called for but were never written (the file `src/domain/recompute.test.ts` does not exist yet).
- **Files:** `src/domain/types.ts` (add type), `src/domain/recompute.ts` (extend output + algorithm), `src/domain/recompute.test.ts` (new file — baseline + segment tests).
- **Approach:**

  In `src/domain/types.ts`, add the segment type and extend `Recomputed`:
  ```ts
  export type DerivedSegmentType = 'work' | 'gap-break' | 'mandatory-break'

  export interface DerivedSegment {
    type: DerivedSegmentType
    startSec: number          // seconds since midnight, inclusive
    endSec: number            // seconds since midnight, exclusive (== startSec of next, or nowSec for the open tail)
    breakIndex?: 0 | 1        // present only for 'mandatory-break' (which rule produced it)
  }

  export interface Recomputed {
    workedSeconds: number
    breakSeconds: number
    displaySeconds: number
    breakState: BreakState
    breakEndsAtMs?: number
    targetReached: boolean
    limitReached: boolean
    segments: DerivedSegment[]   // NEW — chronological, sorted by startSec
  }
  ```
  Also update the empty-punches early return and any other `Recomputed` literal in the codebase to include `segments: []`. The store getter `computed` (WP8-T9) returns a fallback `Recomputed` without `segments` — add `segments: []` there too (T3 will touch this file, but fix it here to keep `pnpm typecheck` green).

  In `src/domain/recompute.ts`, build the segment list alongside the existing pass:

  1. Emit one `work` segment per punch: `{ type: 'work', startSec: p.in, endSec: p.out ?? nowSec }`.
  2. For each gap between `punches[i].out` and `punches[i+1].in` (when `> 0`), emit `{ type: 'gap-break', startSec: out, endSec: nextIn }`.
  3. When the algorithm injects a mandatory pause (the existing `breakEndsAtMs = triggerInstantMs + duration*1000` branches), also emit `{ type: 'mandatory-break', startSec: triggerSec, endSec: triggerSec + duration, breakIndex: 0 | 1 }` where `triggerSec` is `p.in + consumed` at the trigger point (the seconds-since-midnight wall-clock at which the break started) and `duration` is the break duration in seconds. Use `breakIndex: 0` for break1, `1` for break2.
  4. Sort the combined list by `startSec` before returning. Work and gap-break segments are already in order; mandatory-break segments are inserted at the trigger point which falls inside a work segment — that is fine, the timeline renders them on top in chronological order.

  The mandatory-break `startSec`/`endSec` are in seconds-since-midnight to match the work/gap segments. Convert `breakEndsAtMs` (epoch-ms) to seconds-since-midnight only if needed for the banner — but the banner already derives its own countdown from `breakEndsAtMs` and `store.now`, so no conversion is needed in the segment list.

  The existing algorithm already computes `triggerInstantMs = epochMsForSeconds(p.in + consumed)`. Derive `triggerSec = p.in + consumed` directly (no epoch conversion). The pause `endSec = triggerSec + mandatory1` (the consumed duration variable already holds seconds).

  **Baseline tests to add** (the file does not exist yet — create it). Mirror the WP8-T4 test list and add segment assertions:
  - Empty punches → `segments: []`, `workedSeconds: 0`, `breakState: 'running'`.
  - Single closed punch `[0..3600]` → one work segment `{startSec:0,endSec:3600}`, no break segments, `workedSeconds: 3600`.
  - Single open punch `[{in: 0}]` with `nowSec: 3600` → one work segment `{startSec:0,endSec:3600}`, `workedSeconds: 3600`.
  - Two punches with a 600s gap `[{0..3600},{4200..7200}]` → work segments for both punches plus one `gap-break` segment `{startSec:3600,endSec:4200}`, `breakSeconds` includes the gap only if a break is enabled and the gap is consumed (assert based on settings).
  - Single punch crossing `break1_trigger` (nowSec = 21601, default settings) → `breakState: 'break1'`, one `mandatory-break` segment `{type:'mandatory-break',breakIndex:0,startSec:21600,endSec:23400}` plus the work segment `{0..21600}`. `breakEndsAtMs` is set.
  - During break1 (nowSec between 21600 and 23400) → same mandatory-break segment, `breakState: 'break1'`.
  - After break1 ends (nowSec > 23400, single punch) → work segments `{0..21600}` and `{23400..nowSec}`, mandatory-break segment `{21600..23400}`, `breakState: 'running'`.
  - Gap ≥ break1_duration with trigger crossed → `gap-break` segment present, **no** `mandatory-break` segment for break1.
  - Total gaps ≥ break1_duration + break2_duration → no mandatory-break segments at all, only gap-breaks.
  - break1 disabled → no mandatory-break segments, no break1 gap consumption; break2 also skipped (cascade).
  - break2 fires after break1 satisfied → two `mandatory-break` segments with `breakIndex: 0` then `breakIndex: 1`.
  - `targetReached` true when `workedSeconds >= daily_target`; `limitReached` true when `>= daily_limit`.
  - Segments are sorted by `startSec` (assert the array's `startSec` values are non-decreasing).
  - Idempotency of the segment shape: calling `recompute` twice with the same inputs yields identical `segments`.

- **Dependencies:** WP8-T1, WP8-T4 (recompute exists).
- **Acceptance criteria:**
  - `pnpm typecheck` clean (every `Recomputed` literal has `segments`).
  - `pnpm test -- src/domain/recompute.test.ts` — all cases pass.
  - The store's `computed` getter fallback (in `src/stores/clock.ts`) includes `segments: []`.
- **V&V:** `pnpm typecheck && pnpm test -- src/domain/recompute.test.ts`.
- **Pitfalls:**
  - The mandatory-break `endSec` must equal `startSec + duration` (seconds), **not** `breakEndsAtMs` converted back — derive it from the seconds-based trigger + duration to avoid rounding drift.
  - A `gap-break` segment is emitted for **every** positive gap, even gaps smaller than any break duration. The timeline renders all of them; the stats grid's break total still uses `breakSeconds` (which only counts consumed gaps), so the two may differ when there are non-consumed gaps. That is intended: the timeline shows reality, the stat shows counted break time.
  - Do not mutate `punches`; build a fresh `segments` array.
  - Keep the function pure — no `clock.now()` calls; `nowSec` is a parameter.

---

## WP9-T3 — Store getters for the redesign

- **Goal:** Expose everything the new components need as read-only Pinia getters so components stay presentational. No new state, no new actions.
- **Files:** `src/stores/clock.ts` (add getters + update the empty fallback), `src/stores/clock.test.ts` (add getter tests).
- **Approach:** Add these getters inside `defineStore`:
  ```ts
  segments(): DerivedSegment[] {
    return this.computed.segments ?? []
  },
  breakMs(): number {
    return this.computed.breakSeconds * 1000
  },
  remainingMs(): number {
    if (!this.settings) return 0
    return Math.max(0, this.settings.daily_target * 1000 - this.workedMs)
  },
  overtimeMs(): number {
    if (!this.settings) return 0
    return Math.max(0, this.workedMs - this.settings.daily_target * 1000)
  },
  workPercent(): number {
    if (!this.settings || this.settings.daily_target === 0) return 0
    return Math.min(100, (this.workedMs / (this.settings.daily_target * 1000)) * 100)
  },
  daySpanMs(): number {
    if (!this.worktime || this.worktime.punches.length === 0) return 0
    const firstIn = this.worktime.punches[0].in
    const nowSec = secondsSinceMidnight(this.now)
    return Math.max(0, (nowSec - firstIn) * 1000)
  },
  nextMilestone(): { label: string; remainingMs: number } | null {
    if (!this.settings) return null
    const s = this.settings
    const candidates = [
      { enabled: s.break1_enabled, triggerSec: s.break1_trigger, label: `${s.break1_trigger / 3600}h auto-break` },
      { enabled: s.break2_enabled, triggerSec: s.break2_trigger, label: `${s.break2_trigger / 3600}h auto-break` },
    ]
    for (const c of candidates) {
      if (!c.enabled) continue
      const triggerMs = c.triggerSec * 1000
      if (this.workedMs < triggerMs) return { label: c.label, remainingMs: triggerMs - this.workedMs }
    }
    return null
  },
  ```
  Update the `computed()` getter's empty-settings fallback `Recomputed` literal to include `segments: []` (if not already done in T2).

  Import `DerivedSegment` (type-only) and `secondsSinceMidnight` (already imported).

  **Tests to add in `src/stores/clock.test.ts`:**
  - After `clockIn` at 08:00 with `now` at 09:00 → `workedMs` ≈ 3600_000, `remainingMs` ≈ 25200_000 (default 8h target), `overtimeMs` 0, `workPercent` ≈ 12.5, `daySpanMs` ≈ 3600_000, `nextMilestone.label === '6h auto-break'`, `nextMilestone.remainingMs ≈ 18000_000`.
  - With worked ≥ 8h → `overtimeMs > 0`, `remainingMs === 0`, `workPercent === 100`.
  - With worked ≥ 6h (break1 trigger) and break1 enabled → `nextMilestone.label === '9h auto-break'`.
  - break1 disabled → `nextMilestone` jumps straight to break2 (or null if break2 also disabled).
  - With `worktime = null` → `segments === []`, `daySpanMs === 0`, `nextMilestone === null`.
  - With two punches and a gap → `segments` contains a `gap-break` entry (assert `segments.some(s => s.type === 'gap-break')`).
  - During a mandatory break (`breakState === 'break1'`) → `segments` contains a `mandatory-break` with `breakIndex: 0`.

- **Dependencies:** WP9-T2, WP8-T9.
- **Acceptance criteria:**
  - `pnpm typecheck` clean.
  - All new getter tests pass.
  - No component imports anything other than these getters and the existing `workedMs` / `displayMs` / `breakState` / `breakEndsAt` / `viewState` / `isClockedOut` / `settings`.
- **V&V:** `pnpm typecheck && pnpm test -- src/stores/clock.test.ts`.
- **Pitfalls:**
  - `nextMilestone` derives "fired" purely from `workedMs >= trigger`, which is correct because `workedMs` is frozen at the trigger value during a mandatory pause and grows past it afterward. Do not add a separate `fired` flag to state.
  - `daySpanMs` uses seconds-since-midnight deltas converted to ms — this keeps the timeline scaling in local-day coordinates and avoids epoch-ms/timezone confusion.
  - `workPercent` is capped at 100; the bar turns red (overtime) when `workPercent >= 100`, driven by `overtimeMs > 0` in the component, not by the cap.
  - All getters must be safe when `this.settings` or `this.worktime` is `null` (boot state).

---

## WP9-T4 — `App.vue` shell + header

- **Goal:** Replace the WP4 `App.vue` with a full-screen dark shell: a sticky header (status dot, "TIMECLOCK" wordmark, current date, gear button that opens `SettingsDialog`), and a `<main>` region that switches between `ClockInView` and `RunningView` based on `store.viewState`. Drop `BreakOverlay` from the import list (T9 deletes the file). Keep the `visibilitychange` → `store.onVisible()` handler and the per-second tick wiring from WP8.
- **Files:** `src/App.vue` (rewrite), `src/App.test.ts` (update assertions).
- **Approach:**
  ```vue
  <script setup lang="ts">
  import { onMounted, onBeforeUnmount, computed, ref } from 'vue'
  import { useClockStore, stopTick } from '@/stores/clock'
  import ClockInView from '@/components/ClockInView.vue'
  import RunningView from '@/components/RunningView.vue'
  import SettingsDialog from '@/components/SettingsDialog.vue'

  const store = useClockStore()
  const settingsOpen = ref(false)

  function onVisibility() {
    if (document.visibilityState === 'visible') store.onVisible()
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    store.init()
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    stopTick()
  })

  const view = computed(() => store.viewState)
  const statusColor = computed(() =>
    store.breakState === 'break1' || store.breakState === 'break2' ? 'var(--color-break)'
    : store.isClockedIn ? 'var(--color-work)'
    : '#3a3a3a',
  )
  const todayLabel = computed(() =>
    store.now
      ? new Date(store.now).toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
      : '',
  )
  </script>

  <template>
    <div class="min-h-dvh flex flex-col bg-bg text-text font-sans">
      <SettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />

      <header class="border-b border-border px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span
            class="w-2 h-2 rounded-full transition-colors duration-300"
            :style="{ backgroundColor: statusColor }"
          />
          <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Timeclock</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-mono text-xs text-text-faint">{{ todayLabel }}</span>
          <button
            type="button"
            class="text-text-faint hover:text-text transition-colors"
            aria-label="Settings"
            title="Settings"
            @click="settingsOpen = true"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main class="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-12">
        <template v-if="store.loadStatus !== 'ready'">
          <div class="font-mono text-text-faint animate-pulse text-xl">Clocked</div>
        </template>
        <template v-else>
          <ClockInView v-if="view.kind === 'clock-in' || view.kind === 'clocked-out'" />
          <RunningView v-else-if="view.kind === 'running' || view.kind === 'break'" />
        </template>
      </main>
    </div>
  </template>
  ```
  Key points:
  - `RunningView` now handles **both** `running` and `break` view states (the mandatory break is shown inline as a banner, not as a separate overlay). The component gates the action buttons on `view.kind === 'running'` internally.
  - The status dot color: green when `running`, orange when on a mandatory break, dim grey otherwise.
  - `SettingsDialog` is mounted at the shell level (so the modal backdrop covers the header too) and toggled by `settingsOpen`. It is a controlled component with no props — it reads/writes `store.settings` directly (T8).
  - `todayLabel` is computed from `store.now` so it updates if the day rolls over while the app is open.

  Update `src/App.test.ts`:
  - The "switches to RunningView after clock-in" test currently finds `button.rounded-full`. After redesign the Clock In button is rectangular (`bg-work`), not `rounded-full`. Change the selector to `button.bg-work` (or find by text `Clock In`).
  - Add a test: the header renders the wordmark "TIMECLOCK" (case-insensitive) and a gear button with `aria-label="Settings"`.
  - Add a test: clicking the gear button renders the settings dialog (assert text `Daily target` appears).
  - Keep the visibility/init smoke tests.

- **Dependencies:** WP9-T1, WP9-T3, WP9-T6, WP9-T7, WP9-T8 (the components must exist for `pnpm dev` to render, but `App.vue` itself can be written first; run V&V after T8).
- **Acceptance criteria:**
  - `pnpm dev` shows a dark page with a top border, the status dot, the wordmark, the date, and the gear icon.
  - Clicking the gear opens the settings dialog; closing it returns to the previous view.
  - The loading state ("Clocked" pulsing) shows briefly during boot.
  - `visibilitychange` still calls `store.onVisible()` (verify by spying in a test).
- **V&V:** `pnpm test -- src/App.test.ts` then `pnpm dev` visual check.
- **Pitfalls:**
  - Do **not** re-introduce `BreakOverlay`. The `break` view state is handled by `RunningView`.
  - The `min-h-dvh` + flex column keeps the footer-less layout pinned to the dynamic viewport on iOS.
  - The gear `<svg>` is inlined (no icon library). Keep the `stroke-width="1.5"` and `stroke-linecap="round"` to match the reference.
  - `SettingsDialog` uses `v-if` (not `v-show`) so it is unmounted when closed — its draft state resets on each open.

---

## WP9-T5 — Shared display sub-components

- **Goal:** Build the five presentational sub-components used by both `ClockInView` (clocked-out state) and `RunningView`. Each is a pure SFC that reads `useClockStore()` getters and renders; none hold local state (except `Timeline`'s title attribute formatting).
- **Files (new):**
  - `src/components/StatsGrid.vue` + `src/components/StatsGrid.test.ts`
  - `src/components/DailyTargetBar.vue` + `src/components/DailyTargetBar.test.ts`
  - `src/components/Timeline.vue` + `src/components/Timeline.test.ts`
  - `src/components/BreakBanner.vue` + `src/components/BreakBanner.test.ts`
  - `src/components/MilestoneHint.vue` + `src/components/MilestoneHint.test.ts`
- **Approach:**

  **`StatsGrid.vue`** — the 3-column worked/breaks/remaining-or-overtime grid. Mirrors the React design's stats row.
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { formatHHMM } from '@/domain/format'
  const store = useClockStore()
  const worked = computed(() => formatHHMM(store.workedMs))
  const breaks = computed(() => formatHHMM(store.breakMs))
  const third = computed(() =>
    store.overtimeMs > 0 ? `+${formatHHMM(store.overtimeMs)}` : formatHHMM(store.remainingMs),
  )
  const thirdLabel = computed(() => (store.overtimeMs > 0 ? 'Overtime' : 'Remaining'))
  const thirdColor = computed(() => (store.overtimeMs > 0 ? 'var(--color-overtime)' : 'var(--color-text-faint)'))
  </script>

  <template>
    <div class="w-full max-w-xl grid grid-cols-3 gap-px bg-border">
      <div class="bg-bg px-5 py-4">
        <div class="font-mono text-work text-xl font-bold">{{ worked }}</div>
        <div class="font-mono text-text-faint text-xs mt-1 tracking-widest uppercase">Worked</div>
      </div>
      <div class="bg-bg px-5 py-4">
        <div class="font-mono text-break text-xl font-bold">{{ breaks }}</div>
        <div class="font-mono text-text-faint text-xs mt-1 tracking-widest uppercase">Breaks</div>
      </div>
      <div class="bg-bg px-5 py-4">
        <div class="font-mono text-xl font-bold" :style="{ color: thirdColor }">{{ third }}</div>
        <div class="font-mono text-text-faint text-xs mt-1 tracking-widest uppercase">{{ thirdLabel }}</div>
      </div>
    </div>
  </template>
  ```

  **`DailyTargetBar.vue`** — labeled progress bar with 0h / half / full tick labels.
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  const store = useClockStore()
  const pct = computed(() => store.workPercent)
  const barColor = computed(() => (store.overtimeMs > 0 ? 'var(--color-overtime)' : 'var(--color-work)'))
  const targetHours = computed(() => (store.settings ? store.settings.daily_target / 3600 : 0))
  const halfHours = computed(() => targetHours.value / 2)
  </script>

  <template>
    <div class="w-full max-w-xl">
      <div class="flex justify-between mb-2">
        <span class="font-mono text-xs text-text-faint tracking-widest uppercase">Daily target</span>
        <span class="font-mono text-xs text-text-faint">{{ Math.round(pct) }}% of {{ targetHours }}h</span>
      </div>
      <div class="h-2 bg-surface-2 w-full overflow-hidden">
        <div class="h-full transition-all duration-1000" :style="{ width: pct + '%', backgroundColor: barColor }" />
      </div>
      <div class="flex justify-between mt-1">
        <span class="font-mono text-[10px] text-text-faint/40">0h</span>
        <span class="font-mono text-[10px] text-text-faint/40">{{ halfHours }}h</span>
        <span class="font-mono text-[10px] text-text-faint/40">{{ targetHours }}h</span>
      </div>
    </div>
  </template>
  ```

  **`Timeline.vue`** — the horizontal track + per-session list. Uses `store.segments` and `store.daySpanMs`.
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { formatHHMM } from '@/domain/format'
  const store = useClockStore()

  function fmtTime(sec: number): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setSeconds(sec)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  function fmtDur(sec: number): string {
    return formatHHMM(sec * 1000)
  }
  const span = computed(() => store.daySpanMs / 1000) // seconds
  const firstIn = computed(() => (store.worktime ? store.worktime.punches[0].in : 0))
  const trackSegs = computed(() =>
    store.segments.map(s => ({
      ...s,
      left: span.value > 0 ? ((s.startSec - firstIn.value) / span.value) * 100 : 0,
      width: span.value > 0 ? ((s.endSec - s.startSec) / span.value) * 100 : 0,
      bg: s.type === 'work' ? 'var(--color-work)' : 'var(--color-break)',
      opacity: s.type === 'work' ? 0.9 : 0.7,
    })),
  )
  </script>

  <template>
    <div v-if="store.segments.length > 0" class="w-full max-w-xl">
      <div class="flex justify-between mb-2">
        <span class="font-mono text-xs text-text-faint tracking-widest uppercase">Timeline</span>
        <span class="font-mono text-xs text-text-faint">
          {{ trackSegs.length ? fmtTime(firstIn) : '' }} → {{ fmtTime(span + firstIn) }}
        </span>
      </div>
      <div class="relative h-8 bg-surface w-full overflow-hidden">
        <div
          v-for="(seg, i) in trackSegs"
          :key="i"
          class="absolute top-0 h-full transition-all duration-500"
          :style="{ left: seg.left + '%', width: seg.width + '%', backgroundColor: seg.bg, opacity: seg.opacity }"
          :title="`${seg.type === 'work' ? 'Work' : 'Break'}: ${fmtTime(seg.startSec)} – ${fmtTime(seg.endSec)}`"
        />
      </div>
      <div class="mt-3 flex flex-col gap-px">
        <div
          v-for="(seg, i) in store.segments"
          :key="'r' + i"
          class="flex items-center gap-3 font-mono text-xs text-text-faint"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :style="{ backgroundColor: seg.type === 'work' ? 'var(--color-work)' : 'var(--color-break)' }"
          />
          <span
            class="w-10 uppercase tracking-widest"
            :style="{ color: seg.type === 'work' ? 'var(--color-work)' : 'var(--color-break)' }"
          >
            {{ seg.type === 'work' ? 'Work' : 'Brk' }}
          </span>
          <span v-if="seg.type === 'mandatory-break'" class="text-text-faint uppercase tracking-widest text-[10px]">auto</span>
          <span>{{ fmtTime(seg.startSec) }} → {{ fmtTime(seg.endSec) }}</span>
          <span class="ml-auto">{{ fmtDur(seg.endSec - seg.startSec) }}</span>
        </div>
      </div>
    </div>
  </template>
  ```
  Note: `fmtTime(span + firstIn)` approximates "now" as `firstIn + daySpan`; it equals `secondsSinceMidnight(store.now)`. This is fine for the header label.

  **`BreakBanner.vue`** — the inline mandatory-break banner with progress bar + `MM:SS` countdown. Shown only while `store.isOnBreak` and `store.breakEndsAt` is set.
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { formatMMSS } from '@/domain/format'
  const store = useClockStore()

  const durationSec = computed(() => {
    if (store.breakState === 'break1') return store.settings?.break1_duration ?? 0
    if (store.breakState === 'break2') return store.settings?.break2_duration ?? 0
    return 0
  })
  const remainingMs = computed(() => (store.breakEndsAt ? Math.max(0, store.breakEndsAt - store.now) : 0))
  const elapsedMs = computed(() => Math.max(0, durationSec.value * 1000 - remainingMs.value))
  const pctFull = computed(() =>
    durationSec.value > 0 ? Math.max(0, 100 - (elapsedMs.value / (durationSec.value * 1000)) * 100) : 0,
  )
  </script>

  <template>
    <div
      v-if="store.isOnBreak && store.breakEndsAt"
      class="w-full max-w-xl border border-break/30 bg-break/5 px-5 py-3 flex items-center justify-between"
    >
      <span class="font-mono text-xs text-break tracking-widest uppercase">
        Mandatory break ({{ durationSec / 60 }} min)
      </span>
      <div class="flex items-center gap-4">
        <div class="h-1 w-32 bg-surface-2 overflow-hidden">
          <div class="h-full bg-break transition-all duration-1000" :style="{ width: pctFull + '%' }" />
        </div>
        <span class="font-mono text-sm text-break font-bold">{{ formatMMSS(remainingMs) }}</span>
      </div>
    </div>
  </template>
  ```

  **`MilestoneHint.vue`** — the "Next: Nh auto-break in Xh Ym" line, shown only while `running`.
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { formatHHMM } from '@/domain/format'
  const store = useClockStore()
  const m = computed(() => store.nextMilestone)
  </script>

  <template>
    <div
      v-if="store.viewState.kind === 'running' && m && m.remainingMs > 0"
      class="w-full max-w-xl flex items-center justify-between px-1"
    >
      <span class="font-mono text-xs text-text-faint tracking-widest uppercase">Next: {{ m.label }}</span>
      <span class="font-mono text-xs text-text-faint">in {{ formatHHMM(m.remainingMs) }}</span>
    </div>
  </template>
  ```

  **Tests** — each sub-component gets a small mount test:
  - `StatsGrid.test.ts`: with `store.workedMs = 3600_000`, `breakMs = 0`, `remainingMs = 25200_000` → renders `01:00`, `00:00`, `07:00`, and label `Remaining`. With `overtimeMs > 0` → renders `+...` and label `Overtime` in overtime color.
  - `DailyTargetBar.test.ts`: with `workPercent = 50` → bar `width` style contains `50%`; label reads `50% of 8h`. With overtime → bar color is `var(--color-overtime)`.
  - `Timeline.test.ts`: with `store.segments = [{type:'work',startSec:28800,endSec:32400}]` and a `daySpanMs` set → renders the track segment with a non-zero width and a list row reading `Work`. With a `mandatory-break` segment → renders an `auto` tag.
  - `BreakBanner.test.ts`: with `breakState='break1'`, `breakEndsAt = now + 1800_000` → renders `Mandatory break (30 min)`, a progress bar, and `30:00`. After advancing `now` by 60s → reads `29:00`. When not on break → renders nothing (`v-if` false).
  - `MilestoneHint.test.ts`: with `nextMilestone = { label: '6h auto-break', remainingMs: 18000_000 }` and `viewState.kind='running'` → renders `Next: 6h auto-break` and `in 05:00`. With `viewState.kind='break'` → renders nothing.

- **Dependencies:** WP9-T3.
- **Acceptance criteria:**
  - All five sub-components mount without errors and render the expected text/styles.
  - Each is reusable: importing it from both `ClockInView` and `RunningView` works (no shared mutable state).
  - `pnpm typecheck` clean.
- **V&V:** `pnpm test -- src/components/StatsGrid.test.ts src/components/DailyTargetBar.test.ts src/components/Timeline.test.ts src/components/BreakBanner.test.ts src/components/MilestoneHint.test.ts`.
- **Pitfalls:**
  - Sub-components must use the store directly (not props) — they are app-internal, not generic. This keeps the parent templates short.
  - `formatHHMM` is used for the milestone "in Xh Ym" line to stay consistent with ADR-006 (HH:MM). The reference design uses a compact `Xh Ym` form; we use HH:MM for consistency. Do not introduce a new `formatHM` helper.
  - The `Timeline` track uses `v-for` with index `i` as `:key` — segments are recomputed each tick and are positional, so index keys are correct here.
  - The break banner's progress bar **depletes** (starts at 100%, shrinks to 0%) to match the reference design. If you prefer it to fill up, invert `pctFull`; keep the depleting behavior to match the design.
  - Tailwind v4 color utilities accept CSS variables via `bg-work`, but the `bg-break/5` and `border-break/30` opacity-modifier syntax requires the color to be registered as a theme color (it is, via `--color-break`). Verify `/30` compiles; if not, use `:style="{ backgroundColor: 'rgba(255,169,77,0.05)' }"` as a fallback.

---

## WP9-T6 — Rewrite `ClockInView`

- **Goal:** Replace the WP4/WP6 `ClockInView` (round red button, +Nmin buttons, custom time picker, edit-start, reset-day) with the redesign: a big **rectangular** acid-green **Clock In** button, the worked-time account ("Worked today") shown only when `clocked-out`, the `StatsGrid` + `DailyTargetBar` + `Timeline` shared components shown only when `clocked-out`, and a "Press clock in to start tracking" hint when there is no worktime. **Remove** the `+1min`/`+5min`/`+10min` buttons, the `<input type="time">` custom-time picker, the "Ready to work?" heading, and the Reset day button — these affordances are dropped per the redesign (manual break = clock-out/clock-in; no backdating UI in v1.0).
- **Files:** `src/components/ClockInView.vue` (rewrite), `src/components/ClockInView.test.ts` (rewrite).
- **Approach:**
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { formatHHMM } from '@/domain/format'
  import StatsGrid from '@/components/StatsGrid.vue'
  import DailyTargetBar from '@/components/DailyTargetBar.vue'
  import Timeline from '@/components/Timeline.vue'

  const store = useClockStore()
  const workedToday = computed(() => formatHHMM(store.workedMs))
  const isClockedOut = computed(() => store.isClockedOut)
  const isEmpty = computed(() => !store.worktime)
  </script>

  <template>
    <div class="flex flex-col items-center gap-12 w-full max-w-xl">
      <!-- Worked account: only when clocked-out -->
      <div v-if="isClockedOut" class="flex flex-col items-center gap-1">
        <div class="font-mono text-5xl tabular-nums text-text">{{ workedToday }}</div>
        <div class="font-mono text-xs text-text-faint mt-1 tracking-widest uppercase">Worked today</div>
      </div>

      <!-- Big rectangular Clock In button -->
      <button
        type="button"
        class="
          font-mono text-sm tracking-widest uppercase
          px-8 py-3 bg-work text-bg font-bold
          transition-all duration-150 hover:bg-work-hi active:scale-95
          min-h-[44px]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work
        "
        @click="store.clockIn()"
      >
        Clock In
      </button>

      <!-- Empty-state hint -->
      <div v-if="isEmpty" class="font-mono text-xs text-text-faint/40 tracking-widest uppercase">
        Press clock in to start tracking
      </div>

      <!-- Account details: only when clocked-out -->
      <template v-if="isClockedOut">
        <StatsGrid />
        <DailyTargetBar />
        <Timeline />
      </template>
    </div>
  </template>
  ```
  Key points:
  - The Clock In button is **rectangular** (no `rounded-full`, no `w-56 h-56`), acid-green background, near-black text — matches the React design's primary button exactly.
  - The same `ClockInView` handles both `clock-in` and `clocked-out` view states (the parent `App.vue` mounts it for both). When `clock-in` (no worktime): only the button + hint render. When `clocked-out`: the worked account, stats, target bar, and timeline render above/below the button.
  - There is no longer a separate "resume" label — the button always reads `Clock In`. The worked-time account above it communicates that there is prior work for the day.
  - `store.clockIn()` is called with no arguments (clock in at the current injectable-clock time). Backdating is no longer surfaced in v1.0; the debug API (`window.__clocked.punchIn(sec)`) remains for developers.

  **Tests** (rewrite `ClockInView.test.ts`):
  - Fresh state (`worktime = null`): renders the `Clock In` button and the hint `Press clock in to start tracking`; does **not** render `Worked today`, `StatsGrid` text (`Worked`/`Breaks`/`Remaining`), the daily-target label, or the Timeline header.
  - Clocked-out state (`worktime` with one closed punch, `isClockedOut = true`): renders `Worked today`, the worked `HH:MM`, `StatsGrid` (`Worked`/`Breaks`/`Remaining`), `Daily target`, and `Timeline`.
  - Clicking the `Clock In` button calls `store.clockIn` (spy on the store action) with no arguments.
  - The button has class `bg-work` (acid green) and `min-h-[44px]`.
  - No `+1min`/`+5min`/`+10min` buttons, no `<input type="time">`, no `Reset day` button are present (assert they do not exist in the rendered HTML).

- **Dependencies:** WP9-T3, WP9-T5.
- **Acceptance criteria:**
  - All tests pass; `pnpm dev` shows the rectangular green button on a fresh install and the full account after clock-in → clock-out.
  - No WP4 affordances remain in this component.
- **V&V:** `pnpm test -- src/components/ClockInView.test.ts` then `pnpm dev` smoke check.
- **Pitfalls:**
  - The button text is `Clock In` (capitalized) — the existing `App.test.ts` integration test searches for `Clock In`; keep the casing.
  - `isEmpty` is `!store.worktime` — do not confuse with `isClockedOut` (which requires worktime to exist).
  - Do not add a "Ready to work?" heading; the design has none. The header wordmark is the only branding.
  - The `text-text-faint/40` opacity modifier may not compile for arbitrary theme colors in Tailwind v4; if it fails, use an inline `style` with `color: rgba(...)` or a dedicated faint-faint token. Prefer keeping it simple: use `text-text-faint` without opacity for the hint, and dim it via a lighter token if needed.

---

## WP9-T7 — Rewrite `RunningView`

- **Goal:** Replace the WP4/WP6 `RunningView` (elapsed display, +Nmin, edit-start, reset, clock-out) with the redesign's central working/break screen: a big `HH:MM` worked clock + status label, the inline `BreakBanner` (when on a mandatory break), the `MilestoneHint` (when running), a single **Clock Out** button shown **only when `running`** (no buttons during a mandatory break), and the shared `StatsGrid` + `DailyTargetBar` + `Timeline`. Remove the +Nmin buttons, the edit-start input, and the Reset day button.
- **Files:** `src/components/RunningView.vue` (rewrite), `src/components/RunningView.test.ts` (rewrite).
- **Approach:**
  ```vue
  <script setup lang="ts">
  import { computed } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import { formatHHMM } from '@/domain/format'
  import BreakBanner from '@/components/BreakBanner.vue'
  import MilestoneHint from '@/components/MilestoneHint.vue'
  import StatsGrid from '@/components/StatsGrid.vue'
  import DailyTargetBar from '@/components/DailyTargetBar.vue'
  import Timeline from '@/components/Timeline.vue'

  const store = useClockStore()
  const display = computed(() => formatHHMM(store.workedMs))
  const isRunning = computed(() => store.viewState.kind === 'running')
  const isOnBreak = computed(() => store.viewState.kind === 'break')

  const clockColor = computed(() =>
    isOnBreak.value ? 'var(--color-break)'
    : isRunning.value ? 'var(--color-work)'
    : 'var(--color-text-faint)',
  )
  const statusLabel = computed(() => {
    if (isRunning.value) return 'Current session'
    if (isOnBreak.value) return 'On mandatory break'
    return 'Not clocked in'
  })
  </script>

  <template>
    <div class="flex flex-col items-center gap-12 w-full max-w-xl">
      <!-- Big worked clock -->
      <div class="text-center">
        <div
          class="font-mono text-[4.5rem] leading-none tracking-tight transition-colors duration-300 tabular-nums"
          :style="{ color: clockColor }"
        >
          {{ display }}
        </div>
        <div class="font-mono text-xs text-text-faint mt-2 tracking-widest uppercase">
          {{ statusLabel }}
        </div>
      </div>

      <!-- Mandatory-break banner (renders itself only when on break) -->
      <BreakBanner />

      <!-- Next milestone hint (renders itself only when running) -->
      <MilestoneHint />

      <!-- Action buttons: only while running -->
      <div v-if="isRunning" class="flex gap-3">
        <button
          type="button"
          class="
            font-mono text-sm tracking-widest uppercase
            px-6 py-3 border border-border-2 text-text-faint
            transition-all duration-150 hover:border-text-faint hover:text-text
            active:scale-95 min-h-[44px]
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work
          "
          @click="store.clockOut()"
        >
          Clock Out
        </button>
      </div>

      <!-- Stats + target + timeline (always visible while the day has data) -->
      <StatsGrid />
      <DailyTargetBar />
      <Timeline />
    </div>
  </template>
  ```
  Key points:
  - The big clock shows **total worked time** `formatHHMM(store.workedMs)`, not "current session" — our data model has no separate current-session concept (the open punch is included in `workedMs`). This is a deliberate, documented deviation from the React reference (which shows `currentSessionMs`). The status label reads `Current session` for consistency with the reference's wording; if that feels misleading, change it to `Worked today` — pick one and keep it consistent. Recommended: `Worked today` (more honest). Update the `statusLabel` computed accordingly and adjust the test.
  - When on a mandatory break, the clock turns orange and shows the **frozen** worked value (recompute freezes `workedSeconds` at the trigger). The `BreakBanner` shows the `MM:SS` countdown. There are **no buttons** during the break (ADR-013: cannot skip). The `StatsGrid`/`DailyTargetBar`/`Timeline` remain visible so the user sees context.
  - The Clock Out button is a bordered, muted (not acid-green) secondary button — it is not the primary action of the day. The primary action (Clock In) is acid-green and lives on `ClockInView`.

  **Tests** (rewrite `RunningView.test.ts`):
  - `running` state: renders the big clock with `formatHHMM(store.workedMs)`, the `Current session` (or `Worked today`) label, the `Clock Out` button, and the shared components (`Worked`/`Breaks`/`Remaining`, `Daily target`, `Timeline`). The clock color is `var(--color-work)`.
  - `break` state (`viewState.kind === 'break'`, `breakState='break1'`): renders the big clock in `var(--color-break)`, the `BreakBanner` (`Mandatory break (30 min)` + a `MM:SS` countdown), the status label `On mandatory break`, and **no** `Clock Out` button. `MilestoneHint` does not render (gated on `running`).
  - Clicking `Clock Out` calls `store.clockOut`.
  - No `+1min`/`+5min`/`+10min` buttons, no `<input type="time">`, no `Reset day` button, no `Break` button (the React design's Break button is dropped) are present.

- **Dependencies:** WP9-T3, WP9-T5.
- **Acceptance criteria:**
  - All tests pass.
  - `pnpm dev`: starting the timer shows the green clock ticking; the stats/target/timeline update each second; clocking out returns to `ClockInView`; triggering a mandatory break (via `window.__clocked.tickTo` past 6h) shows the orange banner and hides the Clock Out button.
- **V&V:** `pnpm test -- src/components/RunningView.test.ts` then `pnpm dev` + debug API smoke check.
- **Pitfalls:**
  - The `text-[4.5rem]` arbitrary value is supported by Tailwind v4. Keep the `tabular-nums` to prevent digit jitter.
  - The Clock Out button must **not** appear during `break`. Gate it with `v-if="isRunning"`, not `v-if="!isOnBreak"` — they are equivalent today but `isRunning` is the source of truth from `viewState`.
  - Do not reintroduce the edit-start `+Nmin` affordances. The debug API is the developer's path to backdating.
  - If `formatHHMM(store.workedMs)` returns `00:00` right at clock-in, that is correct (no worked time yet). The clock grows from there.

---

## WP9-T8 — `SettingsDialog`

- **Goal:** Build the modal settings dialog (daily target hours + two auto-break rules, each with an enable toggle, a trigger-in-hours field, and a duration-in-minutes field). It reads `store.settings`, edits a local draft, and on Save converts the hours/minutes UI units into the seconds-based `Settings` fields and calls `store.setSettings(patch)`. The cascade invariant (ADR-023: disabling break1 disables break2) is enforced by `applySettingsPatch` already — the dialog also reflects it live (disabling break1 greys out and disables break2's inputs).
- **Files (new):**
  - `src/components/SettingsDialog.vue` + `src/components/SettingsDialog.test.ts`
  - `src/components/ui/NumberInput.vue` + (no separate test — covered via the dialog test)
  - `src/components/ui/Toggle.vue` + (no separate test — covered via the dialog test)
- **Approach:**

  **`src/components/ui/NumberInput.vue`** — a small controlled numeric input.
  ```vue
  <script setup lang="ts">
  defineProps<{ modelValue: number; min: number; max: number; step?: number; disabled?: boolean }>()
  defineEmits<{ 'update:modelValue': [number] }>()
  const props = defineProps<{ modelValue: number; min: number; max: number; step?: number; disabled?: boolean }>()
  const onInput = (e: Event) => {
    const v = parseFloat((e.target as HTMLInputElement).value)
    if (!Number.isNaN(v)) emit('update:modelValue', Math.min(props.max, Math.max(props.min, v)))
  }
  </script>

  <template>
    <input
      type="number"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step ?? 0.5"
      :disabled="disabled"
      @input="onInput"
      class="font-mono text-sm w-20 bg-surface border border-border-2 text-text px-2 py-1 text-right focus:outline-none focus:border-work disabled:opacity-30 disabled:cursor-not-allowed"
    />
  </template>
  ```
  (Note: Vue 3 SFC `<script setup>` — use a single `defineProps`/`defineEmits` pair. The skeleton above shows the intent; in the real file keep one `defineProps` and one `defineEmits`. The `emit` variable is the destructured `defineEmits` return.)

  **`src/components/ui/Toggle.vue`** — a switch.
  ```vue
  <script setup lang="ts">
  defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
  </script>

  <template>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      class="relative w-9 h-5 flex-shrink-0 transition-colors duration-200 focus:outline-none"
      :style="{ backgroundColor: modelValue ? 'var(--color-work)' : '#222' }"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 left-0.5 w-4 h-4 bg-bg transition-transform duration-200"
        :style="{ transform: modelValue ? 'translateX(16px)' : 'translateX(0)' }"
      />
    </button>
  </template>
  ```

  **`src/components/SettingsDialog.vue`** — the modal. It uses a local `draft` ref seeded from `store.settings`, with the break fields expressed in **hours** (trigger) and **minutes** (duration) for editing, converting to seconds on Save.
  ```vue
  <script setup lang="ts">
  import { ref, computed, reactive } from 'vue'
  import { useClockStore } from '@/stores/clock'
  import NumberInput from '@/components/ui/NumberInput.vue'
  import Toggle from '@/components/ui/Toggle.vue'

  const emit = defineEmits<{ close: [] }>()
  const store = useClockStore()

  interface Draft {
    targetHours: number
    break1Enabled: boolean
    break1TriggerHours: number
    break1DurationMinutes: number
    break2Enabled: boolean
    break2TriggerHours: number
    break2DurationMinutes: number
  }

  const s = store.settings
  const draft = reactive<Draft>({
    targetHours: s ? s.daily_target / 3600 : 8,
    break1Enabled: s ? s.break1_enabled : true,
    break1TriggerHours: s ? s.break1_trigger / 3600 : 6,
    break1DurationMinutes: s ? s.break1_duration / 60 : 30,
    break2Enabled: s ? s.break2_enabled : true,
    break2TriggerHours: s ? s.break2_trigger / 3600 : 9,
    break2DurationMinutes: s ? s.break2_duration / 60 : 15,
  })

  function onBreak1Toggle(v: boolean) {
    draft.break1Enabled = v
    if (!v) draft.break2Enabled = false
  }

  async function save() {
    await store.setSettings({
      daily_target: draft.targetHours * 3600,
      break1_enabled: draft.break1Enabled,
      break1_trigger: draft.break1TriggerHours * 3600,
      break1_duration: draft.break1DurationMinutes * 60,
      break2_enabled: draft.break2Enabled,
      break2_trigger: draft.break2TriggerHours * 3600,
      break2_duration: draft.break2DurationMinutes * 60,
    })
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
          <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Settings</span>
          <button
            type="button"
            class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
            aria-label="Close"
            @click="emit('close')"
          >×</button>
        </div>

        <div class="px-6 py-5 flex flex-col gap-8">
          <section>
            <div class="font-mono text-[10px] tracking-widest text-text-faint uppercase mb-4">Daily target</div>
            <div class="flex items-center justify-between">
              <span class="font-mono text-sm text-text-dim">Target work hours</span>
              <div class="flex items-center gap-2">
                <NumberInput v-model="draft.targetHours" :min="1" :max="24" :step="0.5" />
                <span class="font-mono text-xs text-text-faint">h</span>
              </div>
            </div>
          </section>

          <section>
            <div class="font-mono text-[10px] tracking-widest text-text-faint uppercase mb-4">Automatic breaks</div>
            <div class="flex flex-col gap-5">
              <div v-for="i in 2" :key="i" class="flex flex-col gap-3">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-sm text-text-dim">Break {{ i }}</span>
                  <Toggle
                    :modelValue="i === 1 ? draft.break1Enabled : draft.break2Enabled"
                    @update:modelValue="i === 1 ? onBreak1Toggle($event) : (draft.break2Enabled = $event)"
                  />
                </div>
                <div
                  class="flex flex-col gap-3 pl-4 border-l transition-opacity duration-200"
                  :style="{
                    borderColor: (i === 1 ? draft.break1Enabled : draft.break2Enabled) ? 'var(--color-border-2)' : '#1a1a1a',
                    opacity: (i === 1 ? draft.break1Enabled : draft.break2Enabled) ? 1 : 0.35,
                  }"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs text-text-dim">Trigger after</span>
                    <div class="flex items-center gap-2">
                      <NumberInput
                        :modelValue="i === 1 ? draft.break1TriggerHours : draft.break2TriggerHours"
                        @update:modelValue="i === 1 ? (draft.break1TriggerHours = $event) : (draft.break2TriggerHours = $event)"
                        :min="0.5" :max="23" :step="0.5"
                        :disabled="i === 1 ? !draft.break1Enabled : !draft.break2Enabled"
                      />
                      <span class="font-mono text-xs text-text-faint">h worked</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs text-text-dim">Break duration</span>
                    <div class="flex items-center gap-2">
                      <NumberInput
                        :modelValue="i === 1 ? draft.break1DurationMinutes : draft.break2DurationMinutes"
                        @update:modelValue="i === 1 ? (draft.break1DurationMinutes = $event) : (draft.break2DurationMinutes = $event)"
                        :min="1" :max="120" :step="1"
                        :disabled="i === 1 ? !draft.break1Enabled : !draft.break2Enabled"
                      />
                      <span class="font-mono text-xs text-text-faint">min</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            class="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-border-2 text-text-faint hover:text-text hover:border-text-faint transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            type="button"
            class="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-work text-bg font-bold hover:bg-work-hi transition-colors"
            @click="save"
          >Save</button>
        </div>
      </div>
    </div>
  </template>
  ```

  **Tests** (`SettingsDialog.test.ts`):
  - Renders `Settings`, `Daily target`, `Automatic breaks`, `Break 1`, `Break 2`, `Cancel`, `Save`.
  - Seeded from `store.settings`: with defaults, the target input shows `8`, break1 trigger `6`, break1 duration `30`, break2 trigger `9`, break2 duration `15`.
  - Clicking Break 1's toggle off → break2's toggle also turns off and its inputs become `disabled` (cascade reflected in the draft).
  - Clicking Save calls `store.setSettings` with converted seconds values (`daily_target: 28800`, `break1_trigger: 21600`, `break1_duration: 1800`, etc.) and emits `close`.
  - Clicking Cancel emits `close` without calling `store.setSettings`.
  - Clicking the backdrop (self) emits `close`.
  - Editing target to `6` and saving → `store.settings.daily_target === 21600`.

- **Dependencies:** WP9-T3 (settings getter), WP8-T5 (`applySettingsPatch` cascade).
- **Acceptance criteria:**
  - All tests pass.
  - `pnpm dev`: opening the dialog from the header gear, editing values, and saving persists to IDB (reload shows the new values).
  - Disabling break1 in the dialog immediately greys out break2 and disables its inputs; saving persists `break2_enabled: false`.
- **V&V:** `pnpm test -- src/components/SettingsDialog.test.ts` then `pnpm dev` + reload check.
- **Pitfalls:**
  - The dialog edits a **draft** in hours/minutes; conversion to seconds happens only on Save. Do not write to `store.settings` on every keystroke.
  - `store.setSettings` already applies `applySettingsPatch` (cascade-disable). The dialog also reflects the cascade in the draft for UX, but the store is the source of truth — never bypass `store.setSettings`.
  - Use `reactive` for the draft (not `ref`) so `v-model`-style bindings can mutate nested fields directly via `draft.break1TriggerHours = $event`.
  - The `<script setup>` `defineProps`/`defineEmits` skeleton above must be cleaned to a single declaration each in the real file (Vue 3 does not allow multiple `defineProps` calls). The NumberInput/Toggle components are controlled via `v-model` (`modelValue` + `update:modelValue`).
  - Backdrop click uses `@click.self` so clicks inside the panel do not close the dialog.

---

## WP9-T9 — Remove `BreakOverlay`, cleanup dead code + tests

- **Goal:** Delete the now-unused `BreakOverlay` component and its test, and prune every WP4/WP6 affordance that the redesign dropped from the remaining tests: `+1min`/`+5min`/`+10min` buttons, the custom-time `<input type="time">`, the "Ready to work?" heading, the edit-start input, and the Reset day button. Verify no source file imports `BreakOverlay` or references the removed affordances.
- **Files:** delete `src/components/BreakOverlay.vue`, delete `src/components/BreakOverlay.test.ts`; audit `src/App.test.ts`, `src/components/ClockInView.test.ts`, `src/components/RunningView.test.ts` (these were rewritten in T6/T7/T4 — confirm no stale assertions remain); `git grep` for residual references.
- **Approach:**
  1. `rm src/components/BreakOverlay.vue src/components/BreakOverlay.test.ts`.
  2. Remove the `BreakOverlay` import + `v-else-if="view.kind === 'break'"` branch from `src/App.vue` if any remnant survives T4 (T4 already drops it; this is a safety check).
  3. Search the codebase for residual references and remove them:
     - `grep -rn "BreakOverlay" src/` → expect zero hits.
     - `grep -rn "rounded-full" src/components/` → the old big red button class; expect zero hits in `ClockInView`/`RunningView`.
     - `grep -rn "adjust(1\|adjust(5\|adjust(10\|+1min\|+5min\|+10min" src/` → expect zero hits in components (the domain `adjustStart` action and its test in `src/domain/adjust.test.ts` stay — the action remains available to the debug API and future UI; only the *buttons* are removed).
     - `grep -rn "type=\"time\"" src/components/` → expect zero hits (the custom-time and edit-start inputs are gone from components).
     - `grep -rn "Reset day\|store.reset()" src/components/` → expect zero hits in components. The `store.reset()` **action stays** (it is used by the debug API `clear()` and by `checkRollover`); only the UI button is removed. Do not delete the action.
     - `grep -rn "Ready to work" src/` → expect zero hits.
  4. Run the full test suite and remove any test case that asserts the removed affordances (e.g. an `App.test.ts` case that clicks `+5min`). Replace them with the T6/T7 assertions if not already done.

- **Dependencies:** WP9-T4 through WP9-T8.
- **Acceptance criteria:**
  - `src/components/BreakOverlay.vue` and `src/components/BreakOverlay.test.ts` do not exist.
  - `grep` searches above return no hits in `src/components/` and `src/App.vue`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass.
  - No test references the removed buttons/inputs.
- **V&V:** `pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
- **Pitfalls:**
  - Do **not** delete `store.reset`, `store.adjustStart`, or `store.editClockIn` — they are still used by the debug API (`window.__clocked.clear`, and the actions are part of the store's API surface). Only the UI buttons are removed.
  - Do **not** delete `src/domain/adjust.ts` or its test. The domain helpers remain.
  - The `<input type="time">` removal means there is no in-app backdating UI in v1.0. The debug API covers developer needs. This is intentional and should be noted in ADR-026 (T10).
  - If `App.test.ts` has a case that mounted `App` and clicked `button.rounded-full`, it was updated in T4; double-check it now uses `button.bg-work`.

---

## WP9-T10 — Docs update

- **Goal:** Record the redesign decisions in the ADR log, update the architecture diagram to drop `BreakOverlay` and add the new components, and mark WP4/WP6 as superseded for the visual layer.
- **Files:** `doc/decisions.md` (append ADR-026), `doc/architecture.md` (update the components diagram + the "Mandatory breaks — overlay" section), `doc/plan/README.md` (add WP9 to the file index, mark WP4/WP6 superseded), `doc/plan/04-ui.md` (add a superseded banner at the top), `doc/plan/06-styling.md` (add a superseded banner at the top).
- **Approach:**

  Append to `doc/decisions.md`:
  ```markdown
  ## ADR-026 — UI redesign v1.0 (dark mono / acid-green), inline mandatory-break banner

  - **Context:** the WP4/WP6 UI was a light-mode, round-red-button design with a full-screen `BreakOverlay` for mandatory breaks, +Nmin backdating buttons, a custom-time picker, an edit-start input, and a Reset day button. A Figma v1.0 design (`share/designs/ui_v1.0`) specified a dark, terminal-style aesthetic with inline break surfacing and a settings dialog wiring the previously-unwired `Settings` fields.
  - **Decision:**
    - Dark-only palette: `#0a0a0a` background, `#b8ff57` acid-green for work, `#ffa94d` orange for breaks, `#ff6b6b` red for overtime. JetBrains Mono everywhere (locally bundled via `@fontsource/jetbrains-mono`, no remote fonts).
    - Drop `BreakOverlay`; mandatory breaks are shown as an inline `BreakBanner` inside `RunningView` with a `MM:SS` countdown and a depleting progress bar. No skip/resume buttons (ADR-013 holds).
    - Drop the +Nmin buttons, the custom-time picker, the edit-start input, and the Reset day button from the UI. Manual breaks are taken via Clock Out → Clock In (a punch gap, consumed by recompute). Backdating is available only via the debug API.
    - Add a `SettingsDialog` (header gear) that edits `Settings` in hours/minutes and converts to seconds on save, with live cascade when break1 is disabled.
    - Add a `Timeline` + per-session list driven by a new `DerivedSegment[]` on the `Recomputed` output.
    - Amend ADR-006: displays remain `HH:MM`, with the single exception of the mandatory-break countdown, which uses `MM:SS` for usable resolution.
    - Amend ADR-017: the clocked-out account is enriched with the stats grid, daily-target bar, and timeline (no longer just the worked `HH:MM` + Reset button).
  - **Consequences:** WP4 and WP6 are superseded for the visual layer (their data-flow and lifecycle guidance still apply where unchanged). The `store.reset`/`adjustStart`/`editClockIn` actions remain in the store for the debug API even though no UI invokes them. The redesign is captured in `doc/plan/09-redesign-ui.md`.
  ```

  Update `doc/architecture.md`:
  - In the "Components" diagram, replace the three-component block with:
    ```
    ┌──────────────────────────────────────────────┐
    │  UI (Vue 3, vanilla TS) — dark mono v1.0      │
    │   - App.vue         (shell + header + dialog) │
    │   - ClockInView     (clock-in / clocked-out)  │
    │   - RunningView     (running / break, inline  │
    │                      BreakBanner, no overlay) │
    │   - SettingsDialog  (daily target + 2 breaks) │
    │   - shared: StatsGrid, DailyTargetBar,        │
    │     Timeline, BreakBanner, MilestoneHint      │
    └───────────────┬──────────────────────────────┘
    ```
  - Replace the "Mandatory breaks — overlay" section heading with "Mandatory breaks — inline banner" and describe the `BreakBanner` (no full-screen overlay, no skip button, `MM:SS` countdown, depleting progress bar).
  - Note that `BreakOverlay` is deleted and `viewState.kind === 'break'` is now rendered by `RunningView`.

  Update `doc/plan/README.md`:
  - Add a row to the file index table: `| `09-redesign-ui.md` | WP9 — UI redesign (Figma v1.0) | 10 |`.
  - Update the total task count note.
  - Add a note under the WP8 note: "WP9 supersedes WP4 and WP6 for the visual layer. Work WP9 only after WP8 (it depends on the new store getters and recompute output)."

  Add a superseded banner to the top of `doc/plan/04-ui.md` and `doc/plan/06-styling.md`:
  ```markdown
  > **Superseded for the visual layer by WP9 (`09-redesign-ui.md`).** The data-flow, lifecycle, and accessibility guidance here still apply where WP9 does not override them. WP9 replaces the components, classes, and color tokens described below.
  ```

- **Dependencies:** WP9-T1 through WP9-T9.
- **Acceptance criteria:**
  - ADR-026 is present in `doc/decisions.md`.
  - `doc/architecture.md` no longer references `BreakOverlay`; the diagram lists the new components.
  - `doc/plan/README.md` file index includes WP9.
  - `04-ui.md` and `06-styling.md` carry the superseded banner.
- **V&V:** `grep -n "ADR-026" doc/decisions.md`; `grep -n "BreakOverlay" doc/architecture.md` (expect zero); `grep -n "09-redesign-ui" doc/plan/README.md`.
- **Pitfalls:**
  - Do not delete WP4/WP6 files — they remain as historical context. Only add the banner.
  - Keep ADR-006 and ADR-017 in place; ADR-026 amends them rather than rewriting them.

---

## End of WP9

Once WP9-T10 passes, the app matches the Figma v1.0 design: dark, mono, acid-green, with a settings dialog, an inline mandatory-break banner, a timeline, and a stats grid. The data model and store from WP8 are unchanged at the type level (only read-only getters and the derived `segments` field were added). Run the global V&V (`pnpm lint && pnpm typecheck && pnpm build && pnpm test`) and the manual PWA checks from `doc/test-vnv-strategy.md` (`pnpm preview`) to confirm installability, offline behavior, and timer survival across screen lock still hold.
