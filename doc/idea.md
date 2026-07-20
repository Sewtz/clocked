# Idea

## Product intent

Clocked is a single-purpose PWA that mirrors a manual clock-in at a workplace terminal: the user arrives, clocks in at the work terminal, then opens Clocked on their phone to record the same start time locally. From that point the app shows how long they have been at work, accounting for mandatory breaks, until the day resets at midnight. The user can clock out for personal errands and clock back in; the app accumulates worked time across all sessions of the day.

## Primary user

A single worker who already uses a physical / terminal-based clock-in system and wants a personal, on-device timer that:

- starts from the same moment as the terminal clock-in,
- counts the time they are on the clock across multiple sessions per day,
- automatically subtracts the mandatory breaks required by their workplace,
- needs no account, no network, no backend.

## Jobs to be done

- "When I clock in at work, I want to also start my personal timer so I can see how long my shift is."
- "I want to correct the start time by a few minutes without typing, because I opened the app a little after the real clock-in."
- "I want to clock out for an errand and back in, and have the app keep the accumulated worked time."
- "I want to see worked time **excluding** mandatory breaks, in hours and minutes, updated live."
- "I want the app to handle the mandatory break rules for me so I don't have to track them, including a clear 'on break — resumes in NN:NN' state."
- "I want the day to reset automatically after midnight, so yesterday does not bleed into today."

## Scope (in)

- One entry per local calendar day with one or more work sessions.
- Clock-in (big red button) + adjustment buttons (+1 / +5 / +10 min, moving the start earlier) + custom time via OS picker.
- Clock-out and clock-back-in; worked time accumulated across sessions.
- Live elapsed display (internally seconds/ms, displayed `HH:MM`).
- Mandatory break logic, based on **accumulated worked time**:
  - 30 min break after 6h worked,
  - 15 min break after 9h worked.
- Break overlay: countdown + auto-resume.
- Edit clock-in time after logging (recomputes break eligibility from the new start).
- Reset.
- Automatic midnight reset; previous day's entry is discarded.
- Fully local, installable on Android and iOS, offline-capable.

## Scope (out, for now)

- Any history beyond today. Past days are deleted at midnight rollover.
- Export / import of entries.
- Multi-user / shared data.
- Any backend, sync, or network dependency.
- Night-shift / shift spanning midnight.
- Manual "−" adjustment buttons (only `+1 / +5 / +10 min`).
- Tamper-evidence / audit log.

## Success criteria

- Installable on Android and iOS, runs in airplane mode after first install.
- Timer keeps correct accumulated worked time across screen lock (computed from stored segment timestamps, not a live tick).
- Mandatory breaks applied automatically on accumulated worked time and reflected in the displayed time, with a clear break overlay.
- Clock-out + clock-back-in produces correct accumulated worked time.
- After midnight, the previous entry is gone and the clock-in button is back.
