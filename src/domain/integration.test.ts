import { describe, it, expect } from 'vitest'
import { recomputeBreaks, SIX_HOURS_MS, BREAK_30_MS, BREAK_15_MS } from './recomputeBreaks'
import { adjustOpenWorkSegmentStart } from './adjust'
import { formatHHMM } from './format'
import { todayString, isExpired, localEpochForTodayMs } from './date'
import type { Segment } from './types'

describe('domain integration — full day scenario', () => {
  // Start at 08:00 local: epoch = arbitrary base
  const base = new Date('2026-07-21T08:00:00').getTime()

  it('1. start work at 08:00, work to 14:00 → 30 break fires', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    const at14 = base + SIX_HOURS_MS + 1000 // 14:00:01
    const r = recomputeBreaks(segs, at14)

    expect(r.state).toBe('break30')
    expect(r.workedMs).toBe(SIX_HOURS_MS)
    expect(r.displayMs).toBe(SIX_HOURS_MS)
    expect(r.breakEndsAt).toBe(base + SIX_HOURS_MS + BREAK_30_MS)
    expect(r.segments).toHaveLength(2)
    expect(r.segments[0]).toMatchObject({ type: 'work', start: base, end: base + SIX_HOURS_MS })
    expect(r.segments[1]).toMatchObject({ type: 'break', start: base + SIX_HOURS_MS, duration: 30 })
  })

  it('2. at 14:31, 30 break is closed and work resumed', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    const at1431 = base + SIX_HOURS_MS + BREAK_30_MS + 60_000
    const r = recomputeBreaks(segs, at1431)

    expect(r.state).toBe('running')
    expect(r.workedMs).toBe(SIX_HOURS_MS + 60_000)
    expect(r.segments).toHaveLength(3)
    expect(r.segments[1]).toMatchObject({ type: 'break', start: base + SIX_HOURS_MS, end: base + SIX_HOURS_MS + BREAK_30_MS, duration: 30 })
    expect(r.segments[2]).toMatchObject({ type: 'work', start: base + SIX_HOURS_MS + BREAK_30_MS })
  })

  it('3. work to 17:30 → 15 break fires (9h worked after 30 break)', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    // Work from base until 17:30. Total elapsed: 9h30m (9.5h).
    // 6h work, 30min break, then 3h work = 9h worked at 17:30 wall-clock
    const at1730 = base + SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + 1000
    const r = recomputeBreaks(segs, at1730)

    expect(r.state).toBe('break15')
    expect(r.workedMs).toBe(SIX_HOURS_MS + 3 * 3600_000)
    expect(r.breakEndsAt).toBe(base + SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS)
  })

  it('4. at 17:46, 15 break closed and running', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    const at1746 = base + SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS + 60_000
    const r = recomputeBreaks(segs, at1746)

    expect(r.state).toBe('running')
    expect(r.workedMs).toBe(SIX_HOURS_MS + 3 * 3600_000 + 60_000)
  })

  it('5. clock out at 18:00', () => {
    // Close the current work segment
    const segs: Segment[] = [{ type: 'work', start: base }]
    const at1800 = base + 10 * 3600_000 // 10h after start (incl 30min break = 9.5h worked)
    const r = recomputeBreaks(segs, at1800)
    // Close the last work segment by recording its end
    const closedSegs = [...r.segments.slice(0, -1), { ...r.segments[r.segments.length - 1], end: at1800 }] as Segment[]

    expect(r.state).toBe('running')
    expect(r.workedMs).toBe(SIX_HOURS_MS + 3 * 3600_000 + 15 * 60_000)

    // Clock back in at 19:00
    const at1900 = base + 11 * 3600_000
    const resumedSegs: Segment[] = [...closedSegs, { type: 'work', start: at1900 }]
    const r2 = recomputeBreaks(resumedSegs, at1900 + 5 * 60_000) // 5 min later

    expect(r2.state).toBe('running')
    expect(r2.workedMs).toBe(SIX_HOURS_MS + 3 * 3600_000 + 20 * 60_000)
  })

  it('6. adjust +5min on open segment moves start earlier', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    const adjusted = adjustOpenWorkSegmentStart(segs, 5)
    expect(adjusted[0].start).toBe(base - 5 * 60_000)
  })

  it('7. idempotency: two calls with same segments + now yield same result', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    const now = base + SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS + 5 * 60_000

    const first = recomputeBreaks(segs, now)
    const second = recomputeBreaks(first.segments, now)
    expect(second.segments).toEqual(first.segments)
    expect(second.workedMs).toBe(first.workedMs)
  })

  it('8. date helpers work as expected', () => {
    const d = new Date('2026-07-21T08:00:00')
    expect(todayString(d)).toBe('2026-07-21')
    expect(isExpired('2026-07-20', d)).toBe(true)
    expect(isExpired('2026-07-21', d)).toBe(false)
    const epoch = localEpochForTodayMs(8, 0, d)
    expect(new Date(epoch).getHours()).toBe(8)
    expect(new Date(epoch).getMinutes()).toBe(0)
  })

  it('9. formatHHMM shows expected formatted time', () => {
    expect(formatHHMM(0)).toBe('00:00')
    expect(formatHHMM(SIX_HOURS_MS)).toBe('06:00')
    expect(formatHHMM(SIX_HOURS_MS + BREAK_30_MS)).toBe('06:30')
    expect(formatHHMM(SIX_HOURS_MS + 3 * 3600_000)).toBe('09:00')
  })

  it('10. running recomputeBreaks on persisted canonical segments (with breaks) is stable', () => {
    const segs: Segment[] = [{ type: 'work', start: base }]
    const now = base + SIX_HOURS_MS + BREAK_30_MS + 60_000

    const first = recomputeBreaks(segs, now)
    // Simulate saving and reloading: these are the canonical segments
    const canonical = first.segments

    // Run again with a slightly later now (as if time advanced)
    const later = now + 120_000
    const second = recomputeBreaks(canonical, later)

    // Second call should find the existing break closed, add resumed work
    expect(second.workedMs).toBe(SIX_HOURS_MS + 60_000 + 120_000)
    expect(second.segments).toHaveLength(3)
  })
})
