# Discussion log

This file is the working scratchpad for shaping the Clocked PWA. Once a topic reaches a stable conclusion, lift it into the structured docs in this directory (`idea.md`, `architecture.md`, `decisions.md`, `test-vnv-strategy.md`).

---

## Notes from discussion

### Core flow
- User arrives at work, clocks in at the work terminal, then opens Clocked on the phone to also record the start.
- First open with no entry for "today" shows a **big round red clock-in button** that logs the current time.
- Below it: smaller buttons **+1min / +5min / +10min** to adjust the clock-in time (correction for the delay between terminal clock-in and opening the app).
- Alternatively a **custom time field** that opens the OS time picker dialog.
- Once a time is logged for today, the view switches to the **elapsed-time display**: hours and minutes since clock-in, **minus mandatory breaks**. The app internally counts seconds but only displays `HH:MM`.
- The clock-in time can still be edited after logging. There is also a **reset** action.
- There is an explicit **clock-out** button; clocking in again later the same day resumes the accumulated count (multiple sessions per day, summed).

### Mandatory break rules
- After **6h** of **accumulated worked time** (excluding earlier breaks), the clock stops for a **30 min** mandatory break.
- After **9h** of accumulated worked time, the clock stops again for a **15 min** mandatory break.
- During a break the UI shows a countdown ("Break — 30:00 remaining") and auto-resumes when the break ends.
- Elapsed display = accumulated worked time across all sessions of the day (break durations are excluded by construction — breaks are separate segments).

### Day rollover
- "Today" = local calendar day. No night-shift spanning midnight.
- After midnight, the app resets.
- If the clock-in time is from the previous day, the entry is **deleted and not used** — no carryover, no history.

---

## Resolved questions

1. **Day boundary** — local calendar day, no night shifts. *(Confirmed.)*
2. **History / accumulation** — **no history**. Only today's entry is stored; previous day is deleted at rollover. *(Resolved.)*
3. **Clock-out** — there is an explicit clock-out button. Clocking in again resumes the accumulated count for the same day. Multiple sessions per day. *(Resolved.)*
4. **Break UX** — option (a): timer paused, screen shows "Break — NN:NN remaining", auto-resumes when the break ends. *(Resolved.)*
5. **Break threshold basis** — **accumulated worked time** (excluding earlier breaks), not wall-clock from start. The second break fires after 9h of actual work, i.e. at 9h + 30min of wall-clock if the 30 min break was taken. *(Resolved.)*
6. **Adjustment buttons direction** — `+1min / +5min / +10min` add to worked time by moving the recorded start **earlier** (to the left on the timeline). E.g. pressing +1min decreases `startEpochMs` by 60s, so elapsed grows by 1 min. No matching −min buttons in scope. *(Resolved.)*
7. **Multiple sessions per day** — yes. Accumulated sum across all sessions. *(Resolved.)*
8. **Edit clock-in after the fact** — editing the clock-in time recomputates break eligibility from the new start. *(Resolved.)*
9. **Tamper / audit** — no audit. The app is a personal helper; no separate "true" timestamp is recorded. *(Resolved.)*
10. **Clocked-out account display** — when clocked out, the UI shows the accumulated worked time above the red button with label "Worked today", plus a Reset day button. Fresh clock-in state (no entry) does not show either element. *(Resolved — see ADR-017.)*

## Data model restructuring (2026-07-24)

### Context
The original segment-based model stored work/break segments as epoch-ms with hardcoded thresholds. This made the break logic opaque and prevented configurable break rules or a daily target/limit.

### Decision (moved to ADR-019–025)
- Replace single `entries` store with two stores: `settings` (persistent, configurable) and `worktime` (in/out punches, reset after midnight).
- Breaks are auto-derived from punch gaps + settings, not stored explicitly.
- Thresholds moved from hardcoded constants to configurable settings with enable/disable flags.
- Added injectable clock + always-on debug API.

### Details in architecture.md and plan/08-restructure-storage.md

All settled. New questions get added below as implementation progresses.

---

## Open questions

- (none)