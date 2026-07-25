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

  it('two punches with short gap produces gap-break segment; no trigger crossed', () => {
    // Both punches total 6600s gross, with a 600s gap. 1.83h < 6h trigger.
    // gap (600) <= break1_duration (1800) and <= break2_duration (900).
    // So no gap satisfies any break. No trigger crossed (6600 < 21600).
    // gapBreakSeconds = 0, mandatoryBreakSeconds = 0.
    // breakSeconds = 0, workedSeconds = 6600.
    const r = recompute([
      { in: 0, out: 3600 },
      { in: 4200, out: 7200 },
    ], S, 7200)
    expect(r.workedSeconds).toBe(6600)
    expect(r.breakSeconds).toBe(0)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    const segs = r.segments
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({ type: 'work', startSec: 0, endSec: 3600 })
    expect(segs[1]).toEqual({ type: 'gap-break', startSec: 3600, endSec: 4200 })
    expect(segs[2]).toEqual({ type: 'work', startSec: 4200, endSec: 7200 })
  })

  it('single punch crossing break1_trigger fires mandatory break1', () => {
    // punch [0..21601], now at 21601 (1s past 6h trigger)
    // workedGross = 21601
    // No gaps. break1 fires at triggerSec=21600, mandatory1=1800.
    // nowSec (21601) < breakEnd (23400) -> live break1
    // breakSeconds = 1800, workedSeconds = 21601 - 1800 = 19801
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

  it('after break1 ends, state reverts to running', () => {
    const r = recompute([{ in: 0 }], S, 25200)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(1800)
    expect(r.workedSeconds).toBe(23400)
    const mb = r.segments.find(s => s.type === 'mandatory-break')!
    expect(mb.startSec).toBe(21600)
    expect(mb.endSec).toBe(23400)
  })

  it('gap > break1_duration satisfies break1, no mandatory break1', () => {
    // Punch [0..21600] closed, gap 21600..24000 (2400s > 1800), then open punch at 24000.
    // gap (2400) > break1_duration (1800) -> break1 satisfied by gap.
    // Only break1_duration (1800) consumed from gap as breakSeconds.
    // The remaining 600s of gap is "clocked out" (not work, not break).
    // No mandatory break1 inserted. break1Done = true via gap.
    // workedGross = 21600 (first punch) + 0 (second open punch) = 21600.
    // breakSeconds = 1800 (from gap).
    // workedSeconds = 21600 - 1800 = 19800.
    const r = recompute([
      { in: 0, out: 21600 },
      { in: 24000 },
    ], S, 24000)
    expect(r.breakState).not.toBe('break1')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(1800)
    expect(r.workedSeconds).toBe(19800)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
    const gbs = r.segments.filter(s => s.type === 'gap-break')
    expect(gbs).toHaveLength(1)
    expect(gbs[0]).toEqual({ type: 'gap-break', startSec: 21600, endSec: 24000 })
  })

  it('gap > break1_duration + break2_duration satisfies both breaks', () => {
    // Punch [0..21600] closed, gap 21600..24600 (3000s > 1800+900=2700), then open punch.
    // gap > break1_dur + break2_dur -> satisfies both.
    // gapBreakSeconds = 1800 + 900 = 2700.
    // workedGross = 21600.
    // workedSeconds = 21600 - 2700 = 18900.
    const r = recompute([
      { in: 0, out: 21600 },
      { in: 24600 },
    ], S, 24600)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(2700)
    expect(r.workedSeconds).toBe(18900)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
    const gbs = r.segments.filter(s => s.type === 'gap-break')
    expect(gbs).toHaveLength(1)
    expect(gbs[0]).toEqual({ type: 'gap-break', startSec: 21600, endSec: 24600 })
  })

  it('two gaps, first satisfies break1, second satisfies break2', () => {
    // Punch [0..21600], gap 21600..24000 (2400s > 1800) satisfies break1.
    // Punch [24000..30000], gap 30000..31200 (1200s > 900) satisfies break2.
    // gapBreakSeconds = 1800 + 900 = 2700.
    // workedGross = 21600 + 6000 = 27600.
    // workedSeconds = 27600 - 2700 = 24900.
    const r = recompute([
      { in: 0, out: 21600 },
      { in: 24000, out: 30000 },
      { in: 31200 },
    ], S, 31200)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(2700)
    expect(r.workedSeconds).toBe(24900)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
    const gbs = r.segments.filter(s => s.type === 'gap-break')
    expect(gbs).toHaveLength(2)
  })

  it('short gap <= break1_duration does not satisfy break1, mandatory break1 fires', () => {
    // Punch [0..21600], gap 21600..23400 (1800s == break1_duration, not >).
    // gap NOT > break1_duration -> break1 NOT satisfied by gap.
    // Mandatory break1 of full 1800s fires at trigger.
    // nowSec = 23400 (exactly at break1 end). Elapsed, not live.
    // mandatoryBreakSeconds = 1800.
    // workedGross = 21600.
    // workedSeconds = 21600 - 1800 = 19800.
    const r = recompute([
      { in: 0, out: 21600 },
      { in: 23400 },
    ], S, 23400)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(1800)
    expect(r.workedSeconds).toBe(19800)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(1)
    expect(mbs[0].breakIndex).toBe(0)
    expect(mbs[0].startSec).toBe(21600)
    expect(mbs[0].endSec).toBe(23400)
  })

  it('total gaps >= combined break durations, no mandatory pauses', () => {
    // Two gaps totalling 5800s > 2700. But now per-gap matching:
    // gap1: 20000..22800 = 2800 > 2700? No, 2800 > 1800+900=2700 -> satisfies both.
    // Actually gap1 is 2800 > 2700 so it satisfies both break1 and break2.
    // No mandatory breaks.
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
    // With break1 disabled, break2 also disabled per ADR-023 cascade.
    const s = { ...S, break1_enabled: false, break2_enabled: false }
    const r = recompute([{ in: 0 }], s, 43200)
    expect(r.breakState).toBe('running')
    expect(r.breakEndsAtMs).toBeUndefined()
    expect(r.breakSeconds).toBe(0)
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(0)
  })

  it('break2 fires after break1 has elapsed (live break2)', () => {
    // Need a gap after break1 to shift timeline so break2 can be live.
    // Simpler: start punch later so triggers happen at later wall clock.
    // Punch starts at 28800 (08:00), works continuously.
    // b1Trigger=21600 worked -> wall clock = 28800+21600=50400 (14:00). break1End=52200 (14:30).
    // b2Trigger=32400 worked -> wall clock = 28800+32400=61200 (17:00). break2End=62100 (17:15).
    // At wall clock 61500 (17:05), break2 is live.
    // workedGross = 61500 - 28800 = 32700.
    // break1: toTrigger=21600 <= 32700. triggerSec=28800+21600=50400. breakEnd=52200. now=61500 >= 52200 -> elapsed.
    //   mandatoryBreakSeconds=1800. workedElapsed=21600.
    // break2: remainingDur=61500-50400=11100. toTrigger2=10800 <= 11100.
    //   triggerSec=28800+21600+10800=61200. breakEnd2=62100. now=61500 < 62100 -> LIVE break2!
    //   mandatoryBreakSeconds=2700. breakState='break2'.
    // workedSeconds = 32700 - 2700 = 30000.
    const r = recompute([{ in: 28800 }], S, 61500)
    expect(r.breakState).toBe('break2')
    expect(r.breakEndsAtMs).toBeDefined()
    const mbs = r.segments.filter(s => s.type === 'mandatory-break')
    expect(mbs).toHaveLength(2)
    const b1 = mbs.find(s => s.breakIndex === 0)!
    const b2 = mbs.find(s => s.breakIndex === 1)!
    expect(b1.startSec).toBe(50400)
    expect(b1.endSec).toBe(52200)
    expect(b2.startSec).toBe(61200)
    expect(b2.endSec).toBe(62100)
    expect(r.workedSeconds).toBe(30000)
  })

  it('break2 does not fire before break1 is satisfied', () => {
    // now between b1Trigger and b1Trigger+break1Dur -> break1 live, break2 not evaluated.
    const r = recompute([{ in: 0 }], S, 22000)
    expect(r.breakState).toBe('break1')
    expect(r.segments.filter(s => s.type === 'mandatory-break' && s.breakIndex === 1)).toHaveLength(0)
  })

  it('targetReached true when workedSeconds >= daily_target', () => {
    // 8h target. With mandatory break of 30min, need gross = 8h + 30min = 30600.
    const r = recompute([{ in: 0, out: 30600 }], S, 30600)
    expect(r.targetReached).toBe(true)
  })

  it('limitReached true when workedSeconds >= daily_limit', () => {
    // 10h limit. With 30min+15min = 45min breaks, need gross = 10h + 45min = 38700.
    const r = recompute([{ in: 0, out: 38700 }], S, 38700)
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