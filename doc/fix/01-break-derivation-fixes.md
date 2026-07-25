# FX1 — Break derivation correctness

Goal: fix four interrelated defects in the mandatory-break system and tighten
the gap-classification semantics. All four stem from the same module
(`src/domain/recompute.ts`) and must be fixed together because the gap-
classification rewrite is what unblocks break2 and the countdown expiry.

## Defects addressed

1. **Break1 countdown stays at 00:00.** Once a mandatory break1 fires, the
   `breakState` never reverts to `running`; `breakEndsAtMs` is sticky for the
   rest of the day. Documented as a "pre-existing limitation" in
   `src/domain/recompute.test.ts:84-92`. `doc/architecture.md:142` says the
   revert *should* happen.
2. **Break2 never triggers.** `recompute.ts:113` (`if (breakEndsAtMs !== undefined) break`)
   exits the punch walk as soon as break1 fires, so the break2 branch
   (`recompute.ts:115-147`) is unreachable while a mandatory break1 is active.
3. **Cannot clock out during a break.** `RunningView.vue:46` gates the Clock
   Out button on `v-if="isRunning"`, and `viewState.kind === 'break'` while on
   a break. The store action `clockOut` (`stores/clock.ts:145`) has no break
   guard, so only the UI hides the affordance. This was *intentional* per
   ADR-013; this fix package reclassifies it as a bug.
4. **Gap classification too permissive.** Currently any positive gap counts
   toward the required break total (aggregate rule, `recompute.ts:35-37, 67`).
   New rule: a gap only counts as a break if it is longer than the break's own
   duration; otherwise a mandatory break is injected. Short-gap time is
   "clocked out" (neither work nor break). A single very long gap can satisfy
   both breaks. A late-appearing long gap removes a previously-injected
   mandatory break (pure-functional: recompute simply does not inject it).

## New gap/break semantics (authoritative for this fix)

- A **gap** is the time between a closed punch's `out` and the next punch's
  `in`. A gap is never counted as worktime.
- **break1 is satisfied** by a gap iff `gap > break1_duration`.
- The **same gap also satisfies break2** iff `gap > break1_duration + break2_duration`
  (a "very long" gap). The first `break1_duration` of the gap covers break1;
  the next `break2_duration` covers break2.
- **break2 is satisfied by a later gap** (after break1 is already satisfied by
  an earlier gap) iff that later gap `> break2_duration`.
- A **short gap** (`<=` the relevant break duration, or the remainder of a long
  gap after the consumed break portion) is "clocked out" time: it remains a
  `gap-break` segment in the timeline but contributes 0 to `breakSeconds`.
- **Only the consumed break portions** count toward `breakSeconds`. The rest
  of a satisfying gap is "clocked out" (not work, not break).
- **Ordering:** break1 must be satisfied (by a gap OR by an elapsed mandatory
  pause) before break2 is evaluated.
- **Mandatory pause still fires** for any enabled break that is *not* gap-
  satisfied, when worked time crosses its trigger. The pause is "live" while
  `nowSec < trigger + duration`; once `nowSec >= trigger + duration` it is
  "elapsed" (historical segment, state reverts to `running`, walk continues).
- **Late long gap:** if a gap that satisfies a break exists anywhere in the
  punches, that break's mandatory pause is never injected. If a mandatory
  pause was shown on an earlier recompute (live window) and a later recompute
  sees a qualifying gap, the pause disappears and its time reverts to
  worktime. (During the *live* break1 window the user cannot clock in, so a
  new gap cannot appear mid-break; the late-long-gap scenario only arises
  after break1 has elapsed and work resumed.)
- **break2 still fires as a mandatory pause** when break1 was gap-satisfied
  but break2 was not, and worked time crosses `break2_trigger`. Each break is
  evaluated independently once the prior one is satisfied.

## Segment representation (unchanged)

All positive gaps remain single `gap-break` segments — do **not** split a long
gap into break/clocked-out sub-segments. The break-vs-clocked-out accounting
is internal to recompute; the timeline shows reality (the whole gap as one
`gap-break` segment). If a future UI task wants to visually distinguish the
"clocked out" remainder, that is out of scope here.

**Strict order:** T1 → T2 → ... → T7.

---

## FX1-T1 — Rewrite `recompute` break algorithm

- **Goal:** Replace the aggregate `totalGaps >= totalRequired` rule and the
  single-shot walk with a per-break, gap-matched, expiry-aware walk. This
  single task fixes defects 1, 2, and 4 at the domain layer. Keep
  `insertMandatoryBreak` (lines 176-225) unchanged — its segment-splicing
  logic is independent of the trigger decision.
- **Files:** `src/domain/recompute.ts` (rewrite the body from line 33 onward;
  keep the signature, the empty-punches early return, the `work`/`gap-break`
  segment construction, and `insertMandatoryBreak`/`epochMsForSeconds`).
- **Approach:**

  Replace the block currently at lines 33-153 with this algorithm:

  1. **Compute break budgets.**
     `break1Dur = settings.break1_enabled ? settings.break1_duration : 0`
     (same for break2). `b1Trigger`, `b2Trigger` as today.

  2. **Gap classification pass** (new). Walk gaps chronologically. For each
     gap, attempt to satisfy break1 first, then break2:
     - If break1 is not yet satisfied and `gap > break1_duration`:
       - Consume `break1_duration` from the gap for break1.
       - Record which gap index satisfied break1 and the consumed offset, so
         the same gap can continue to break2.
       - Mark `break1SatisfiedByGap = true`.
     - If break1 is now satisfied and break2 is not, and the *remaining* gap
       length `> break2_duration`: consume `break2_duration` for break2,
       mark `break2SatisfiedByGap = true`.
     - A single very long gap (`> break1_duration + break2_duration`)
       satisfies both in one pass.
     - Track `gapBreakSeconds = sum of consumed portions` (only the consumed
       break durations, never the full gap).
     - Gaps are matched to breaks in chronological order; one gap satisfies
       at most break1 + break2 (both from the same gap if long enough).

  3. **Mandatory pause budget.** For each enabled break NOT gap-satisfied, a
     mandatory pause of that break's full duration may be injected at its
     trigger point (subject to the live/elapsed rule in step 5).

  4. **Walk punches** accumulating `workedElapsed` (seconds of work, excluding
     gaps and excluding any already-injected mandatory pauses).

5. **break1 evaluation** (only if break1 enabled and NOT gap-satisfied):
      - When `workedElapsed` crosses `b1Trigger` at `triggerSec = p.in + consumed`:
        - Compute `break1End = triggerSec + break1Dur`.
        - If `nowSec < break1End` → **live mandatory break**: set
          `breakState='break1'`, `breakEndsAtMs = epochMsForSeconds(triggerSec) + break1Dur*1000`,
          call `insertMandatoryBreak(segments, triggerSec, break1Dur, 0)`,
          deduct **elapsed break time** `nowSec - triggerSec` from worked time (add to `mandatoryBreakSeconds`),
          mark `break1Done = true`, and `break` out of the loop (user is on
          break right now).
        - If `nowSec >= break1End` → **elapsed mandatory break**: call
          `insertMandatoryBreak(segments, triggerSec, break1Dur, 0)` (historical
          segment), deduct **full** `break1Dur` from worked time, mark `break1Done = true`,
          do **not** set `breakEndsAtMs`/`breakState`, and **continue the walk**
          so break2 can be evaluated. (This is the defect-1 fix.)

6. **break2 evaluation** (only if break2 enabled, break1 done — either gap-
      satisfied or elapsed — and break2 NOT gap-satisfied):
      - Same live/elapsed logic at `b2Trigger` with `break2Dur` and
        `breakIndex: 1`. Live break deducts elapsed (`nowSec - triggerSec`);
        elapsed break deducts full `break2Dur`. (This is the defect-2 fix — break2
        is now reachable because break1's elapsed path does not exit the loop.)

  7. **Aggregation.**
     `breakSeconds = gapBreakSeconds + mandatoryBreakSeconds`
     `workedSeconds = max(0, workedGross - breakSeconds)`
     `displaySeconds = workedSeconds`

  8. Return shape unchanged: `{ workedSeconds, breakSeconds, displaySeconds,
     breakState, breakEndsAtMs, targetReached, limitReached, segments }`.

  **Pseudocode skeleton** (fill in real TS):

  ```ts
  const break1Dur = settings.break1_enabled ? settings.break1_duration : 0
  const break2Dur = settings.break2_enabled ? settings.break2_duration : 0
  const b1Trigger = settings.break1_enabled ? settings.break1_trigger : Infinity
  const b2Trigger = settings.break2_enabled ? settings.break2_trigger : Infinity

  // gap classification
  let break1SatisfiedByGap = false
  let break2SatisfiedByGap = false
  let gapBreakSeconds = 0
  {
    let need1 = break1Dur > 0
    let need2 = break2Dur > 0
    for (const g of gaps) {
      let remaining = g
      if (need1 && remaining > break1Dur) {
        gapBreakSeconds += break1Dur
        remaining -= break1Dur
        break1SatisfiedByGap = true
        need1 = false
      }
      if (!need1 && need2 && remaining > break2Dur) {
        gapBreakSeconds += break2Dur
        remaining -= break2Dur
        break2SatisfiedByGap = true
        need2 = false
      }
      // remaining (if any) is "clocked out" time — contributes nothing
    }
  }

  let breakState: BreakState = 'running'
  let breakEndsAtMs: number | undefined
  let mandatoryBreakSeconds = 0
  let break1Done = break1SatisfiedByGap || break1Dur === 0
  let break2Done = break2SatisfiedByGap || break2Dur === 0

  if (!(break1Done && break2Done)) {
    let workedElapsed = 0
    for (let pi = 0; pi < punches.length; pi++) {
      const p = punches[pi]
      const end = p.out ?? nowSec
      const dur = end - p.in
      let consumed = 0

      if (!break1Done && workedElapsed < b1Trigger) {
        const toTrigger = b1Trigger - workedElapsed
        if (toTrigger <= dur) {
          consumed += toTrigger
          const triggerSec = p.in + consumed
          const breakEnd = triggerSec + break1Dur
          insertMandatoryBreak(segments, triggerSec, break1Dur, 0)
          const elapsedBreak = nowSec < breakEnd ? nowSec - triggerSec : break1Dur
          mandatoryBreakSeconds += elapsedBreak
          break1Done = true
          if (nowSec < breakEnd) {
            breakEndsAtMs = epochMsForSeconds(triggerSec) + break1Dur * 1000
            breakState = 'break1'
            break
          }
        }
      }

      if (!break2Done && break1Done && workedElapsed + (dur - consumed) >= b2Trigger) {
        // same pattern; breakIndex: 1
        const toTrigger2 = b2Trigger - workedElapsed
        if (toTrigger2 > 0 && toTrigger2 <= dur - consumed) {
          consumed += toTrigger2
          const triggerSec = p.in + consumed
          const breakEnd2 = triggerSec + break2Dur
          insertMandatoryBreak(segments, triggerSec, break2Dur, 1)
          const elapsedBreak2 = nowSec < breakEnd2 ? nowSec - triggerSec : break2Dur
          mandatoryBreakSeconds += elapsedBreak2
          break2Done = true
          if (nowSec < breakEnd2) {
            breakEndsAtMs = epochMsForSeconds(triggerSec) + break2Dur * 1000
            breakState = 'break2'
            break
          }
        }
      }

      if (breakEndsAtMs !== undefined) break
      workedElapsed += dur - consumed
    }
  }

  const breakSeconds = gapBreakSeconds + mandatoryBreakSeconds
  const workedSeconds = Math.max(0, workedGross - breakSeconds)
  ```

  Note: the exact trigger-crossing condition for break2 mirrors break1 — factor
  into a helper if it reduces duplication, but keep the function pure and the
  `break` semantics identical (break out of the walk only when a *live*
  mandatory break is set).

- **Dependencies:** none (recompute is leaf logic).
- **Acceptance criteria:**
  - `breakState === 'running'` and `breakEndsAtMs === undefined` when
    `nowSec >= b1Trigger + break1Dur` (defect 1 fixed).
  - break2 fires (live or elapsed) after break1 is done (defect 2 fixed).
  - A gap `> break1_duration` satisfies break1 (no mandatory break1 injected);
    the consumed `break1_duration` counts toward `breakSeconds`, the gap
    remainder does not (defect 4 fixed).
  - A gap `> break1_duration + break2_duration` satisfies both breaks.
  - A short gap (`<= break1_duration`) does not satisfy break1; mandatory
    break1 is still injected at the trigger.
  - A late-appearing long gap removes a previously-injected mandatory break
    (verified by recompute with the same punches on two calls — there is no
    state to carry, so this is automatic).
  - `workedGross` and `segments` shape unchanged for the no-break case.
  - **During a live mandatory break: `workedSeconds` is frozen at the trigger
    value and `breakSeconds` counts up from 0 to the break duration. After the
    break elapses, `breakSeconds` equals the full duration and `workedSeconds`
    resumes incrementing.** (Supersedes FX1 step 5/6 which prescribed
    deducting the full duration immediately.)
- **V&V:** `pnpm test -- src/domain/recompute.test.ts` (after T4).
- **Pitfalls:**
  - Do **not** carry state across recompute calls. Each call is pure and
    derives everything from `punches` + `settings` + `nowSec`. The "late long
    gap removes a prior mandatory break" works precisely because there is no
    memory of a prior decision.
  - The walk must `break` only on a *live* mandatory break
    (`nowSec < breakEnd`). An *elapsed* mandatory break (`nowSec >= breakEnd`)
    must continue the walk so break2 can fire.
  - `break1Done` must be true when break1 is disabled (`break1Dur === 0`) so
    break2 can still be evaluated if break2 is enabled — but note ADR-023
    cascade: if break1 is disabled, break2 is also disabled (enforced in
    `applySettingsPatch`). Still, code defensively.
  - Keep `insertMandatoryBreak` untouched. It already handles splitting work
    and gap-break segments at the trigger second.
  - The open punch uses `p.out ?? nowSec`. During a live mandatory break the
    last punch is the open one that crossed the trigger; `end = nowSec` is
    correct and `nowSec < breakEnd` is the live condition.
  - When the user clocks out during a live break1 (FX1-T3), the last punch
    becomes closed at `out = nowSec`. On the next recompute, `nowSec` may be
    past `breakEnd` (if clock-out happened after the break would have ended)
    or before (if during). If before, the live-break branch still fires and
    `breakState` stays `break1` — but `viewState` becomes `clocked-out`
    because the store's `isClockedIn` is false and `viewState` checks
    `isClockedIn` before `isOnBreak`? **Verify the `viewState` getter
    precedence** in FX1-T4; if needed, adjust so a clocked-out user is never
    shown as "on break".

---

## FX1-T2 — Defensive hide-on-zero in `BreakBanner`

- **Goal:** Prevent the banner from flashing 00:00 during the 1-second tick
  window where `now` has advanced but recompute has not yet re-run. Belt-and-
  suspenders guard on top of the T1 fix.
- **Files:** `src/components/BreakBanner.vue` (line 22).
- **Approach:** Change the `v-if`:
  ```vue
  v-if="store.isOnBreak && store.breakEndsAt && store.breakEndsAt > store.now"
  ```
  No other changes to the component.
- **Dependencies:** FX1-T1 (so recompute actually clears `breakEndsAtMs`).
- **Acceptance criteria:** Banner disappears the tick the countdown reaches
  zero (or one tick earlier at most); no 00:00 freeze.
- **V&V:** `pnpm test -- src/components/BreakBanner.test.ts` (update the test
  that asserts the banner renders to also assert it does NOT render when
  `breakEndsAt <= now`).
- **Pitfalls:** `store.breakEndsAt` is `number | undefined`; the truthiness
  check `store.breakEndsAt &&` must come before the `>` comparison. Keep the
  order as written.

---

## FX1-T3 — Allow clock-out during a break

- **Goal:** Show the Clock Out button while on a mandatory break and ensure
  clocking out ends the day cleanly (closes the open punch, keeps the derived
  mandatory-break segment in the timeline, clears live break state).
- **Files:**
  - `src/components/RunningView.vue` (line 46)
  - `src/stores/clock.ts` (`clockOut` action, lines 145-153 — verify, likely
    no change needed)
  - `src/components/RunningView.test.ts` (lines 43-54 — flip the assertion)
- **Approach:**
  - `RunningView.vue:46`: change `v-if="isRunning"` to
    `v-if="isRunning || isOnBreak"`.
  - The store's `clockOut` already has no `isOnBreak` guard and closes the
    last punch with `out = nowSec`. After clock-out, `_isClockedIn = false`.
  - **Verify `viewState` precedence:** in `stores/clock.ts:59-64`, `viewState`
    checks `isOnBreak` before `_isClockedIn`. If a user clocks out during a
    live break, recompute may still return `breakState === 'break1'` (if
    `nowSec < breakEnd`), so `viewState` would stay `'break'` instead of
    becoming `'clocked-out'`. **Fix:** reorder `viewState` so `isClockedIn`
    is checked before `isOnBreak` — but that would hide the break state while
    the user is still technically on break. Better: add an explicit
    "clocked-out takes precedence over break" rule. Concretely, change
    `viewState` to:
    ```ts
    viewState(): ViewState {
      if (!this.worktime) return { kind: 'clock-in' }
      if (!this._isClockedIn) return { kind: 'clocked-out' }
      if (this.isOnBreak) return { kind: 'break' }
      return { kind: 'running' }
    }
    ```
    This means: once clocked out, the user is clocked-out regardless of any
    lingering derived break state. The timeline still shows the mandatory-
    break segment (it is in `segments`, independent of `viewState`). Confirm
    this matches the intended UX: the day is over, the user is not "on break"
    anymore. (If you want the break banner to persist after clock-out, do
    NOT make this change — but then `RunningView` would need to render during
    `clocked-out`, which it does not. The clean choice is: clock-out ends
    the day, break banner disappears, timeline retains the segment.)
  - `RunningView.test.ts:43-54`: change the test from "hides Clock Out button
    when on break" to "shows Clock Out button when on break" and assert the
    button is present when `viewState.kind === 'break'`.
- **Dependencies:** FX1-T1.
- **Acceptance criteria:**
  - Clock Out button is visible and clickable while `viewState.kind === 'break'`.
  - Clicking it during a break closes the open punch, sets `isClockedIn=false`,
    and `viewState` becomes `'clocked-out'` (app shows `ClockInView`).
  - The timeline on the clocked-out view retains the mandatory-break segment
    for the already-elapsed portion of the break.
- **V&V:** `pnpm test -- src/components/RunningView.test.ts`; manual: trigger
  break1, click Clock Out, confirm app switches to `ClockInView` and the
  timeline shows the mandatory-break segment.
- **Pitfalls:**
  - This contradicts ADR-013 ("clock-out disabled during break"). FX1-T7
    updates the ADR. Do not skip the doc update.
  - The `isClockedOut` getter (`stores/clock.ts:56`) is
    `!!this.worktime && !this._isClockedIn && !this.isOnBreak`. After the
    `viewState` reorder, `isOnBreak` may still be true (recompute still
    returns `break1`). Simplify `isClockedOut` to
    `!!this.worktime && !this._isClockedIn` to match the new precedence.
    Add/adjust a store test for this.
  - Do not remove the `if (this.isOnBreak) return` guard in `clockIn`
    (line 133) — clocking *in* during a break should still be blocked; the
    user must wait for the break to elapse or clock out first.

---

## FX1-T4 — Update `recompute` tests

- **Goal:** Replace tests that encoded the old/buggy behavior and add coverage
  for the new gap-classification and expiry semantics.
- **Files:** `src/domain/recompute.test.ts`.
- **Approach:**
  - **Replace** the "after break1 ends, algorithm returns break1 state
    (pre-existing limitation)" test (lines 84-92) with:
    ```
    it('after break1 ends, state reverts to running', () => {
      const r = recompute([{ in: 0 }], S, 25200)  // 7h, past 6h+30min
      expect(r.breakState).toBe('running')
      expect(r.breakEndsAtMs).toBeUndefined()
      // mandatory-break segment still present (historical)
      const mb = r.segments.find(s => s.type === 'mandatory-break')!
      expect(mb.startSec).toBe(21600)
      expect(mb.endSec).toBe(23400)
      // worked time excludes the 30min break
      expect(r.breakSeconds).toBe(1800)
      expect(r.workedSeconds).toBe(23400)
    })
    ```
  - **Add** break2-fires-after-break1-elapses:
    ```
    it('break2 fires after break1 has elapsed', () => {
      // single open punch, now past b1Trigger+break1Dur and past b2Trigger
      // b1Trigger=21600, break1Dur=1800 → break1 ends at 23400
      // b2Trigger=32400 (9h worked). After break1 elapsed, workedElapsed=21600.
      // Need now such that workedElapsed crosses 32400: now = 32400 + 1800 (break2) + 21600 work... 
      // Simpler: now = 34201 (1s past 9h30m wall). workedGross = 34201.
      // break1 elapsed (23400 <= 34201), break2 live at trigger 32400, ends 33300.
      // But 34201 > 33300 → break2 also elapsed. Use now = 32500 to get live break2.
      const r = recompute([{ in: 0 }], S, 32500)
      expect(r.breakState).toBe('break2')
      expect(r.breakEndsAtMs).toBeDefined()
      // segments: work[0..21600], mandatory-break1[21600..23400], work[23400..32400], mandatory-break2[32400..33300], work[33300..32500] (clamped/empty)
    })
    ```
    (Work out the exact `nowSec` and segment expectations during
    implementation; the key assertion is `breakState === 'break2'` after
    break1 has elapsed.)
  - **Add** break2 never fires before break1 is done:
    ```
    it('break2 does not fire before break1 is satisfied', () => {
      // disable break1, enable break2 — but ADR-023 cascade means break2 is
      // also disabled when break1 is off. Instead: keep both enabled, now
      // past b2Trigger but NOT past b1Trigger+break1Dur (impossible since
      // b2Trigger > b1Trigger). The realistic test: now between b1Trigger
      // and b1Trigger+break1Dur → break1 is live, break2 not evaluated.
      const r = recompute([{ in: 0 }], S, 22000)
      expect(r.breakState).toBe('break1')
      // no break2 segment
      expect(r.segments.filter(s => s.type === 'mandatory-break' && s.breakIndex === 1)).toHaveLength(0)
    })
    ```
  - **Rewrite** the aggregate-gap tests (lines 94-129) to per-gap semantics:
    - "gap > break1_duration satisfies break1, no mandatory break1":
      use a gap of 2400s (> 1800). Assert no `mandatory-break` with
      `breakIndex: 0`, `gapBreakSeconds` includes 1800, the remaining 600s
      is neither work nor break (so `workedSeconds + breakSeconds <
      workedGross + gap`... actually `workedSeconds = workedGross -
      breakSeconds` and the 600s is simply not in `workedGross`).
    - "gap > break1_duration + break2_duration satisfies both": gap of 3000s
      (> 2700). Assert no mandatory breaks at all, `gapBreakSeconds === 2700`.
    - "short gap <= break1_duration does not satisfy break1": gap of 1800s
      (== break1_duration, so NOT > → does not satisfy). Assert mandatory
      break1 IS injected, `gapBreakSeconds === 0`.
    - "two gaps, first satisfies break1, second satisfies break2": gap1 2400s
      (> 1800), gap2 1200s (> 900). Assert no mandatory breaks,
      `gapBreakSeconds === 2700`.
  - **Add** late-long-gap test:
    ```
    it('late long gap removes mandatory break1 (recompute is stateless)', () => {
      // First scenario: no gap, break1 fires as mandatory.
      const r1 = recompute([{ in: 0, out: 21600 }, { in: 23400 }], S, 23400)
      expect(r1.segments.some(s => s.type === 'mandatory-break' && s.breakIndex === 0)).toBe(true)
      // Wait — 23400 is exactly break1 end; with the new rule this is "elapsed"
      // not "live". Use now = 22000 for the live case:
      // Actually for the late-long-gap scenario we need: work crosses trigger,
      // then a gap > break1_duration appears. 
      // punches: [{0..21600}, {25200..}] gap = 3600 > 1800 → break1 satisfied by gap.
      const r2 = recompute([{ in: 0, out: 21600 }, { in: 25200 }], S, 25200)
      expect(r2.segments.filter(s => s.type === 'mandatory-break')).toHaveLength(0)
      expect(r2.breakSeconds).toBe(1800)  // only break1 consumed from gap
      // the remaining 1800s of the gap is "clocked out"
    })
    ```
  - **Add** worked-freeze / break-counts-up test for live break:
    ```
    it('workedSeconds frozen at trigger and breakSeconds counts up during live break1', () => {
      // now = 21600 (exactly at trigger)
      let r = recompute([{ in: 0 }], S, 21600)
      expect(r.breakState).toBe('break1')
      expect(r.breakSeconds).toBe(0)
      expect(r.workedSeconds).toBe(21600)

      // now = 22000 (400s into break)
      r = recompute([{ in: 0 }], S, 22000)
      expect(r.breakState).toBe('break1')
      expect(r.breakSeconds).toBe(400)
      expect(r.workedSeconds).toBe(21600)

      // now = 23399 (1s before break end)
      r = recompute([{ in: 0 }], S, 23399)
      expect(r.breakState).toBe('break1')
      expect(r.breakSeconds).toBe(1799)
      expect(r.workedSeconds).toBe(21600)

      // now = 23400 (exactly at break end -> elapsed)
      r = recompute([{ in: 0 }], S, 23400)
      expect(r.breakState).toBe('running')
      expect(r.breakSeconds).toBe(1800)
      expect(r.workedSeconds).toBe(21600)

      // now = 25200 (after break, work resumes)
      r = recompute([{ in: 0 }], S, 25200)
      expect(r.breakState).toBe('running')
      expect(r.breakSeconds).toBe(1800)
      expect(r.workedSeconds).toBe(23400)
    })
    ```
  - **Update** existing live-break tests:
    - "single punch crossing break1_trigger fires mandatory break1" (now=21601):
      `workedSeconds === 21600`, `breakSeconds === 1` (was 19801/1800).
    - "break2 fires after break1 has elapsed (live break2)" (now=61500):
      `workedSeconds === 30600`, `breakSeconds === 2100` (was 30000/2700).
  - **Keep** the existing passing tests that do not encode the old aggregate
    rule (single closed punch, single open punch, two punches with small gap
    no trigger, targetReached, limitReached, segments sorted, negative gap).
    Re-check each against the new semantics and adjust expected values where
    `breakSeconds`/`workedSeconds` math changed.
- **Dependencies:** FX1-T1.
- **Acceptance criteria:** All tests pass; no test encodes the old aggregate
  rule or the "pre-existing limitation"; coverage includes live, elapsed,
  gap-satisfied, short-gap, both-breaks-same-gap, and late-long-gap cases.
- **V&V:** `pnpm test -- src/domain/recompute.test.ts`.
- **Pitfalls:**
  - The exact `nowSec` for break2-live-after-break1-elapsed requires care:
    break1 elapsed at `b1Trigger + break1Dur = 23400`; workedElapsed after
    break1 = `b1Trigger = 21600`; to cross `b2Trigger = 32400` we need
    `21600 + (work after break1) >= 32400` → `work after break1 >= 10800`.
    If the punch is continuous from 0, `now = 23400 + 10800 = 34200` gives
    workedElapsed = 32400 exactly at the trigger. Use `now = 32401` for
    break2-live... but wait, `now = 32401` means `workedGross = 32401`, and
    break1 elapsed consumes 1800s of break, so workedElapsed after break1 =
    `32401 - 1800 = 30601`? No — workedElapsed accumulates only work time,
    not the break. With a single continuous punch, the work after break1 is
    `now - 23400` = `32401 - 23400 = 9001`, so workedElapsed = `21600 + 9001
    = 30601`, which is < 32400. So break2 has NOT fired at now=32401. Need
    `workedElapsed >= 32400` → `21600 + (now - 23400) >= 32400` → `now >=
    34200`. At `now = 34200`, break2 trigger is at 32400 (workedElapsed
    crosses it), break2 ends at 33300, and now=34200 > 33300 → break2 is
    also *elapsed*, not live. To get break2 *live*, the punch must be
    discontinuous or we accept that a single continuous punch can only show
    break2-elapsed (since by the time workedElapsed reaches 32400, wall-clock
    is 34200 which is past break2 end 33300). **This is correct behavior** —
    document it in the test: a single continuous punch shows break2 as
    elapsed (state `running`), not live. For a live break2, the user must
    have a gap that shifts the timeline. Add a test with a gap to exercise
    live break2.
  - Off-by-one at trigger boundaries: the existing code uses `toTrigger <=
    dur` (fires when workedElapsed reaches exactly the trigger). Keep this
    convention. `nowSec >= breakEnd` for elapsed means `nowSec` is at or past
    the end — use `>=` not `>`.
  - Do not assert on `breakEndsAtMs` exact epoch value — it depends on
    `new Date()` at test runtime. Assert it is `toBeDefined()` or
    `toBeUndefined()` and assert the segment `startSec`/`endSec` (which are
    seconds-since-midnight, deterministic).

---

## FX1-T5 — Update `RunningView` and store tests

- **Goal:** Flip the clock-out-during-break UI test and add a store test for
  the `viewState` / `isClockedOut` precedence change.
- **Files:** `src/components/RunningView.test.ts`, `src/stores/clock.test.ts`.
- **Approach:**
  - `RunningView.test.ts:43-54`: rename the test to "shows Clock Out button
    when on break"; assert the button IS rendered when
    `viewState.kind === 'break'`.
  - `clock.test.ts`: add:
    - "clocking out during a break sets viewState to clocked-out": seed a
      live break1 (worked past 6h), call `clockOut()`, assert
      `viewState.kind === 'clocked-out'` and `isClockedIn === false`.
    - "isClockedOut is true after clocking out during a break": assert
      `isClockedOut === true` (after the `isClockedOut` simplification in
      FX1-T3).
    - "clockIn is still blocked during a break": seed a live break1, call
      `clockIn()`, assert no new punch was added (the
      `if (this.isOnBreak) return` guard remains).
- **Dependencies:** FX1-T1, FX1-T3.
- **Acceptance criteria:** All tests pass; no test asserts the old "clock-out
  hidden during break" behavior.
- **V&V:** `pnpm test -- src/components/RunningView.test.ts src/stores/clock.test.ts`.
- **Pitfalls:**
  - Seeding a live break1 in a store test requires advancing the injectable
    clock past `b1Trigger` (21600s = 06:00) but before `b1Trigger + break1Dur`
    (23400s = 06:30). Use the debug API or `setClock` from `src/domain/clock.ts`.
  - The store test must call `init()` and wait for the async persistence
    before asserting; use `fake-indexeddb` (already a devDep).

---

## FX1-T6 — Update `BreakBanner` tests

- **Goal:** Add a test asserting the banner does not render when
  `breakEndsAt <= now`.
- **Files:** `src/components/BreakBanner.test.ts`.
- **Approach:** Add:
```
it('does not render when breakEndsAt <= now', () => {
  // seed store with breakState='break1', breakEndsAt = now (or now - 1)
  // assert banner is not in DOM
})
```
Keep the existing "renders with countdown" test; add the negative case.
- **Dependencies:** FX1-T2.
- **Acceptance criteria:** Both the render and no-render cases pass.
- **V&V:** `pnpm test -- src/components/BreakBanner.test.ts`.
- **Pitfalls:** Mount the component with a stubbed store (use `@vue/test-utils`
  `global.plugins` with a Pinia testing instance, or manipulate the real store
  via `setClock` + `init`).

---

## FX1-T7 — Documentation updates

- **Goal:** Update `doc/architecture.md` and `doc/decisions.md` to reflect
  the new semantics. Per `AGENTS.md`: "When a change affects architecture or
  decisions, update the relevant `doc/` file in the same change."
- **Files:** `doc/architecture.md`, `doc/decisions.md`,
  `doc/test-vnv-strategy.md` (if it references clock-out-during-break).
- **Approach:**
  - `doc/architecture.md` "Break derivation algorithm" (lines 96-117):
    rewrite step 3 and step 4 to the per-gap matching rule (a gap counts as a
    break only if `> break.duration`; a single very long gap satisfies both;
    short gaps are "clocked out"; only consumed portions count toward
    `breakSeconds`). Replace the "Aggregate rule" (step 4) entirely. Add a
    note that the mandatory pause is "live" while `nowSec < trigger + dur`
    and "elapsed" otherwise, and that the walk continues after an elapsed
    break so the next break can fire.
  - `doc/architecture.md` "Mandatory breaks — inline banner" (lines 137-143):
    change "Clock-out is **disabled** during a mandatory break" to
    "Clock-out is **allowed** during a mandatory break; it ends the day and
    retains the derived break segment in the timeline." Add: "Once clocked
    out, `viewState` becomes `clocked-out` regardless of any lingering
    derived break state."
  - `doc/decisions.md` ADR-013 (lines 79-83): update the Decision to:
    "While a mandatory break is live, the UI shows an inline banner with an
    MM:SS countdown. When `nowSec >= trigger + duration`, the break auto-
    closes and state reverts to `running`. Clock-out is **allowed** during a
    mandatory break (supersedes the original 'disabled' decision): clocking
    out closes the open punch, ends the day, and retains the derived break
    segment in the timeline." Add a Consequence: "breaks still cannot be
    *skipped* while the user remains clocked in; the only way to end a live
    break early is to clock out, which ends the day."
  - `doc/decisions.md`: add **ADR-027 — Per-gap break classification**
    (supersedes the aggregate part of ADR-022). Context, Decision,
    Consequences mirroring the "New gap/break semantics" section above.
  - `doc/test-vnv-strategy.md`: search for any reference to "clock out
    disabled during break" or the aggregate gap rule; update or remove.
- **Dependencies:** FX1-T1 through FX1-T6.
- **Acceptance criteria:** Docs describe the new algorithm and the allowed-
  clock-out-during-break behavior; no doc contradicts the implemented code.
- **V&V:** Read-through; `grep -ri "clock-out is disabled" doc/` returns
  nothing; `grep -ri "aggregate rule" doc/` returns nothing.
- **Pitfalls:**
  - ADR-022 has both an aggregate-rule part and a gaps-derived part. Only the
    aggregate rule is superseded; the "breaks derived from gaps" principle
    stands. Word ADR-027 carefully.
  - Do not renumber existing ADRs. ADR-027 is the next number (verified
    ADR-026 as the latest in `doc/decisions.md`).

---

## Global V&V (after FX1-T7)

Run the full suite per `AGENTS.md`:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm test`
5. `pnpm preview` + manual PWA checks:
   - Trigger break1 (via debug API `tickTo` past 6h): banner counts down to
     00:00 and disappears; state returns to `running`; timeline shows the
     mandatory-break segment.
   - Continue past 9h worked (accounting for the 30min break): break2 fires.
   - During a live break1, click Clock Out: app switches to `ClockInView`;
     timeline retains the mandatory-break segment.
   - Create a gap > 30min after the 6h trigger: confirm no mandatory break1
     segment appears and worked time includes the trigger-to-gap portion.
   - Create a short gap (<= 30min): confirm mandatory break1 still fires.
   - Confirm offline behavior, timer survives screen lock, entries persist
     after reload (unchanged from prior state).