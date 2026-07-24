import { describe, it, expect } from 'vitest'
import { adjustStart, setFirstPunchIn } from './adjust'
import type { Worktime } from './types'

describe('adjustStart', () => {
  it('decreases the first punch in by delta seconds', () => {
    const wt: Worktime = { date: '2026-07-21', punches: [{ in: 28800 }] }
    const r = adjustStart(wt, 300)
    expect(r.punches[0].in).toBe(28500)
  })

  it('returns a new object, does not mutate input', () => {
    const wt: Worktime = { date: '2026-07-21', punches: [{ in: 28800 }] }
    Object.freeze(wt)
    Object.freeze(wt.punches[0])
    const r = adjustStart(wt, 60)
    expect(r).not.toBe(wt)
    expect(r.punches[0]).not.toBe(wt.punches[0])
    expect(wt.punches[0].in).toBe(28800)
  })

  it('throws on empty punches', () => {
    const wt: Worktime = { date: '2026-07-21', punches: [] }
    expect(() => adjustStart(wt, 5)).toThrow()
  })
})

describe('setFirstPunchIn', () => {
  it('updates the first punch in', () => {
    const wt: Worktime = { date: '2026-07-21', punches: [{ in: 28800, out: 36000 }] }
    const r = setFirstPunchIn(wt, 25200)
    expect(r.punches[0].in).toBe(25200)
    expect(r.punches[0].out).toBe(36000)
  })

  it('does not mutate input', () => {
    const wt: Worktime = { date: '2026-07-21', punches: [{ in: 28800 }] }
    Object.freeze(wt)
    Object.freeze(wt.punches[0])
    const r = setFirstPunchIn(wt, 25200)
    expect(r.punches[0].in).toBe(25200)
    expect(wt.punches[0].in).toBe(28800)
  })

  it('throws on empty punches', () => {
    const wt: Worktime = { date: '2026-07-21', punches: [] }
    expect(() => setFirstPunchIn(wt, 0)).toThrow()
  })
})
