import type { Worktime } from './types'
import { insertEvent, removeEvent } from './events'

export const ADJUSTMENTS = [1, 5, 10] as const
export type AdjustmentMinutes = (typeof ADJUSTMENTS)[number]

function firstInIndex(worktime: Worktime): number {
  const i = worktime.events.findIndex(e => e.type === 'in')
  if (i < 0) throw new Error('No clock-in event to adjust')
  return i
}

/** Move the first clock-in earlier by `deltaSeconds` (clamped at midnight). */
export function adjustStart(worktime: Worktime, deltaSeconds: number): Worktime {
  const i = firstInIndex(worktime)
  const t = Math.max(0, worktime.events[i].t - deltaSeconds)
  return { ...worktime, events: insertEvent(removeEvent(worktime.events, i), { type: 'in', t }) }
}

/** Set the first clock-in to `newIn`, keeping the list sorted by time. */
export function setFirstPunchIn(worktime: Worktime, newIn: number): Worktime {
  const i = firstInIndex(worktime)
  return { ...worktime, events: insertEvent(removeEvent(worktime.events, i), { type: 'in', t: newIn }) }
}
