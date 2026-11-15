import { describe, it, expect } from 'vitest'
import { adjustStart, setFirstPunchIn } from './adjust'
import type { Worktime } from './types'

const day = (events: Worktime['events']): Worktime => ({ date: '2026-07-21', events })

describe('adjustStart', () => {
  it('moves the first clock-in earlier by delta seconds', () => {
    const r = adjustStart(day([{ type: 'in', t: 28800 }]), 300)
    expect(r.events).toEqual([{ type: 'in', t: 28500 }])
  })

  it('only touches the first clock-in', () => {
    const r = adjustStart(day([
      { type: 'in', t: 28800 }, { type: 'out', t: 36000 }, { type: 'in', t: 40000 },
    ]), 60)
    expect(r.events).toEqual([
      { type: 'in', t: 28740 }, { type: 'out', t: 36000 }, { type: 'in', t: 40000 },
    ])
  })

  it('clamps at midnight', () => {
    expect(adjustStart(day([{ type: 'in', t: 100 }]), 600).events).toEqual([{ type: 'in', t: 0 }])
  })

  it('returns a new object and does not mutate the input', () => {
    const wt = day([{ type: 'in', t: 28800 }])
    Object.freeze(wt)
    Object.freeze(wt.events)
    Object.freeze(wt.events[0])
    const r = adjustStart(wt, 60)
    expect(r).not.toBe(wt)
    expect(wt.events[0].t).toBe(28800)
  })

  it('throws when there is no clock-in', () => {
    expect(() => adjustStart(day([]), 5)).toThrow()
    expect(() => adjustStart(day([{ type: 'out', t: 100 }]), 5)).toThrow()
  })
})

describe('setFirstPunchIn', () => {
  it('updates the first clock-in and keeps the rest', () => {
    const r = setFirstPunchIn(day([{ type: 'in', t: 28800 }, { type: 'out', t: 36000 }]), 25200)
    expect(r.events).toEqual([{ type: 'in', t: 25200 }, { type: 'out', t: 36000 }])
  })

  it('keeps the list sorted when the new time moves past later events', () => {
    const r = setFirstPunchIn(day([{ type: 'in', t: 28800 }, { type: 'out', t: 36000 }]), 40000)
    expect(r.events).toEqual([{ type: 'out', t: 36000 }, { type: 'in', t: 40000 }])
  })

  it('does not mutate the input', () => {
    const wt = day([{ type: 'in', t: 28800 }])
    Object.freeze(wt.events[0])
    setFirstPunchIn(wt, 25200)
    expect(wt.events[0].t).toBe(28800)
  })
})
