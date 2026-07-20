import type { Segment, BreakState } from './types'

export const SIX_HOURS_MS = 6 * 3600_000
export const NINE_HOURS_MS = 9 * 3600_000
export const BREAK_30_MS = 30 * 60_000
export const BREAK_15_MS = 15 * 60_000

export interface RecomputeResult {
  segments: Segment[]
  state: BreakState
  workedMs: number
  displayMs: number
  breakEndsAt?: number
}

export function recomputeBreaks(
  segments: Segment[],
  now: number,
): RecomputeResult {
  const out: Segment[] = []
  let workedMs = 0
  let break30Fired = false
  let break15Fired = false
  let breakEndsAt: number | undefined

  function processWork(start: number, rawEnd: number) {
    const end = Math.min(rawEnd, now)
    if (end <= start) return
    let cursor = start
    let remaining = end - cursor

    while (remaining > 0) {
      let threshold: number | null = null
      let is30 = false

      if (!break30Fired) {
        const needed = SIX_HOURS_MS - workedMs
        if (needed > 0 && remaining > needed) {
          threshold = needed
          is30 = true
        }
      }

      if (threshold === null && !break15Fired) {
        const needed = NINE_HOURS_MS - workedMs
        if (needed > 0 && remaining > needed) {
          threshold = needed
          is30 = false
        }
      }

      if (threshold !== null) {
        const workEnd = cursor + threshold
        out.push({ type: 'work', start: cursor, end: workEnd })
        cursor = workEnd
        workedMs += threshold
        remaining -= threshold

        const breakDuration: 30 | 15 = is30 ? 30 : 15
        const breakMs = breakDuration * 60_000
        const bEnd = cursor + breakMs

        if (now >= bEnd) {
          out.push({ type: 'break', start: cursor, end: bEnd, duration: breakDuration })
          if (is30) break30Fired = true
          else break15Fired = true
          cursor = bEnd
          remaining = end - cursor
        } else {
          out.push({ type: 'break', start: cursor, duration: breakDuration })
          if (is30) break30Fired = true
          else break15Fired = true
          breakEndsAt = bEnd
          return
        }
      } else {
        const wEnd = cursor + remaining
        out.push({ type: 'work', start: cursor, end: wEnd })
        workedMs += wEnd - cursor
        return
      }
    }
  }

  for (const seg of segments) {
    if (seg.type === 'work') {
      processWork(seg.start, seg.end ?? now)
    } else {
      if (seg.duration === 30) break30Fired = true
      else break15Fired = true

      if (seg.end !== undefined) {
        out.push(seg)
      } else {
        const bEnd = seg.start + seg.duration * 60_000
        if (now >= bEnd) {
          const closed: Segment = {
            type: 'break', start: seg.start, end: bEnd, duration: seg.duration,
          }
          out.push(closed)
          processWork(bEnd, now)
        } else {
          out.push(seg)
          breakEndsAt = bEnd
        }
      }
    }
  }

  const last = out[out.length - 1]
  if (last?.type === 'break' && last.end !== undefined && now > last.end) {
    processWork(last.end, now)
  }

  const lastSeg = out[out.length - 1]
  if (lastSeg?.type === 'work' && breakEndsAt === undefined) {
    out[out.length - 1] = { type: 'work', start: lastSeg.start }
  }

  const state: BreakState =
    breakEndsAt !== undefined
      ? break30Fired && !break15Fired ? 'break30' : 'break15'
      : 'running'

  return { segments: out, state, workedMs, displayMs: workedMs, breakEndsAt }
}
