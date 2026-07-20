import { describe, it, expect } from 'vitest'
import { formatHHMM, formatMMSS } from './format'

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
