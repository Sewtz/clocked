# Idea

## Product intent

Clocked is a single-purpose PWA that mirrors a manual clock-in at a workplace terminal: the user arrives, clocks in at the work terminal, then opens Clocked on their phone to record the same start time locally. From that point the app shows how long they have been at work, accounting for mandatory breaks, until the day resets at midnight.

## Primary user

A single worker who already uses a physical / terminal-based clock-in system and wants a personal, on-device timer that:

- starts from the same moment as the terminal clock-in,
- counts the time they have been on the clock,
- automatically subtracts the mandatory breaks required by their workplace,
- needs no account, no network, no backend.

## Jobs to be done

- "When I clock in at work, I want to also start my personal timer so I can see how long my shift is."
- "I want to correct the start time by a few minutes without typing, because I opened the app a little after the real clock-in."
- "I want to see worked time **excluding** mandatory breaks, in hours and minutes, updated live."
- "I want the app to handle the mandatory break rules for me so I don't have to track them."
- "I want the day to reset automatically after midnight, so yesterday does not bleed into today."

## Scope (in)

- One clock-in per day, adjustable via quick buttons or OS time picker.
- Live elapsed display (internally seconds, displayed `HH:MM`).
- Mandatory break logic:
  - 30 min break after 6h of worked time,
  - 15 min break after 9h of worked time.
- Elapsed display **minus** mandatory breaks.
- Edit clock-in time after logging.
- Reset.
- Automatic midnight reset; previous day's entry is discarded.
- Fully local, installable on Android and iOS, offline-capable.

## Scope (out, for now)

- Historical storage beyond "today" (pending decision — see `discussion.md`).
- Manual clock-out / multiple sessions per day (pending — see `discussion.md`).
- Export / import of entries.
- Multi-user / shared data.
- Any backend, sync, or network dependency.

## Success criteria

- Installable on Android and iOS, runs in airplane mode after first install.
- Timer keeps correct elapsed time across screen lock (computed from stored start timestamp, not a live tick).
- Mandatory breaks applied automatically and reflected in the displayed time.
- After midnight, the previous entry is gone and the clock-in button is back.
