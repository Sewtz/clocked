import { describe, it, expect } from 'vitest'
import { adjustOpenWorkSegmentStart, setFirstWorkSegmentStart } from './adjust'
import type { Segment } from './types'

describe('adjustOpenWorkSegmentStart', () => {
  it('decreases the open work segment start by N minutes', () => {
    const segs: Segment[] = [{ type: 'work', start: 10_000 }]
    const r = adjustOpenWorkSegmentStart(segs, 5)
    expect(r[0].start).toBe(10_000 - 5 * 60_000)
  })

  it('returns a new array, does not mutate input', () => {
    const segs: Segment[] = [{ type: 'work', start: 10_000 }]
    Object.freeze(segs)
    Object.freeze(segs[0])
    const r = adjustOpenWorkSegmentStart(segs, 1)
    expect(r).not.toBe(segs)
    expect(r[0]).not.toBe(segs[0])
  })

  it('throws when the last segment is a closed work segment', () => {
    const segs: Segment[] = [{ type: 'work', start: 10_000, end: 20_000 }]
    expect(() => adjustOpenWorkSegmentStart(segs, 5)).toThrow()
  })

  it('throws when the last segment is a break', () => {
    const segs: Segment[] = [
      { type: 'work', start: 0, end: 10_000 },
      { type: 'break', start: 10_000, duration: 30 },
    ]
    expect(() => adjustOpenWorkSegmentStart(segs, 5)).toThrow()
  })

  it('throws on empty array', () => {
    expect(() => adjustOpenWorkSegmentStart([], 5)).toThrow()
  })
})

describe('setFirstWorkSegmentStart', () => {
  it('updates the first segment start', () => {
    const segs: Segment[] = [
      { type: 'work', start: 10_000 },
      { type: 'break', start: 20_000, duration: 30 },
      { type: 'work', start: 50_000 },
    ]
    const r = setFirstWorkSegmentStart(segs, 5000)
    expect(r[0].start).toBe(5000)
    expect(r[1]).toBe(segs[1])
    expect(r[2]).toBe(segs[2])
  })

  it('throws when first segment is a break', () => {
    const segs: Segment[] = [{ type: 'break', start: 10_000, duration: 30 }]
    expect(() => setFirstWorkSegmentStart(segs, 5000)).toThrow()
  })

  it('does not mutate input', () => {
    const segs: Segment[] = [{ type: 'work', start: 10_000 }]
    Object.freeze(segs)
    Object.freeze(segs[0])
    const r = setFirstWorkSegmentStart(segs, 5000)
    expect(r[0]).not.toBe(segs[0])
    expect(segs[0].start).toBe(10_000)
  })
})
