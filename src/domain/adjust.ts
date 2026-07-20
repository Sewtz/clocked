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
