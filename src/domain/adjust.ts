import type { Worktime } from './types'

export const ADJUSTMENTS = [1, 5, 10] as const
export type AdjustmentMinutes = (typeof ADJUSTMENTS)[number]

export function adjustStart(worktime: Worktime, deltaSeconds: number): Worktime {
  if (worktime.punches.length === 0) throw new Error('No punches to adjust')
  const first = worktime.punches[0]
  return { ...worktime, punches: [{ ...first, in: first.in - deltaSeconds }, ...worktime.punches.slice(1)] }
}

export function setFirstPunchIn(worktime: Worktime, newIn: number): Worktime {
  if (worktime.punches.length === 0) throw new Error('No punches to adjust')
  const first = worktime.punches[0]
  return { ...worktime, punches: [{ ...first, in: newIn }, ...worktime.punches.slice(1)] }
}
