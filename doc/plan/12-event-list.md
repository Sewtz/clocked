# WP12 — Event-list punch model (add/delete events, faulty days)

**Status:** implemented (T1–T8); manual V&V (T9, #14) pending · **Epic:** [#5](https://github.com/Sewtz/clocked/issues/5) · **Branch:** `feat/delete-punches`

The detailed task specs (goal, files, approach, acceptance criteria, V&V, pitfalls) live in the GitHub issues. This file keeps the context and decisions so they stay in the repo; see the issues for the task details.

## Context

Clocking events can't be deleted. Deleting one event can leave a faulty sequence (e.g. `in, in, out`), which the pair-based model `punches: Array<{ in, out? }>` can't hold: an `out` without an `in` isn't storable at all.

## Decisions (become ADR-036…039 in T8; ADR-035 is the #15 fix)

- A day is stored as a **flat, time-sorted list of events** `{ type: 'in' | 'out'; t }` (seconds since midnight). Stored order breaks ties at the same time.
- Validity is **derived**: a sequence must start with `in` and alternate. A trailing `in` (still clocked in) is valid only for today.
- **Faulty days are saved and flagged.** They get no worked-time or break calculation and no clock-in/out until the user fixes them.
- Events can be **added and deleted**. **Past days** are editable from the calendar, including empty ones; future days are not.
- `recompute()` is **unchanged**. It only receives the pairs derived from a valid day.
- Stored data moves from `punches` to `events` in a **DB v3 → v4 upgrade** (both `worktime` and `history`).

## Target model

```ts
type PunchEvent = { type: 'in' | 'out'; t: number }
interface Worktime { date: string; events: PunchEvent[] }
type Analysis =
  | { status: 'valid'; punches: Array<{ in: number; out?: number }>; open: boolean }
  | { status: 'faulty'; issues: Array<{ index: number; kind: 'starts-with-out' | 'double-in' | 'double-out' | 'open-past-day' | 'unsorted' }> }
```

## Tasks (strict order)

| Task | Issue | Depends on |
| --- | --- | --- |
| T1 — Domain: `PunchEvent`, `analyse()`, conversions | [#6](https://github.com/Sewtz/clocked/issues/6) | — |
| T2 — Storage: DB v4 migration punches → events | [#7](https://github.com/Sewtz/clocked/issues/7) | T1 |
| T3 — Store: event-based actions, faulty state, edit any day | [#8](https://github.com/Sewtz/clocked/issues/8) | T1, T2 |
| T4 — Debug API: `setEvents` / `setHistoryDay` | [#9](https://github.com/Sewtz/clocked/issues/9) | T3 |
| T5 — Day editor dialog: add / delete, faulty highlight | [#10](https://github.com/Sewtz/clocked/issues/10) | T3 |
| T6 — Main view: faulty state + Timeline hardening | [#11](https://github.com/Sewtz/clocked/issues/11) | T3, T5 |
| T7 — Calendar: faulty marker + edit past days | [#12](https://github.com/Sewtz/clocked/issues/12) | T3, T5 |
| T8 — Docs: ADRs, architecture, idea, V&V strategy | [#13](https://github.com/Sewtz/clocked/issues/13) | T1–T7 |
| T9 — Manual V&V | [#14](https://github.com/Sewtz/clocked/issues/14) | all |

Workflow: one commit per task referencing its issue (`feat: … (#6)`); one PR at the end that closes #5–#14. Run `pnpm lint && pnpm typecheck && pnpm build && pnpm test` after every task. Between T1 and T3 the build may be red, because callers still read `punches`.
