import { describe, it, expect } from 'vitest'
import { analyse, eventsToPunches, punchesToEvents, insertEvent, removeEvent } from './events'
import type { Punch, PunchEvent } from './types'

const IN = (t: number): PunchEvent => ({ type: 'in', t })
const OUT = (t: number): PunchEvent => ({ type: 'out', t })
const today = { allowOpen: true }
const past = { allowOpen: false }

describe('analyse', () => {
  it('treats an empty day as valid with no punches', () => {
    expect(analyse([], past)).toEqual({ status: 'valid', punches: [], open: false })
  })

  it('pairs a closed alternating sequence', () => {
    expect(analyse([IN(100), OUT(200), IN(300), OUT(400)], past)).toEqual({
      status: 'valid',
      punches: [{ in: 100, out: 200 }, { in: 300, out: 400 }],
      open: false,
    })
  })

  it('accepts a trailing in for today (open punch)', () => {
    expect(analyse([IN(100), OUT(200), IN(300)], today)).toEqual({
      status: 'valid',
      punches: [{ in: 100, out: 200 }, { in: 300 }],
      open: true,
    })
  })

  it('accepts a single in for today', () => {
    expect(analyse([IN(100)], today)).toMatchObject({ status: 'valid', open: true })
  })

  it('flags a trailing in on a past day as open-past-day', () => {
    expect(analyse([IN(100)], past)).toEqual({
      status: 'faulty',
      issues: [{ index: 0, kind: 'open-past-day' }],
    })
  })

  it('flags a sequence starting with out', () => {
    expect(analyse([OUT(100), IN(200), OUT(300)], past)).toMatchObject({
      status: 'faulty',
      issues: [{ index: 0, kind: 'starts-with-out' }],
    })
  })

  it('flags two ins in a row on the second one', () => {
    expect(analyse([IN(100), IN(200), OUT(300)], past)).toEqual({
      status: 'faulty',
      issues: [{ index: 1, kind: 'double-in' }],
    })
  })

  it('flags two outs in a row on the second one', () => {
    expect(analyse([IN(100), OUT(200), OUT(300)], past)).toEqual({
      status: 'faulty',
      issues: [{ index: 2, kind: 'double-out' }],
    })
  })

  it('flags decreasing times as unsorted', () => {
    expect(analyse([IN(300), OUT(200)], past)).toEqual({
      status: 'faulty',
      issues: [{ index: 1, kind: 'unsorted' }],
    })
  })

  it('reports multiple issues', () => {
    const r = analyse([OUT(50), OUT(100), IN(200)], past)
    expect(r.status).toBe('faulty')
    if (r.status !== 'faulty') return
    expect(r.issues.map(i => i.kind)).toEqual(['starts-with-out', 'double-out', 'open-past-day'])
  })

  it('accepts in and out at the same second (zero-length punch)', () => {
    expect(analyse([IN(100), OUT(100)], past)).toMatchObject({
      status: 'valid',
      punches: [{ in: 100, out: 100 }],
    })
  })
})

describe('eventsToPunches', () => {
  it('returns the pairs of a valid sequence', () => {
    expect(eventsToPunches([IN(1), OUT(2), IN(3)])).toEqual([{ in: 1, out: 2 }, { in: 3 }])
  })

  it('throws on a faulty sequence', () => {
    expect(() => eventsToPunches([IN(1), IN(2)])).toThrow(/double-in/)
  })
})

describe('punchesToEvents', () => {
  it('flattens closed and open punches', () => {
    expect(punchesToEvents([{ in: 1, out: 2 }, { in: 3 }])).toEqual([IN(1), OUT(2), IN(3)])
  })

  it('round-trips punches -> events -> punches losslessly', () => {
    const cases: Punch[][] = [
      [],
      [{ in: 28800 }],
      [{ in: 28800, out: 43200 }],
      [{ in: 28800, out: 43200 }, { in: 45000, out: 61200 }, { in: 62000 }],
    ]
    for (const punches of cases) {
      expect(eventsToPunches(punchesToEvents(punches))).toEqual(punches)
    }
  })
})

describe('insertEvent', () => {
  it('inserts sorted by time', () => {
    expect(insertEvent([IN(100), OUT(300)], IN(200))).toEqual([IN(100), IN(200), OUT(300)])
  })

  it('inserts at the start and the end', () => {
    expect(insertEvent([IN(100)], OUT(50))).toEqual([OUT(50), IN(100)])
    expect(insertEvent([IN(100)], OUT(150))).toEqual([IN(100), OUT(150)])
  })

  it('places a tie after existing events (stable)', () => {
    expect(insertEvent([IN(100), OUT(200)], IN(200))).toEqual([IN(100), OUT(200), IN(200)])
  })

  it('does not mutate the input', () => {
    const events = Object.freeze([IN(100)])
    const r = insertEvent(events, OUT(200))
    expect(r).not.toBe(events)
    expect(events).toEqual([IN(100)])
  })
})

describe('removeEvent', () => {
  it('removes by index', () => {
    expect(removeEvent([IN(1), OUT(2), IN(3)], 1)).toEqual([IN(1), IN(3)])
  })

  it('ignores an out-of-range index', () => {
    expect(removeEvent([IN(1)], 5)).toEqual([IN(1)])
  })

  it('removing a single event can produce a faulty day', () => {
    const r = removeEvent([IN(100), OUT(200), IN(300), OUT(400)], 1)
    expect(analyse(r, past)).toMatchObject({ status: 'faulty', issues: [{ index: 1, kind: 'double-in' }] })
  })
})
