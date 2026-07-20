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

### Mandatory break rules
- After **6h** of worked time, the clock stops for a **30 min** mandatory break.
- After **9h** of worked time, the clock stops again for a **15 min** mandatory break.
- Elapsed display = worked time minus these mandatory breaks.

### Day rollover
- After midnight, the app resets.
- If the clock-in time is from the previous day, it is **deleted and not used** — no carryover.

---

## Open questions

1. **Day boundary** — "today" / "previous day" means the user's **local calendar day** (midnight in local time), right? No night-shift spanning midnight?
2. **History / accumulation** — midnight deletes the previous day's entry. Does that mean we only ever store **today's** entry, or should past days be retained for later review/export? (Conflicts with "deleted and not used.")
3. **Clock-out** — is there an explicit clock-out action, or does the timer run from clock-in until midnight reset? The description only mentions clock-in + reset.
4. **Break behavior during the break** — when the 30 min / 15 min break kicks in, what should the UI show? Options:
   - a) Timer paused, screen shows "Break — 30:00 remaining", resumes automatically when break ends.
   - b) Timer paused, screen shows worked time frozen, resumes automatically.
   - c) User must tap to resume after the break.
5. **Break threshold basis** — are the 6h / 9h thresholds measured from clock-in (wall-clock) or from **accumulated worked time** (excluding earlier breaks)? E.g. with a 30 min break at 6h, does the second break trigger at 9h worked (= 9:30 wall-clock) or 9h wall-clock from start?
6. **Adjustment buttons direction** — do **+1min / +5min / +10min** move the recorded clock-in **later** (you actually started a bit later than the button press) or do they adjust in either direction? Should there be matching −1min etc.?
7. **Multiple sessions per day** — can the user clock out and back in the same day (e.g. personal errand), or is it a single continuous session per day?
8. **Edit clock-in after the fact** — editing the clock-in time after breaks have already triggered: do we recompute break eligibility from the new start?
9. **Tamper / audit** — earlier constraint was "device clock is user-editable, no tamper-evidence". Does that still hold, given the +min buttons intentionally let the user backdate? Confirm we do **not** record a separate "true" timestamp.
