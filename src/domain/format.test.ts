import { describe, it, expect } from 'vitest'
import { formatHHMM, formatMMSS, secToTimeInput, timeInputToSec } from './format'

describe('formatHHMM', () => {
  it('0 ms → 00:00', () => expect(formatHHMM(0)).toBe('00:00'))
  it('59_999 ms → 00:00', () => expect(formatHHMM(59_999)).toBe('00:00'))
  it('60_000 ms → 00:01', () => expect(formatHHMM(60_000)).toBe('00:01'))
  it('6h → 06:00', () => expect(formatHHMM(6 * 3600_000)).toBe('06:00'))
  it('6h30m → 06:30', () => expect(formatHHMM(6 * 3600_000 + 30 * 60_000)).toBe('06:30'))
  it('9h15m → 09:15', () => expect(formatHHMM(9 * 3600_000 + 15 * 60_000)).toBe('09:15'))
  it('10h → 10:00', () => expect(formatHHMM(10 * 3600_000)).toBe('10:00'))
  it('negative → 00:00', () => expect(formatHHMM(-1)).toBe('00:00'))
})

describe('formatMMSS', () => {
  it('0 ms → 00:00', () => expect(formatMMSS(0)).toBe('00:00'))
  it('30 min → 30:00', () => expect(formatMMSS(30 * 60_000)).toBe('30:00'))
  it('15 min → 15:00', () => expect(formatMMSS(15 * 60_000)).toBe('15:00'))
  it('1500_000 → 25:00', () => expect(formatMMSS(1500_000)).toBe('25:00'))
  it('1500_000 - 1 → 24:59', () => expect(formatMMSS(1499_999)).toBe('24:59'))
  it('negative → 00:00', () => expect(formatMMSS(-1)).toBe('00:00'))
})

describe('secToTimeInput', () => {
  it('0 → 00:00', () => expect(secToTimeInput(0)).toBe('00:00'))
  it('28800 (08:00) → 08:00', () => expect(secToTimeInput(28800)).toBe('08:00'))
  it('86399 (23:59:59) → 23:59', () => expect(secToTimeInput(86399)).toBe('23:59'))
  it('negative clamps to 00:00', () => expect(secToTimeInput(-100)).toBe('00:00'))
  it('>=86400 clamps to 23:59', () => expect(secToTimeInput(90000)).toBe('23:59'))
  it('rounds seconds', () => expect(secToTimeInput(28830)).toBe('08:00'))
})

describe('timeInputToSec', () => {
  it('08:00 → 28800', () => expect(timeInputToSec('08:00')).toBe(28800))
  it('00:00 → 0', () => expect(timeInputToSec('00:00')).toBe(0))
  it('23:59 → 86340', () => expect(timeInputToSec('23:59')).toBe(86340))
  it('24:00 clamps hour to 23', () => expect(timeInputToSec('24:00')).toBe(82800))
  it('negative hour clamps to 0', () => expect(timeInputToSec('-01:00')).toBe(0))
  it('minute > 59 clamps to 59', () => expect(timeInputToSec('12:70')).toBe(12 * 3600 + 59 * 60))
  it('garbage returns 0', () => expect(timeInputToSec('abc')).toBe(0))
  it('empty returns 0', () => expect(timeInputToSec('')).toBe(0))
  it('single digit hour works', () => expect(timeInputToSec('8:05')).toBe(8 * 3600 + 5 * 60))
})

describe('round-trip secToTimeInput → timeInputToSec', () => {
  it('preserves minute precision', () => {
    for (let s = 0; s < 86400; s += 3600) {
      const out = timeInputToSec(secToTimeInput(s))
      expect(out).toBe(Math.floor(s / 60) * 60)
    }
  })
})
