# WP1 — Core domain logic

Goal: pure TypeScript functions implementing the Clocked business rules. **No Vue, no DOM, no Pinia.** Everything in `src/domain/`. Unit-tested with Vitest.

These functions are the heart of the app and must be deterministic and pure — given the same inputs they produce the same outputs, with no side effects.

**Strict order:** T1 → T2 → ... → T6.

---

## WP1-T1 — Domain types

- **Goal:** Define the core types used throughout the app.
- **Files:** `src/domain/types.ts`.
- **Approach:** Single file exporting the canonical types:
  ```ts
  export type BreakDuration = 30 | 15

  export interface WorkSegment {
    type: 'work'
    start: number
    end?: number
  }

  export interface BreakSegment {
    type: 'break'
    start: number
    end?: number
    duration: BreakDuration
  }

  export type Segment = WorkSegment | BreakSegment

  export interface Entry {
    date: string
    segments: Segment[]
  }

  export type BreakState = 'running' | 'break30' | 'break15'

  export interface ClockState {
    state: BreakState
    workedMs: number
    displayMs: number
    breakEndsAt?: number
    currentSegment: Segment
  }

  export type ViewState =
    | { kind: 'clock-in' }
    | { kind: 'running' }
    | { kind: 'break' }
    | { kind: 'clocked-out' }
  ```
- **Dependencies:** none.
- **Acceptance criteria:**
  - `pnpm typecheck` passes.
  - All other domain files can `import type` from `./types` without circular imports.
- **V&V:** `pnpm typecheck`.
- **Pitfalls:**
  - Use `export interface` for object shapes, `export type` for unions.
  - `verbatimModuleSyntax: true` (set in WP0-T4) means imports of types must use `import type`.
  - Do not put logic in `types.ts`. Only declarations.

---

## WP1-T2 — Date utilities

- **Goal:** Helpers for the local-calendar-day concept and the day-boundary check.
- **Files:** `src/domain/date.ts`, `src/domain/date.test.ts`.
- **Approach:**
  ```ts
  // src/domain/date.ts
  export function todayString(now: Date = new Date()): string {
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  export function isExpired(entryDate: string, now: Date = new Date()): boolean {
    return entryDate !== todayString(now)
  }

  export function localEpochForTodayMs(
    hours: number,
    minutes: number,
    now: Date = new Date(),
  ): number {
    const d = new Date(now)
    d.setHours(hours, minutes, 0, 0)
    return d.getTime()
  }
  ```
  Test cases (`date.test.ts`):
  - `todayString` for a known Date returns `'YYYY-MM-DD'` with zero-padded month/day.
  - Crossing midnight: `todayString(new Date('2026-07-20T23:59'))` vs `todayString(new Date('2026-07-21T00:00'))` differ.
  - `isExpired('2026-07-20', new Date('2026-07-21T00:00'))` is `true`.
  - `isExpired('2026-07-21', new Date('2026-07-21T23:59'))` is `false`.
  - `localEpochForTodayMs(9, 30, ...)` returns an epoch where `new Date(...).getHours() === 9 && .getMinutes() === 30`.
- **Dependencies:** WP1-T1.
- **Acceptance criteria:**
  - All listed test cases pass.
  - `pnpm typecheck` clean.
- **V&V:** `pnpm test -- src/domain/date.test.ts`.
- **Pitfalls:**
  - Always default `now: Date = new Date()` so tests can inject a fixed `now`.
  - Never use `Date.UTC` — we want local day, not UTC day. A user in UTC+2 at 23:30 local is still on their local day, even though it's the next day in UTC.

---

## WP1-T3 — Time formatting

- **Goal:** Convert ms durations to `HH:MM` display strings.
- **Files:** `src/domain/format.ts`, `src/domain/format.test.ts`.
- **Approach:**
  ```ts
  // src/domain/format.ts
  export function formatHHMM(ms: number): string {
    const totalMinutes = Math.floor(ms / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  export function formatMMSS(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  ```
  Test cases:
  - `formatHHMM(0)` → `'00:00'`
  - `formatHHMM(59_999)` → `'00:00'` (rounds down)
  - `formatHHMM(60_000)` → `'00:01'`
  - `formatHHMM(6 * 3600_000)` → `'06:00'`
  - `formatHHMM(6 * 3600_000 + 30 * 60_000)` → `'06:30'`
  - `formatHHMM(9 * 3600_000 + 15 * 60_000)` → `'09:15'`
  - `formatHHMM(10 * 3600_000)` → `'10:00'`
  - `formatMMSS(0)` → `'00:00'`
  - `formatMMSS(1500_000)` → `'25:00'` (for break countdown)
  - `formatMMSS(1500_000 - 1)` → `'24:59'`
- **Dependencies:** WP1-T1.
- **Acceptance criteria:**
  - All listed cases pass.
  - No `Math.round` — always floor (per ADR-006).
- **V&V:** `pnpm test -- src/domain/format.test.ts`.
- **Pitfalls:**
  - `formatHHMM` is for the elapsed display; `formatMMSS` is for the break-countdown overlay.
  - Negative inputs should not occur in production; if they do, return `'00:00'` (clamp) — add a test for this.

---

## WP1-T4 — `recomputeBreaks` pure function

- **Goal:** The core state machine. Given an `Entry`'s segments and a `now` timestamp, produce the canonical segments (with breaks inserted/removed) and the derived `ClockState`.
- **Files:** `src/domain/recomputeBreaks.ts`, `src/domain/recomputeBreaks.test.ts`.
- **Approach:**

  Signature:
  ```ts
  export const SIX_HOURS_MS = 6 * 3600_000
  export const NINE_HOURS_MS = 9 * 3600_000
  export const BREAK_30_MS = 30 * 60_000
  export const BREAK_15_MS = 15 * 60_000

  export interface RecomputeResult {
    segments: Segment[]
    state: BreakState
    workedMs: number
    displayMs: number
    breakEndsAt?: number
  }

  export function recomputeBreaks(
    segments: Segment[],
    now: number,
  ): RecomputeResult
  ```

  Algorithm (write it out in the file as a docstring-style block comment OR keep it in the test descriptions):
  
  1. Clone segments (deep clone each segment object; never mutate input).
  2. Walk segments in order, maintaining:
     - `workedMs` accumulator,
     - flags `break30Fired` and `break15Fired` (bool),
     - an output array `out` of canonical segments.
  3. For each work segment:
     - Compute its duration so far: `workDur = (seg.end ?? now) - seg.start`. Clamp to >= 0.
     - Determine the threshold to check:
       - If `!break30Fired` and `workedMs + workDur >= SIX_HOURS_MS`, the 30 break fires at instant `seg.start + (SIX_HOURS_MS - workedMs)`.
       - Else if `!break15Fired` and `workedMs + workDur >= NINE_HOURS_MS`, the 15 break fires at instant `seg.start + (NINE_HOURS_MS - workedMs)`.
     - If a threshold fires within this segment:
       - Split the work segment: `[seg.start, crossingInstant)` (closed at start, end = crossingInstant), then a break segment `{ start: crossingInstant, duration: 30 | 15 }`.
       - Check if the break is already over: `if (now >= crossingInstant + duration)`, set `break.end = crossingInstant + duration`, push both to `out`, then start a new work segment `{ start: break.end }` and continue the walk with the remaining time of the original segment appended to it (loop).
       - Else: leave the break open (`end === undefined`), set `breakEndsAt = crossingInstant + duration`, push to `out`, stop the walk (we're now in a break state).
     - Else: add the work segment's duration to `workedMs`, push the segment (possibly with `end` clamped to `now`) to `out`, continue.
  4. For each break segment encountered in the input (already-fired breaks from a prior recompute):
     - If the break is closed (`end !== undefined`), preserve it as-is in `out`.
     - If the break is open (`end === undefined`), check `now - seg.start >= seg.duration * 60_000`:
       - If yes: close it (`end = start + duration`), push to `out`, then start a new open work segment `{ start: break.end }` for the resumed period.
       - If no: preserve as open, set `breakEndsAt = seg.start + duration * 60_000`, push to `out`, stop the walk.
     - Mark `break30Fired` / `break15Fired` accordingly based on `seg.duration`.
  5. Compute final `state`:
     - If the last segment in `out` is an open break → `'break30'` or `'break15'` based on `seg.duration`.
     - Else → `'running'`.
  6. `displayMs = workedMs` (breaks excluded by construction).
  
  Test cases (write one test per case, with descriptive `it` strings):
  - Empty segments array → returns `{ segments: [], state: 'running', workedMs: 0, displayMs: 0 }`.
  - Single work segment, 1h in → state running, workedMs = 3600_000, no breaks inserted.
  - Single work segment crossing 6h: at `now = start + 6h + 1ms`, the segment is split at `start + 6h`, a `break(30)` is inserted and is open, `workedMs = 6h`, `breakEndsAt = start + 6h + 30min`.
  - During the 30 break: `now = start + 6h + 10min` → state `break30`, `workedMs` still `6h` (frozen), `breakEndsAt` correct.
  - After the 30 break ends: `now = start + 6h + 31min` → break closed, new work segment from `start + 6h + 30min` to `now`, `workedMs = 6h + 1min`.
  - After the 30 break, working toward 9h: at `now = start + 9h + 30min` (worked = 9h after subtracting the 30 min break), the 15 break fires. Verify it's at the right wall-clock instant.
  - After the 15 break: `now = start + 9h + 45min + 1ms` → break closed, running again.
  - Multiple work sessions (clock-out + clock-in): given two work segments, worked time sums across them; a 30 break fires when the **sum** reaches 6h.
  - Editing clock-in backward (start moves earlier by 5min via `+5min`) increases workedMs; a previously-not-yet-fired 30 break may now fire; recompute is deterministic.
  - Editing clock-in forward (start moves later) may un-fire a previously-fired break that no longer has reached its threshold; recompute removes it.
  - Idempotency: `recomputeBreaks(recomputeBreaks(segments, now).segments, now)` deep-equals the first call's result.
  - No mutation: pass a frozen copy of segments in, verify after the call that the original is structurally identical (use `JSON.stringify` comparison).
  - Breaks fire exactly once each per day, regardless of how many sessions.
- **Dependencies:** WP1-T1.
- **Acceptance criteria:**
  - All listed test cases pass.
  - Idempotency test passes.
  - No-mutation test passes.
  - `pnpm typecheck` clean.
- **V&V:** `pnpm test -- src/domain/recomputeBreaks.test.ts`.
- **Pitfalls:**
  - The hardest part is correctly splitting a work segment at the crossing instant AND handling the case where the same segment crosses both thresholds (e.g. if `now` is far in the future and both breaks should have fired). Iterate carefully.
  - When `now` is huge (e.g. user left the app open for 12h), the function must close both breaks and continue working past 9h.
  - Be careful with the order: `break30Fired` must be true before checking `break15` threshold, because the 9h threshold is reached **after** the 30 min break.
  - Do not store derived state in the segments themselves — break state is purely derived from the segment list. The only persistent segments are work segments and already-fired (closed or open) breaks.
  - If `seg.end` is in the future relative to `now`, clamp it to `now` in the computation.

---

## WP1-T5 — Adjustment helpers

- **Goal:** Helpers for the +1/+5/+10min adjustment buttons and the OS time picker.
- **Files:** `src/domain/adjust.ts`, `src/domain/adjust.test.ts`.
- **Approach:**
  ```ts
  // src/domain/adjust.ts
  import type { Segment } from './types'

  export const ADJUSTMENTS = [1, 5, 10] as const
  export type AdjustmentMinutes = (typeof ADJUSTMENTS)[number]

  export function adjustOpenWorkSegmentStart(
    segments: Segment[],
    minutes: AdjustmentMinutes,
  ): Segment[] {
    const last = segments[segments.length - 1]
    if (!last || last.type !== 'work' || last.end !== undefined) {
      throw new Error('Cannot adjust: no open work segment')
    }
    const delta = minutes * 60_000
    const adjusted: Segment = { ...last, start: last.start - delta }
    return [...segments.slice(0, -1), adjusted]
  }

  export function setFirstWorkSegmentStart(
    segments: Segment[],
    newStart: number,
  ): Segment[] {
    const first = segments[0]
    if (!first || first.type !== 'work') {
      throw new Error('No leading work segment to edit')
    }
    const adjusted: Segment = { ...first, start: newStart }
    return [adjusted, ...segments.slice(1)]
  }
  ```
  Test cases:
  - `adjustOpenWorkSegmentStart([{type:'work', start: 1000}], 5)` → last segment start is `1000 - 300_000`.
  - Adjusting when the last segment is a closed work segment throws.
  - Adjusting when the last segment is an open break segment throws.
  - Adjusting an empty array throws.
  - `setFirstWorkSegmentStart` updates only the first segment.
  - Both functions return new arrays; the input is not mutated (verify with `Object.freeze`).
- **Dependencies:** WP1-T1, WP1-T4 (for understanding how the result will be re-fed to `recomputeBreaks`).
- **Acceptance criteria:**
  - All test cases pass.
  - Both functions are pure (no mutation).
- **V&V:** `pnpm test -- src/domain/adjust.test.ts`.
- **Pitfalls:**
  - The `+N min` buttons are disabled while the open segment is a break — the UI enforces this, but the helper also throws to be safe. Document this.
  - After adjustment, the calling code (WP3 store) must call `recomputeBreaks` to refresh the break state. `adjust.ts` does not recompute.

---

## WP1-T6 — WP1 integration test

- **Goal:** A single test file that exercises the whole domain pipeline end-to-end with a realistic day scenario.
- **Files:** `src/domain/integration.test.ts`.
- **Approach:** Use `it.each` or a sequence of `it` blocks to simulate a full day:
  1. Start at 08:00, work continuously.
  2. At 14:00 (6h worked), verify the 30 break is open with `breakEndsAt = 14:30`.
  3. At 14:31, verify the break is closed and a new work segment is open.
  4. At 17:30 (worked = 6h + 3h = 9h), verify the 15 break is open.
  5. At 17:46, verify the 15 break is closed and running again.
  6. Clock out at 18:00. Verify the work segment is closed, `workedMs = 10h` (6 + 3 + 1).
  7. Clock back in at 19:00. Verify a new work segment was added.
  8. Adjust +5min on the new open segment. Verify its start moved earlier by 5min.
  9. Run `recomputeBreaks` again on the final segments; verify idempotency (call twice, deep-equal).
  10. Verify `formatHHMM(workedMs)` displays the expected `'11:05'` (10h original + 1h second session + 5min adjust = 11h05m).
- **Dependencies:** WP1-T1 through WP1-T5.
- **Acceptance criteria:**
  - All steps pass.
  - The integration test runs in < 100ms (pure logic, no DOM).
- **V&V:** `pnpm test -- src/domain/integration.test.ts`.
- **Pitfalls:**
  - Use absolute epoch ms for "start at 08:00" — e.g. `const start = new Date('2026-07-21T08:00:00').getTime()`. Compute `now` from that.
  - Don't import from the store or Vue here — this is pure domain.

---

## End of WP1

Once WP1-T6 passes, all the business rules are implemented and tested in isolation. Proceed to `02-storage.md`.
