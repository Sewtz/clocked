import { describe, it, expect } from 'vitest'
import {
  recomputeBreaks,
  SIX_HOURS_MS,
  NINE_HOURS_MS,
  BREAK_30_MS,
  BREAK_15_MS,
} from './recomputeBreaks'
import type { Segment } from './types'

describe('recomputeBreaks', () => {
  it('empty segments → running, 0 worked', () => {
    const r = recomputeBreaks([], 1000)
    expect(r.state).toBe('running')
    expect(r.workedMs).toBe(0)
    expect(r.segments).toHaveLength(0)
  })

  it('single work segment, 1h in → running, 1h worked', () => {
    const segs: Segment[] = [{ type: 'work', start: 0 }]
    const r = recomputeBreaks(segs, 3600_000)
    expect(r.state).toBe('running')
    expect(r.workedMs).toBe(3600_000)
    expect(r.displayMs).toBe(3600_000)
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0]).toMatchObject({ type: 'work', start: 0 })
    expect(r.segments[0].end).toBeUndefined()
  })

  describe('30 min break at 6h', () => {
    it('fires break when worked time crosses 6h', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + 1
      const r = recomputeBreaks(segs, now)
      expect(r.state).toBe('break30')
      expect(r.workedMs).toBe(SIX_HOURS_MS)
      expect(r.breakEndsAt).toBe(SIX_HOURS_MS + BREAK_30_MS)
      expect(r.segments).toHaveLength(2)
      expect(r.segments[0]).toMatchObject({ type: 'work', start: 0, end: SIX_HOURS_MS })
      expect(r.segments[1]).toMatchObject({ type: 'break', start: SIX_HOURS_MS, duration: 30 })
      expect(r.segments[1].end).toBeUndefined()
    })

    it('during the 30 break, state stays break30 and workedMs frozen', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + 10 * 60_000 // 10 min into break
      const r = recomputeBreaks(segs, now)
      expect(r.state).toBe('break30')
      expect(r.workedMs).toBe(SIX_HOURS_MS)
      expect(r.breakEndsAt).toBe(SIX_HOURS_MS + BREAK_30_MS)
    })

    it('closes break and resumes after 30 min', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + BREAK_30_MS + 60_000 // 1 min after break ends
      const r = recomputeBreaks(segs, now)
      expect(r.state).toBe('running')
      expect(r.workedMs).toBe(SIX_HOURS_MS + 60_000)
      expect(r.segments).toHaveLength(3)
      expect(r.segments[1]).toMatchObject({ type: 'break', start: SIX_HOURS_MS, end: SIX_HOURS_MS + BREAK_30_MS, duration: 30 })
      expect(r.segments[2]).toMatchObject({ type: 'work', start: SIX_HOURS_MS + BREAK_30_MS })
      expect(r.segments[2].end).toBeUndefined()
    })

    it('firing break at exactly 6h removes the crossing instant from work segment', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + BREAK_30_MS
      const r = recomputeBreaks(segs, now)
      // Work segment should end at SIX_HOURS_MS, break covers exactly SIX_HOURS_MS to SIX_HOURS_MS + BREAK_30_MS
      // No resumed work yet since now == break end (not past it)
      expect(r.segments[0]).toMatchObject({ type: 'work', start: 0, end: SIX_HOURS_MS })
      expect(r.segments[1]).toMatchObject({ type: 'break', start: SIX_HOURS_MS, end: SIX_HOURS_MS + BREAK_30_MS, duration: 30 })
      expect(r.segments).toHaveLength(2)
    })
  })

  describe('15 min break at 9h', () => {
    it('fires 15 break when worked time reaches 9h after 30 break', () => {
      // Timeline: work 6h → 30min break → work 3h → 15min break
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const workAfter30Break = SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + 1
      const now = workAfter30Break
      const r = recomputeBreaks(segs, now)
      expect(r.state).toBe('break15')
      expect(r.workedMs).toBe(NINE_HOURS_MS)
      expect(r.breakEndsAt).toBe(
        SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS,
      )
      expect(r.segments).toHaveLength(4)
      expect(r.segments[0]).toMatchObject({ type: 'work', start: 0, end: SIX_HOURS_MS })
      expect(r.segments[1]).toMatchObject({ type: 'break', start: SIX_HOURS_MS, end: SIX_HOURS_MS + BREAK_30_MS, duration: 30 })
      expect(r.segments[2]).toMatchObject({ type: 'work', start: SIX_HOURS_MS + BREAK_30_MS, end: SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 })
      expect(r.segments[3]).toMatchObject({ type: 'break', start: SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000, duration: 15 })
    })

    it('closes 15 break and resumes after 15 min', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS + 60_000
      const r = recomputeBreaks(segs, now)
      expect(r.state).toBe('running')
      expect(r.workedMs).toBe(NINE_HOURS_MS + 60_000)
    })
  })

  describe('multiple work sessions', () => {
    it('accumulates worked time across sessions', () => {
      // Sessions: 2h + 2.5h + ongoing (3h) = 7.5h potential; 30 break fires at 6h
      // After 6h, 30 min break → then 1h resumed work → total worked = 7h
      const segs: Segment[] = [
        { type: 'work', start: 0, end: 7200_000 },              // 2h
        { type: 'work', start: 9000_000, end: 18000_000 },      // 2.5h (acc 4.5h)
        { type: 'work', start: 20000_000 },                     // ongoing
      ]
      const now = 20000_000 + 3 * 3600_000 // 3h of wall-clock in the last session
      const r = recomputeBreaks(segs, now)
      // 4.5h pre-break + 1.5h to reach 6h + 30min break + 1h after = 7h worked
      expect(r.workedMs).toBe(7 * 3600_000)
      expect(r.state).toBe('running') // break already closed
    })

    it('15 break fires when accumulated worked time reaches 9h across sessions', () => {
      const segs: Segment[] = [
        { type: 'work', start: 0, end: 7200_000 },             // 2h
        { type: 'work', start: 9000_000, end: 18000_000 },     // 2.5h (acc 4.5h)
        { type: 'work', start: 20000_000 },                    // ongoing
      ]
      // Need 9h of work: 2h + 2.5h = 4.5h, need 4.5h more, plus 30min + 15min breaks
      const now = 20000_000 + 4.5 * 3600_000 + BREAK_30_MS + BREAK_15_MS + 60_000
      const r = recomputeBreaks(segs, now)
      const breaks = r.segments.filter((s): s is Extract<typeof s, { type: 'break' }> => s.type === 'break')
      expect(breaks).toHaveLength(2)
      expect(breaks[0].duration).toBe(30)
      expect(breaks[1].duration).toBe(15)
    })
  })

  describe('editing clock-in (start mutations)', () => {
    it('moving start earlier may fire a break', () => {
      const segs: Segment[] = [{ type: 'work', start: -(SIX_HOURS_MS + 1) }]
      const r = recomputeBreaks(segs, 0)
      expect(r.state).toBe('break30')
    })

    it('moving start later may unfire a break', () => {
      // Worked only 5h, no break should exist
      const segs: Segment[] = [{ type: 'work', start: -(5 * 3600_000) }]
      const r = recomputeBreaks(segs, 0)
      expect(r.state).toBe('running')
      expect(r.segments).toHaveLength(1)
    })
  })

  describe('idempotency', () => {
    it('running recomputeBreaks twice on its own output yields the same result', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS + 120_000

      const first = recomputeBreaks(segs, now)
      const second = recomputeBreaks(first.segments, now)

      expect(second.segments).toEqual(first.segments)
      expect(second.state).toBe(first.state)
      expect(second.workedMs).toBe(first.workedMs)
      expect(second.breakEndsAt).toBe(first.breakEndsAt)
    })
  })

  describe('no mutation', () => {
    it('does not modify the input segment array or its objects', () => {
      const segs: Segment[] = [
        { type: 'work', start: 0, end: 3600_000 },
        { type: 'work', start: 7200_000 },
      ]
      const frozen = JSON.stringify(segs)
      recomputeBreaks(segs, 10000_000)
      expect(JSON.stringify(segs)).toBe(frozen)
    })
  })

  describe('breaks fire exactly once each', () => {
    it('only one 30 break per day regardless of sessions', () => {
      const segs: Segment[] = [
        { type: 'work', start: 0, end: SIX_HOURS_MS + BREAK_30_MS + 3600_000 },
      ]
      const now = SIX_HOURS_MS + BREAK_30_MS + 3600_000 + 60_000
      const r = recomputeBreaks(segs, now)
      const breakSegs = r.segments.filter((s) => s.type === 'break')
      expect(breakSegs.length).toBe(1)
      expect(breakSegs[0].duration).toBe(30)
    })

    it('only one 15 break per day', () => {
      const segs: Segment[] = [{ type: 'work', start: 0 }]
      const now = SIX_HOURS_MS + BREAK_30_MS + 3 * 3600_000 + BREAK_15_MS + 5 * 3600_000
      const r = recomputeBreaks(segs, now)
      const breakSegs = r.segments.filter((s) => s.type === 'break')
      expect(breakSegs.length).toBe(2)
      expect(breakSegs[0].duration).toBe(30)
      expect(breakSegs[1].duration).toBe(15)
    })
  })

  describe('implicit work after break', () => {
    it('handles persisted open break that has since elapsed', () => {
      const breakStart = 1000
      const segs: Segment[] = [
        { type: 'work', start: 0, end: 500 },
        { type: 'break', start: breakStart, duration: 30 },
      ]
      const breakEnd = breakStart + BREAK_30_MS
      const now = breakEnd + 2000
      const r = recomputeBreaks(segs, now)
      // Should have closed break + implicit work after it
      expect(r.segments.length).toBe(3)
      expect(r.segments[1]).toMatchObject({ type: 'break', start: breakStart, end: breakEnd, duration: 30 })
      expect(r.segments[2]).toMatchObject({ type: 'work', start: breakEnd })
      expect(r.segments[2].end).toBeUndefined()
      expect(r.state).toBe('running')
    })
  })

  describe('past-midnight with no work', () => {
    it('handles a break-only segment gracefully', () => {
      const segs: Segment[] = [
        { type: 'work', start: 0, end: SIX_HOURS_MS },
        { type: 'break', start: SIX_HOURS_MS, end: SIX_HOURS_MS + BREAK_30_MS, duration: 30 },
      ]
      const now = SIX_HOURS_MS + BREAK_30_MS + 2000
      const r = recomputeBreaks(segs, now)
      expect(r.segments[2]).toMatchObject({ type: 'work', start: SIX_HOURS_MS + BREAK_30_MS })
      expect(r.segments[2].end).toBeUndefined()
      expect(r.workedMs).toBe(SIX_HOURS_MS + 2000)
    })
  })
})
