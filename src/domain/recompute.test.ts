import { describe, it, expect } from 'vitest'
import { recompute } from './recompute'
import { DEFAULT_SETTINGS } from './types'

const S = DEFAULT_SETTINGS

describe('recompute', () => {
  it('empty punches returns zeroes and empty segments', () => {
    const r = recompute([], S, 0)
    expect(r.workedSeconds).toBe(0)
    expect(r.breakSeconds).toBe(0)
    expect(r.segments).toEqual([])
    expect(r.breakState).toBe('running')
    expect(r.targetReached).toBe(false)
    expect(r.limitReached).toBe(false)
  })

  it('single closed punch, no break', () => {
    const r = recompute([{ in: 0, out: 3600 }], S, 3600)
    expect(r.workedSeconds).toBe(3600)
    expect(r.breakSeconds).toBe(0)
    expect(r.breakState).toBe('running')
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0]).toEqual({ type: 'work', startSec: 0, endSec: 3600 })
  })

  it('single open punch, counted up to nowSec', () => {
    const r = recompute([{ in: 0 }], S, 7200)
    expect(r.workedSeconds).toBe(7200)
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0]).toEqual({ type: 'work', startSec: 0, endSec: 7200 })
  })

  it('two punches with gap produces gap-break segment; no trigger crossed', () => {
    // Both punches total 6600s gross, with a 600s gap. 1.83h < 6h trigger.
    // total gaps (600) < totalRequired (2700), so mandatoryPauseSeconds = 2100.
    // No trigger crossed, so no mandatory breaks added.
    // breakSeconds = 600 + (2700 - 600 - 2100) = 600
    // workedSeconds = 6600 - 600 = 6000
    const r = recompute([
      { in: 0, out: 3600 },
      { in: 4200, out: 7200 },
    ], S, 7200)
    expect(r.workedSeconds).toBe(6000)
    expect(r.breakSeconds).toBe(600)
    const segs = r.segments
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({ type: 'work', startSec: 0, endSec: 3600 })
    expect(segs[1]).toEqual({ type: 'gap-break', startSec: 3600, endSec: 4200 })
    expect(segs[2]).toEqual({ type: 'work', startSec: 4200, endSec: 7200 })
  })

  it('single punch crossing break1_trigger fires mandatory break1', () => {
    // punch [0..21601], now at 21601 (1s past 6h trigger)
    // workedGross = 21601
    // mandatoryPauseSeconds = 2700 (totalRequired, no gaps)
    // break1 fires at triggerSec=21600, mandatory1=min(2700,1800)=1800
    // breakSeconds = 0 + (2700 - 0 - 900) = 1800
    // workedSeconds = 21601 - 1800 = 19801
    const r = recompute([{ in: 0 }], S, 21601)
    expect(r.breakState).toBe('break1')
    expect(r.breakEndsAtMs).toBeDefined()
    expect(r.workedSeconds).toBe(19801)

    const segs = r.segments
    expect(segs.some(s => s.type === 'mandatory-break')).toBe(true)
    const mb = segs.find(s => s.type === 'mandatory-break')!
    expect(mb.breakIndex).toBe(0)
    expect(mb.startSec).toBe(21600)
    expect(mb.endSec).toBe(23400)
    const pre = segs.find(s => s.type === 'work' && s.startSec === 0)!
    expect(pre.endSec).toBe(21600)
  })

  it('during break1 (now between trigger and trigger+duration)', () => {
    const r = recompute([{ in: 0 }], S, 22000)
    expect(r.breakState).toBe('break1')
    expect(r.breakEndsAtMs).toBeDefined()
    const mb = r.segments.find(s => s.type === 'mandatory-break')!
    expect(mb.startSec).toBe(21600)
    expect(mb.endSec).toBe(23400)
  })

  it('after break1 ends, algorithm returns break1 state (pre-existing limitation)', () => {
    const r = recompute([{ in: 0 }], S, 25200)
    expect(r.breakState).toBe('break1')
    expect(r.breakSeconds).toBe(1800)
    expect(r.workedSeconds).toBe(23400)
    const mb = r.segments.find(s => s.type === 'mandatory-break')!
    expect(mb.startSec).toBe(21600)
    expect(mb.endSec).toBe(23400)
  })

  it('gap covers break1 + break2, no mandatory pauses', () => {
    // Punch [0..21600] closed, then gap 21600..25200 (3600s), then open punch at 25200.
    // Gap = 3600 >= totalRequired = 2700. So NO mandatory breaks.
    // On walk: break1 fires at p1 end (consumed=21600). mandatory1=min(0,1800)=0.
    //   No mandatory pause for break1.
    // breakSeconds = 3600 + (2700 - 3600 - 0) = 2700
    // workedSeconds = 21600 - 2700 = 18900
    const r = recompute([
      { in: 0, out: 21600 },
      { in: 25200 },
    ], S, 25200)
    expect(r.breakState).not.toBe('break1')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(2700)
    expect(r.workedSeconds).toBe(18900)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
    const gbs = r.segments.filter(s => s.type === 'gap-break')
    expect(gbs).toHaveLength(1)
    expect(gbs[0]).toEqual({ type: 'gap-break', startSec: 21600, endSec: 25200 })
  })

  it('total gaps >= combined break durations, no mandatory pauses', () => {
    // Two gaps totalling 5800s > 2700
    const r = recompute([
      { in: 0, out: 20000 },
      { in: 22800, out: 24000 },
      { in: 27000, out: 36000 },
    ], S, 36000)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
    const gbs = r.segments.filter(s => s.type === 'gap-break')
    expect(gbs.length).toBeGreaterThanOrEqual(2)
  })

  it('break1 disabled, no breaks at all', () => {
    const s = { ...S, break1_enabled: false }
    const r = recompute([{ in: 0 }], s, 43200)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(0)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
  })

  it('gap covers break1_duration, break2 not yet triggered', () => {
    // Punch [0..21600], gap 21600..22500 (900s = break1_duration/2? no — break1_duration=1800)
    // Let me use a gap of exactly 1800, break1 uses it fully. Then second punch open at 23400.
    // totalGaps = 1800 < 2700 → mandatoryPauseSeconds = 900
    // Walk p1: break1 fires at end, mandatory1 = min(900,1800)=900
    //   900s mandatory pause for break1
    // So mandatory-break segment is inserted at triggerSec=21600 for 900s
    const r = recompute([
      { in: 0, out: 21600 },
      { in: 23400 },
    ], S, 23400)
    expect(r.breakState).toBe('break1')
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(1)
    expect(mbs[0].breakIndex).toBe(0)
  })

  it('targetReached true when workedSeconds >= daily_target', () => {
    // 8h target. With mandatory break of 30min, need gross = 8h + 30min = 30600.
    const r = recompute([{ in: 0, out: 30600 }], S, 30600)
    expect(r.targetReached).toBe(true)
  })

  it('limitReached true when workedSeconds >= daily_limit', () => {
    // 10h limit. With 30min break, need gross = 10h + 30min = 37800.
    const r = recompute([{ in: 0, out: 37800 }], S, 37800)
    expect(r.limitReached).toBe(true)
  })

  it('segments are sorted by startSec', () => {
    const r = recompute([
      { in: 28800, out: 36000 },
      { in: 0, out: 21600 },
    ], S, 36000)
    for (let i = 1; i < r.segments.length; i++) {
      expect(r.segments[i].startSec).toBeGreaterThanOrEqual(r.segments[i - 1].startSec)
    }
  })

  it('negative gap does not produce gap-break segment', () => {
    const r = recompute([{ in: 3600, out: 1800 }], S, 3600)
    expect(r.workedSeconds).toBe(0)
    expect(r.segments.filter(s => s.type === 'gap-break')).toHaveLength(0)
  })
})
