import { describe, it, expect } from 'vitest'
import { todayString, isExpired, localEpochForTodayMs, secondsSinceMidnight, mondayBasedWeekday, startOfWeekMonday, lastFourWeeksRange, addDays, ymd } from './date'

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

describe('mondayBasedWeekday', () => {
  it('returns 0 for Monday', () => {
    expect(mondayBasedWeekday(new Date(2026, 7, 17, 10, 0))).toBe(0)
  })

  it('returns 1 for Tuesday', () => {
    expect(mondayBasedWeekday(new Date(2026, 7, 18, 10, 0))).toBe(1)
  })

  it('returns 5 for Saturday', () => {
    expect(mondayBasedWeekday(new Date(2026, 7, 22, 10, 0))).toBe(5)
  })

  it('returns 6 for Sunday', () => {
    expect(mondayBasedWeekday(new Date(2026, 7, 23, 10, 0))).toBe(6)
  })
})

describe('startOfWeekMonday', () => {
  it('returns the Monday of the same week for a mid-week date', () => {
    const monday = startOfWeekMonday(new Date(2026, 7, 19, 15, 30))
    expect(monday.getFullYear()).toBe(2026)
    expect(monday.getMonth()).toBe(7)
    expect(monday.getDate()).toBe(17)
    expect(monday.getHours()).toBe(0)
    expect(monday.getMinutes()).toBe(0)
  })

  it('returns the previous Monday when d is Sunday', () => {
    const monday = startOfWeekMonday(new Date(2026, 7, 23, 10, 0))
    expect(monday.getDate()).toBe(17)
  })

  it('returns itself when d is Monday', () => {
    const monday = startOfWeekMonday(new Date(2026, 7, 17, 10, 0))
    expect(monday.getDate()).toBe(17)
  })
})

describe('lastFourWeeksRange', () => {
  it('spans 4 Mon-Sun weeks including the current week', () => {
    const { start, end } = lastFourWeeksRange(new Date(2026, 7, 19, 10, 0))
    expect(start.getDate()).toBe(27)
    expect(start.getMonth()).toBe(6)
    expect(end.getDate()).toBe(23)
    expect(end.getMonth()).toBe(7)
  })

  it('anchors on the Monday of today when today is Monday', () => {
    const { start, end } = lastFourWeeksRange(new Date(2026, 7, 17, 10, 0))
    expect(start.getDate()).toBe(27)
    expect(start.getMonth()).toBe(6)
    expect(end.getDate()).toBe(23)
  })

  it('covers exactly 28 days inclusive', () => {
    const { start, end } = lastFourWeeksRange(new Date(2026, 7, 23, 10, 0))
    const diff = Math.round((end.getTime() - start.getTime()) / 86400_000)
    expect(diff).toBe(27)
  })

  it('always contains today', () => {
    const today = new Date(2026, 7, 20, 12, 0)
    const { start, end } = lastFourWeeksRange(today)
    expect(today.getTime()).toBeGreaterThanOrEqual(start.getTime())
    expect(today.getTime()).toBeLessThanOrEqual(end.getTime())
  })
})

describe('addDays', () => {
  it('adds days and rolls month', () => {
    const d = addDays(new Date(2026, 7, 31, 10, 0), 1)
    expect(d.getDate()).toBe(1)
    expect(d.getMonth()).toBe(8)
    expect(d.getHours()).toBe(10)
  })

  it('does not mutate input', () => {
    const input = new Date(2026, 7, 17, 10, 0)
    addDays(input, 3)
    expect(input.getDate()).toBe(17)
  })
})

describe('ymd', () => {
  it('returns YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 7, 17, 10, 0))).toBe('2026-08-17')
  })

  it('zero-pads month and day', () => {
    expect(ymd(new Date(2026, 0, 5, 10, 0))).toBe('2026-01-05')
  })
})
