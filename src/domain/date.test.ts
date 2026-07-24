import { describe, it, expect } from 'vitest'
import { todayString, isExpired, localEpochForTodayMs, secondsSinceMidnight } from './date'

describe('todayString', () => {
  it('returns YYYY-MM-DD for a given date', () => {
    const d = new Date('2026-07-21T12:00:00')
    expect(todayString(d)).toBe('2026-07-21')
  })

  it('zero-pads month and day', () => {
    const d1 = new Date('2026-01-05T12:00:00')
    expect(todayString(d1)).toBe('2026-01-05')
    const d2 = new Date('2026-12-25T12:00:00')
    expect(todayString(d2)).toBe('2026-12-25')
  })

  it('changes at local midnight', () => {
    const before = new Date('2026-07-20T23:59:00')
    const after = new Date('2026-07-21T00:00:00')
    expect(todayString(before)).toBe('2026-07-20')
    expect(todayString(after)).toBe('2026-07-21')
  })
})

describe('isExpired', () => {
  it('returns false for today', () => {
    const now = new Date('2026-07-21T12:00:00')
    expect(isExpired('2026-07-21', now)).toBe(false)
  })

  it('returns true for yesterday', () => {
    const now = new Date('2026-07-21T00:00:00')
    expect(isExpired('2026-07-20', now)).toBe(true)
  })

  it('returns true for tomorrow (should not happen but test)', () => {
    const now = new Date('2026-07-21T00:00:00')
    expect(isExpired('2026-07-22', now)).toBe(true)
  })
})

describe('localEpochForTodayMs', () => {
  it('returns epoch with correct hours and minutes on the given day', () => {
    const now = new Date('2026-07-21T08:00:00')
    const ms = localEpochForTodayMs(9, 30, now)
    const d = new Date(ms)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(21)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(30)
    expect(d.getSeconds()).toBe(0)
  })
})

describe('secondsSinceMidnight', () => {
  it('returns 0 at midnight', () => {
    const d = new Date('2026-07-21T00:00:00')
    expect(secondsSinceMidnight(d.getTime())).toBe(0)
  })

  it('returns 34200 at 09:30', () => {
    const d = new Date('2026-07-21T09:30:00')
    expect(secondsSinceMidnight(d.getTime())).toBe(34200)
  })

  it('returns 86399 at 23:59:59', () => {
    const d = new Date('2026-07-21T23:59:59')
    expect(secondsSinceMidnight(d.getTime())).toBe(86399)
  })
})
