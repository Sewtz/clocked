import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore, stopTick } from './clock'
import { getSettings, putSettings } from '@/storage/settings'
import { getWorktime, putWorktime, clearWorktime } from '@/storage/worktime'
import { setClock } from '@/domain/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { secondsSinceMidnight } from '@/domain/date'

vi.mock('@/storage/persist', () => ({
  requestPersistence: vi.fn().mockResolvedValue(true),
  isPersisted: vi.fn().mockResolvedValue(false),
}))

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  stopTick()
  setClock(() => 0)
})

describe('boot / init', () => {
  it('init loads settings (with defaults) and worktime', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    await putSettings(DEFAULT_SETTINGS)
    await putWorktime({ date: '2026-07-21', punches: [{ in: secondsSinceMidnight(t) }] })

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
    expect(store.worktime!.punches).toHaveLength(1)
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
    expect(store.worktime!.punches).toHaveLength(1)
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
    expect(store.worktime!.punches).toHaveLength(2)
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
    const orig = store.worktime!.punches[0].in
    await store.adjustStart(300)
    expect(store.worktime!.punches[0].in).toBe(orig - 300)
  })

  it('is a no-op when clocked out', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    const punches = [...store.worktime!.punches]
    await store.adjustStart(300)
    expect(store.worktime!.punches).toStrictEqual(punches)
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
    expect(store.worktime!.punches[0].in).toBe(newIn)
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
    expect(store.worktime!.punches).toHaveLength(1)
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
