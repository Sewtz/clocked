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
