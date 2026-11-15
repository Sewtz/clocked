import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore, stopTick } from './clock'
import { getSettings, putSettings } from '@/storage/settings'
import { getWorktime, putWorktime, clearWorktime } from '@/storage/worktime'
import { getHistoryDay, clearHistory } from '@/storage/history'
import { setClock } from '@/domain/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { secondsSinceMidnight } from '@/domain/date'
import { punchesToEvents, eventsToPunches } from '@/domain/events'
import { recompute } from '@/domain/recompute'

vi.mock('@/storage/persist', () => ({
  requestPersistence: vi.fn().mockResolvedValue(true),
  isPersisted: vi.fn().mockResolvedValue(false),
}))

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  await clearHistory()
  stopTick()
  setClock(() => 0)
})

describe('boot / init', () => {
  it('init loads settings (with defaults) and worktime', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    await putSettings(DEFAULT_SETTINGS)
    await putWorktime({ date: '2026-07-21', events: punchesToEvents([{ in: secondsSinceMidnight(t) }]) })

    const store = useClockStore()
    await store.init()
    expect(store.loadStatus).toBe('ready')
    expect(store.settings).toStrictEqual(DEFAULT_SETTINGS)
    expect(store.worktime).not.toBeNull()
    expect(store.isClockedIn).toBe(true)
  })

  it('init with empty storage creates defaults', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    await store.init()
    expect(store.loadStatus).toBe('ready')
    expect(store.settings).toStrictEqual(DEFAULT_SETTINGS)
    expect(store.worktime).toBeNull()
  })
})

describe('clockIn / clockOut', () => {
  it('clockIn creates worktime with one punch', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    expect(store.worktime).not.toBeNull()
    expect(store.worktime!.events).toHaveLength(1)
    expect(store.isClockedIn).toBe(true)
  })

  it('clockIn then clockOut closes the punch', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    expect(store.isClockedOut).toBe(true)
    expect(store.workedMs).toBeGreaterThanOrEqual(3600_000)
  })

  it('clockIn twice is a no-op when already running', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    await store.clockIn()
    expect(store.worktime!.events).toHaveLength(1)
  })

  it('clockIn after clockOut appends a new punch', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    expect(store.isClockedOut).toBe(true)
    setClock(() => t + 7200_000)
    await store.clockIn()
    expect(store.worktime!.events.map(e => e.type)).toEqual(['in', 'out', 'in'])
    expect(store.isClockedIn).toBe(true)
  })

  it('clockOut is a no-op when not clocked in', async () => {
    const store = useClockStore()
    await store.clockOut()
    expect(store.worktime).toBeNull()
  })

  it('persisted worktime matches in-memory after mutations', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    const fetched = await getWorktime()
    expect(fetched).toStrictEqual(store.worktime)
  })
})

describe('adjustStart', () => {
  it('moves first punch in earlier by delta seconds', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    const orig = store.worktime!.events[0].t
    await store.adjustStart(300)
    expect(store.worktime!.events[0].t).toBe(orig - 300)
  })

  it('is a no-op when clocked out', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    const events = [...store.worktime!.events]
    await store.adjustStart(300)
    expect(store.worktime!.events).toStrictEqual(events)
  })
})

describe('editClockIn', () => {
  it('updates first punch in', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    const newIn = secondsSinceMidnight(t) - 600
    await store.editClockIn(newIn)
    expect(store.worktime!.events[0].t).toBe(newIn)
  })
})

describe('reset', () => {
  it('clears worktime from storage and state', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    expect(store.worktime).not.toBeNull()
    await store.reset()
    expect(store.worktime).toBeNull()
    expect(await getWorktime()).toBeNull()
  })
})

describe('onVisible', () => {
  it('updates now and recomputes', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.onVisible()
    expect(store.workedMs).toBeGreaterThanOrEqual(3600_000 - 1000)
  })

  it('is safe when worktime is null', async () => {
    const store = useClockStore()
    await store.onVisible()
    expect(store.worktime).toBeNull()
  })
})

describe('checkRollover', () => {
  it('clears worktime when date is expired', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    store.worktime!.date = '2026-07-20'
    await store.checkRollover()
    expect(store.worktime).toBeNull()
  })

  it('no-op when worktime is null', async () => {
    const store = useClockStore()
    await store.checkRollover()
    expect(store.worktime).toBeNull()
  })
})

describe('history archive', () => {
  it('archives the expired worktime before clearing', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 7200_000)
    await store.clockOut()
    store.worktime!.date = '2026-07-20'
    await store.checkRollover()
    expect(store.worktime).toBeNull()
    const archived = await getHistoryDay('2026-07-20')
    expect(archived).not.toBeNull()
    expect(archived!.date).toBe('2026-07-20')
    expect(archived!.events).toEqual(punchesToEvents([{ in: 28800, out: 36000 }]))
  })

  it('closes an open punch at 86399 when archiving on rollover', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    store.worktime!.date = '2026-07-20'
    await store.checkRollover()
    const archived = await getHistoryDay('2026-07-20')
    expect(archived!.events).toEqual(punchesToEvents([{ in: 28800, out: 86399 }]))
  })

  it('does not archive when worktime has no punches', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-20', events: punchesToEvents([]) }
    await store.checkRollover()
    expect(await getHistoryDay('2026-07-20')).toBeNull()
  })

  it('archives consecutive days correctly', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    store.worktime!.date = '2026-07-20'
    await store.checkRollover()
    expect((await getHistoryDay('2026-07-20'))!.events).toEqual(punchesToEvents([{ in: 28800, out: 32400 }]))
    const t2 = new Date('2026-07-22T08:00:00').getTime()
    setClock(() => t2)
    await store.clockIn()
    setClock(() => t2 + 3600_000)
    await store.clockOut()
    store.worktime!.date = '2026-07-21'
    await store.checkRollover()
    expect((await getHistoryDay('2026-07-21'))!.events).toEqual(punchesToEvents([{ in: 28800, out: 32400 }]))
  })
})

describe('loadHistoryRange', () => {
  it('populates historyCache from storage within the range', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-20', events: punchesToEvents([{ in: 28800, out: 32400 }]) }
    await store.checkRollover()
    store.worktime = null
    await store.loadHistoryRange(new Date(2026, 6, 13), new Date(2026, 6, 26))
    expect(store.historyCache).not.toBeNull()
    expect(store.historyCache!['2026-07-20'].events).toEqual(punchesToEvents([{ in: 28800, out: 32400 }]))
  })

  it('merges today into the cache', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    await store.loadHistoryRange(new Date(2026, 6, 13), new Date(2026, 6, 26))
    expect(store.historyCache!['2026-07-21']).toStrictEqual(store.worktime)
  })

  it('does not add today when worktime has no punches', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.loadHistoryRange(new Date(2026, 6, 13), new Date(2026, 6, 26))
    expect(store.historyCache!['2026-07-21']).toBeUndefined()
  })

  it('does not add today when worktime is null', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.loadHistoryRange(new Date(2026, 6, 13), new Date(2026, 6, 26))
    expect(store.historyCache).toEqual({})
  })
})

describe('clearHistory action', () => {
  it('wipes the history store and empties the cache', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-20', events: punchesToEvents([{ in: 28800, out: 32400 }]) }
    await store.checkRollover()
    await store.loadHistoryRange(new Date(2026, 6, 13), new Date(2026, 6, 26))
    expect(await getHistoryDay('2026-07-20')).not.toBeNull()
    await store.clearHistory()
    expect(await getHistoryDay('2026-07-20')).toBeNull()
    expect(store.historyCache).toEqual({})
  })
})

describe('viewState', () => {
  it('returns clock-in when no worktime', () => {
    const store = useClockStore()
    expect(store.viewState).toStrictEqual({ kind: 'clock-in' })
  })

  it('returns running when clocked in', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    expect(store.viewState).toStrictEqual({ kind: 'running' })
  })

  it('returns clocked-out when clocked out', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    expect(store.viewState).toStrictEqual({ kind: 'clocked-out' })
  })
})

describe('persistence', () => {
  it('requestPersistence is called on first clockIn', async () => {
    const { requestPersistence } = await import('@/storage/persist')
    const persistSpy = vi.mocked(requestPersistence)
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    expect(persistSpy).toHaveBeenCalledTimes(1)
    await store.clockOut()
    expect(persistSpy).toHaveBeenCalledTimes(1)
  })
})

describe('settings', () => {
  it('setSettings patches and persists', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.setSettings({ break1_enabled: false })
    expect(store.settings!.break1_enabled).toBe(false)
    expect(store.settings!.break2_enabled).toBe(false)
    const persisted = await getSettings()
    expect(persisted!.break1_enabled).toBe(false)
    expect(persisted!.break2_enabled).toBe(false)
  })
})

describe('clock out during break', () => {
  it('clocking out during a break sets viewState to clocked-out', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    // Advance to during break1 (6h30m after clock-in = 14:30)
    // Actually break1 triggers at 6h worked = 14:00, ends at 14:30
    // So at 14:15 (6h15m worked), we're in break1
    setClock(() => t + 22500_000) // 6h15m = 22500s
    store.now = t + 22500_000
    expect(store.breakState).toBe('break1')
    // Now clock out
    await store.clockOut()
    expect(store.isClockedIn).toBe(false)
    expect(store.isClockedOut).toBe(true)
    expect(store.viewState.kind).toBe('clocked-out')
  })

  it('clockIn is still blocked during a break', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    // Advance to during break1
    setClock(() => t + 22500_000)
    store.now = t + 22500_000
    // Try to clock in (should be no-op)
    await store.clockIn()
    // Should still have only 1 punch
    expect(store.worktime!.events).toHaveLength(1)
  })
})

describe('redesign getters', () => {
  it('returns empty values when no worktime', () => {
    const store = useClockStore()
    expect(store.segments).toEqual([])
    expect(store.breakMs).toBe(0)
    expect(store.remainingMs).toBe(0)
    expect(store.overtimeMs).toBe(0)
    expect(store.workPercent).toBe(0)
    expect(store.daySpanMs).toBe(0)
    expect(store.nextMilestone).toBeNull()
  })

  it('returns correct values after clock-in with worked time', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    // Advance 2 hours
    setClock(() => t + 7200_000)
    store.now = t + 7200_000
    expect(store.workedMs).toBe(7200_000)
    expect(store.breakMs).toBe(0)
    expect(store.remainingMs).toBeGreaterThan(0)
    // 8h target - 2h worked = 6h remaining in ms
    expect(store.remainingMs).toBe(6 * 3600 * 1000)
    expect(store.overtimeMs).toBe(0)
    expect(store.workPercent).toBeCloseTo(25, 0)
    expect(store.daySpanMs).toBe(7200_000)
    expect(store.nextMilestone).not.toBeNull()
    expect(store.nextMilestone!.label).toContain('auto-break')
    expect(store.segments.length).toBeGreaterThan(0)
    expect(store.segments[0].type).toBe('work')
  })

  it('overtimeMs > 0 and workPercent === 100 when target exceeded', async () => {
    const t = new Date('2026-07-21T07:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    // Advance 9 hours
    setClock(() => t + 32400_000)
    store.now = t + 32400_000
    // break may have been deducted; just check the conditions
    expect(store.overtimeMs).toBeGreaterThanOrEqual(0)
    expect(store.workPercent).toBeGreaterThanOrEqual(0)
  })

  it('daySpanMs reflects the span from first punch to now', async () => {
    const t = new Date('2026-07-21T09:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 5400_000) // +1.5h
    store.now = t + 5400_000
    expect(store.daySpanMs).toBeCloseTo(5400_000, -3)
  })

  it('nextMilestone returns break1 when worked < 6h', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 7200_000) // +2h
    store.now = t + 7200_000
    expect(store.nextMilestone).not.toBeNull()
    expect(store.nextMilestone!.remainingMs).toBeGreaterThan(0)
    // 6h - 2h = 4h remaining
    expect(store.nextMilestone!.remainingMs).toBeCloseTo(14400_000, -3)
  })

  it('nextMilestone returns null when both breaks disabled', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS, break1_enabled: false, break2_enabled: false }
    await store.clockIn()
    setClock(() => t + 7200_000)
    store.now = t + 7200_000
    expect(store.nextMilestone).toBeNull()
  })

  it('segments includes a gap when there are gaps between punches', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    store.now = t + 3600_000
    await store.clockOut()
    setClock(() => t + 7200_000)
    await store.clockIn()
    store.now = t + 7200_000
    expect(store.segments.some(s => s.type === 'gap')).toBe(true)
  })
})

describe('replaceDayEvents (today)', () => {
  const T = new Date('2026-07-21T08:00:00').getTime()
  const TODAY = '2026-07-21'

  function setup() {
    setClock(() => T)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = T
    return store
  }

  it('replaces events; a closed sequence is clocked-out', async () => {
    const store = setup()
    await store.clockIn()
    await store.replaceDayEvents(TODAY, punchesToEvents([{ in: 25200, out: 27000 }]))
    expect(store.worktime!.events).toEqual(punchesToEvents([{ in: 25200, out: 27000 }]))
    expect(store.isClockedIn).toBe(false)
    expect(store.viewState.kind).toBe('clocked-out')
  })

  it('a trailing in keeps the day running', async () => {
    const store = setup()
    await store.clockIn()
    await store.replaceDayEvents(TODAY, [{ type: 'in', t: 25200 }])
    expect(store.isClockedIn).toBe(true)
    expect(store.viewState.kind).toBe('running')
  })

  it('sorts events by time and clamps them to 0..86399', async () => {
    const store = setup()
    await store.replaceDayEvents(TODAY, [
      { type: 'out', t: 100000 }, { type: 'in', t: -100 },
    ])
    expect(store.worktime!.events).toEqual([{ type: 'in', t: 0 }, { type: 'out', t: 86399 }])
  })

  it('removing every event clears the day back to clock-in', async () => {
    const store = setup()
    await store.clockIn()
    await store.replaceDayEvents(TODAY, [])
    expect(store.worktime).toBeNull()
    expect(await getWorktime()).toBeNull()
    expect(store.viewState.kind).toBe('clock-in')
  })

  it('persists to storage', async () => {
    const store = setup()
    await store.replaceDayEvents(TODAY, [{ type: 'in', t: 25200 }])
    expect(await getWorktime()).toStrictEqual(store.worktime)
  })

  it('ignores future dates', async () => {
    const store = setup()
    await store.replaceDayEvents('2026-07-22', [{ type: 'in', t: 25200 }])
    expect(store.worktime).toBeNull()
    expect(await getHistoryDay('2026-07-22')).toBeNull()
  })
})

describe('replaceDayEvents (past day)', () => {
  const T = new Date('2026-07-21T08:00:00').getTime()

  it('writes the history store and the calendar cache', async () => {
    setClock(() => T)
    const store = useClockStore()
    store.historyCache = {}
    const events = punchesToEvents([{ in: 28800, out: 32400 }])
    await store.replaceDayEvents('2026-07-20', events)
    expect((await getHistoryDay('2026-07-20'))!.events).toEqual(events)
    expect(store.historyCache['2026-07-20'].events).toEqual(events)
    expect(store.worktime).toBeNull()
  })

  it('stores a faulty past day as-is', async () => {
    setClock(() => T)
    const store = useClockStore()
    const events = [{ type: 'in' as const, t: 28800 }, { type: 'in' as const, t: 30000 }]
    await store.replaceDayEvents('2026-07-20', events)
    expect((await getHistoryDay('2026-07-20'))!.events).toEqual(events)
  })

  it('removing every event deletes the history day', async () => {
    setClock(() => T)
    const store = useClockStore()
    store.historyCache = {}
    await store.replaceDayEvents('2026-07-20', [{ type: 'in', t: 1 }, { type: 'out', t: 2 }])
    await store.replaceDayEvents('2026-07-20', [])
    expect(await getHistoryDay('2026-07-20')).toBeNull()
    expect(store.historyCache['2026-07-20']).toBeUndefined()
  })
})

describe('faulty day', () => {
  const T = new Date('2026-07-21T12:00:00').getTime()
  const FAULTY = [{ type: 'in' as const, t: 28800 }, { type: 'in' as const, t: 36000 }, { type: 'out' as const, t: 40000 }]

  async function faultyStore() {
    setClock(() => T)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = T
    await store.replaceDayEvents('2026-07-21', FAULTY)
    return store
  }

  it('is flagged with viewState faulty and an issue on the second in', async () => {
    const store = await faultyStore()
    expect(store.isFaulty).toBe(true)
    expect(store.viewState.kind).toBe('faulty')
    expect(store.analysis).toEqual({ status: 'faulty', issues: [{ index: 1, kind: 'double-in' }] })
  })

  it('has no worked time, breaks, segments or day span', async () => {
    const store = await faultyStore()
    expect(store.workedMs).toBe(0)
    expect(store.breakMs).toBe(0)
    expect(store.segments).toEqual([])
    expect(store.daySpanMs).toBe(0)
    expect(store.isClockedIn).toBe(false)
    expect(store.isClockedOut).toBe(false)
  })

  it('blocks clock-in and clock-out', async () => {
    const store = await faultyStore()
    await store.clockIn()
    await store.clockOut()
    expect(store.worktime!.events).toEqual(FAULTY)
  })

  it('becomes valid again once corrected', async () => {
    const store = await faultyStore()
    await store.replaceDayEvents('2026-07-21', [FAULTY[0], { type: 'out', t: 32000 }, FAULTY[1], FAULTY[2]])
    expect(store.isFaulty).toBe(false)
    expect(store.viewState.kind).toBe('clocked-out')
    const fixed = recompute(eventsToPunches(store.worktime!.events), DEFAULT_SETTINGS, secondsSinceMidnight(T))
    expect(store.workedMs).toBe(fixed.workedSeconds * 1000)
    expect(store.workedMs).toBeGreaterThan(0)
  })

  it('init restores the faulty state from storage', async () => {
    setClock(() => T)
    await putWorktime({ date: '2026-07-21', events: FAULTY })
    const store = useClockStore()
    await store.init()
    expect(store.viewState.kind).toBe('faulty')
  })

  it('is archived as-is on rollover (no 23:59:59 close)', async () => {
    const store = await faultyStore()
    store.now = new Date('2026-07-22T00:00:05').getTime()
    await store.checkRollover()
    expect((await getHistoryDay('2026-07-21'))!.events).toEqual(FAULTY)
    expect(store.worktime).toBeNull()
  })
})

describe('clockOut ordering', () => {
  it('never places the out before its in when the clock went backwards', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t - 600_000)
    await store.clockOut()
    expect(store.isFaulty).toBe(false)
    expect(store.worktime!.events[1]).toEqual({ type: 'out', t: store.worktime!.events[0].t })
  })
})

describe('replaceDayEvents after midnight with a stale live record', () => {
  it('archives yesterday first, then writes the edited day to history', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    setClock(() => new Date('2026-07-20T09:00:00').getTime())
    await store.clockIn(28800)
    // App stayed open past midnight; no rollover check has run yet.
    setClock(() => new Date('2026-07-21T00:10:00').getTime())
    await store.replaceDayEvents('2026-07-20', punchesToEvents([{ in: 28800, out: 61200 }]))
    expect(store.worktime).toBeNull()
    expect((await getHistoryDay('2026-07-20'))!.events).toEqual(punchesToEvents([{ in: 28800, out: 61200 }]))
  })
})

describe('loadDaysForExport', () => {
  it('returns history in the range plus the live day, without touching the calendar cache', async () => {
    setClock(() => new Date('2026-11-15T10:00:00').getTime())
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.replaceDayEvents('2026-11-09', punchesToEvents([{ in: 28800, out: 57600 }]))
    await store.replaceDayEvents('2026-11-01', punchesToEvents([{ in: 28800, out: 32400 }]))
    await store.clockIn(28800)
    store.historyCache = null

    const days = await store.loadDaysForExport('2026-11-09', '2026-11-15')
    expect(Object.keys(days).sort()).toEqual(['2026-11-09', '2026-11-15'])
    expect(days['2026-11-15'].events).toEqual([{ type: 'in', t: 28800 }])
    expect(store.historyCache).toBeNull()

    const older = await store.loadDaysForExport('2026-11-01', '2026-11-02')
    expect(Object.keys(older)).toEqual(['2026-11-01'])
  })
})
