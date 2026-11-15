import type { Analysis, AnalysisIssue, Punch, PunchEvent } from './types'

export interface AnalyseOptions {
  /** A trailing `in` (still clocked in) is valid. True only for today. */
  allowOpen: boolean
}

/**
 * Classify an event sequence. Valid = starts with `in` and alternates in/out;
 * a trailing `in` is valid only when `allowOpen`. Does not sort: out-of-order
 * events are reported as `unsorted` rather than silently fixed.
 */
export function analyse(events: readonly PunchEvent[], { allowOpen }: AnalyseOptions): Analysis {
  const issues: AnalysisIssue[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const prev = i > 0 ? events[i - 1] : undefined
    if (prev && ev.t < prev.t) issues.push({ index: i, kind: 'unsorted' })
    if (!prev) {
      if (ev.type === 'out') issues.push({ index: i, kind: 'starts-with-out' })
    } else if (prev.type === ev.type) {
      issues.push({ index: i, kind: ev.type === 'in' ? 'double-in' : 'double-out' })
    }
  }

  const last = events[events.length - 1]
  const open = last?.type === 'in'
  if (open && !allowOpen) issues.push({ index: events.length - 1, kind: 'open-past-day' })

  if (issues.length > 0) return { status: 'faulty', issues }
  return { status: 'valid', punches: pairUp(events), open }
}

/** Pair a valid sequence into punches. Throws if the sequence is not alternating in/out. */
export function eventsToPunches(events: readonly PunchEvent[]): Punch[] {
  const a = analyse(events, { allowOpen: true })
  if (a.status === 'faulty') throw new Error(`Cannot pair faulty event sequence (${a.issues[0].kind})`)
  return a.punches
}

/** Flatten punches into events (used by the v3 -> v4 storage migration). */
export function punchesToEvents(punches: readonly Punch[]): PunchEvent[] {
  const out: PunchEvent[] = []
  for (const p of punches) {
    out.push({ type: 'in', t: p.in })
    if (p.out !== undefined) out.push({ type: 'out', t: p.out })
  }
  return out
}

/** Insert sorted by `t`; on equal `t` the new event goes after existing ones (stable). */
export function insertEvent(events: readonly PunchEvent[], ev: PunchEvent): PunchEvent[] {
  let i = events.length
  while (i > 0 && events[i - 1].t > ev.t) i--
  return [...events.slice(0, i), { ...ev }, ...events.slice(i)]
}

export function removeEvent(events: readonly PunchEvent[], index: number): PunchEvent[] {
  if (index < 0 || index >= events.length) return [...events]
  return [...events.slice(0, index), ...events.slice(index + 1)]
}

function pairUp(events: readonly PunchEvent[]): Punch[] {
  const punches: Punch[] = []
  for (let i = 0; i < events.length; i += 2) {
    const inEv = events[i]
    const outEv = events[i + 1]
    punches.push(outEv ? { in: inEv.t, out: outEv.t } : { in: inEv.t })
  }
  return punches
}
