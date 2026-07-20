import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore, startTick, stopTick } from './clock'
import { clearAllEntries, putEntry, getEntry } from '@/storage/entries'
import { SIX_HOURS_MS, BREAK_30_MS } from '@/domain/recomputeBreaks'

vi.mock('@/storage/persist', () => ({
  requestPersistence: vi.fn().mockResolvedValue(true),
  isPersisted: vi.fn().mockResolvedValue(false),
}))

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearAllEntries()
  stopTick()
})

describe('boot / init', () => {
  it('init loads today entry from storage', async () => {
    const now = new Date('2026-07-21T08:00:00').getTime()
    await putEntry({ date: '2026-07-21', segments: [{ type: 'work', start: now }] })
    const store = useClockStore()
    store.now = now
    await store.init()
    expect(store.loadStatus).toBe('ready')
    expect(store.entry).not.toBeNull()
    expect(store.entry!.date).toBe('2026-07-21')
    expect(store.isClockedIn).toBe(true)
  })

  it('init with empty storage leaves entry null', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.init()
    expect(store.loadStatus).toBe('ready')
    expect(store.entry).toBeNull()
  })
})

describe('clockIn / clockOut', () => {
  it('clockIn creates entry with one work segment', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    expect(store.entry).not.toBeNull()
    expect(store.entry!.segments).toHaveLength(1)
    expect(store.isClockedIn).toBe(true)
  })

  it('clockIn then clockOut closes the segment', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += 3600_000
    await store.clockOut()
    expect(store.isClockedOut).toBe(true)
    expect(store.workedMs).toBe(3600_000)
  })

  it('clockIn twice is a no-op when already running', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    await store.clockIn(store.now + 1000)
    expect(store.entry!.segments).toHaveLength(1)
  })

  it('clockIn while on break is a no-op', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += SIX_HOURS_MS + 1000
    await store.persistAndRecompute()
    expect(store.isOnBreak).toBe(true)
    const segCount = store.entry!.segments.length
    await store.clockIn()
    expect(store.entry!.segments.length).toBe(segCount)
  })

  it('clockIn after clockOut appends a new work segment', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += 3600_000
    await store.clockOut()
    expect(store.isClockedOut).toBe(true)
    store.now += 3600_000
    await store.clockIn(store.now)
    expect(store.entry!.segments).toHaveLength(2)
    expect(store.isClockedIn).toBe(true)
  })

  it('clockOut is a no-op when not clocked in', async () => {
    const store = useClockStore()
    await store.clockOut()
    expect(store.entry).toBeNull()
  })

  it('persisted entry matches in-memory entry after mutations', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    const fetched = await getEntry('2026-07-21')
    expect(fetched).toStrictEqual(store.entry)
  })
})

describe('adjustStart', () => {
  it('moves open segment start earlier by N minutes', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    const orig = store.entry!.segments[0].start
    await store.adjustStart(5)
    expect(store.entry!.segments[0].start).toBe(orig - 5 * 60_000)
  })

  it('is a no-op when on break', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += SIX_HOURS_MS + 1000
    await store.persistAndRecompute()
    expect(store.isOnBreak).toBe(true)
    const segs = [...store.entry!.segments]
    await store.adjustStart(5)
    expect(store.entry!.segments).toStrictEqual(segs)
  })

  it('is a no-op when clocked out', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += 3600_000
    await store.clockOut()
    const segs = [...store.entry!.segments]
    await store.adjustStart(5)
    expect(store.entry!.segments).toStrictEqual(segs)
  })
})

describe('editClockIn', () => {
  it('updates first segment start', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    const newStart = store.now - 600_000
    await store.editClockIn(newStart)
    expect(store.entry!.segments[0].start).toBe(newStart)
  })
})

describe('reset', () => {
  it('deletes entry from storage and clears state', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    expect(store.entry).not.toBeNull()
    await store.reset()
    expect(store.entry).toBeNull()
    expect(await getEntry('2026-07-21')).toBeUndefined()
  })
})

describe('onVisible', () => {
  it('updates now and recomputes', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    const later = store.now + 3600_000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(later)
    await store.onVisible()
    expect(store.workedMs).toBe(3600_000)
    spy.mockRestore()
  })

  it('closes an open break that has ended', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    const later = store.now + SIX_HOURS_MS + BREAK_30_MS + 60_000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(later)
    await store.onVisible()
    expect(store.isOnBreak).toBe(false)
    expect(store.isClockedIn).toBe(true)
    expect(store.breakEndsAt).toBeUndefined()
    spy.mockRestore()
  })

  it('is safe when entry is null', async () => {
    const store = useClockStore()
    await store.onVisible()
    expect(store.entry).toBeNull()
  })
})

describe('checkRollover', () => {
  it('deletes entry when date is expired', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T23:59:00').getTime()
    await store.clockIn(store.now)
    store.now = new Date('2026-07-22T00:01:00').getTime()
    await store.checkRollover()
    expect(store.entry).toBeNull()
    expect(await getEntry('2026-07-21')).toBeUndefined()
  })

  it('no-op when entry is null', async () => {
    const store = useClockStore()
    await store.checkRollover()
    expect(store.entry).toBeNull()
  })
})

describe('viewState', () => {
  it('returns clock-in when no entry', () => {
    const store = useClockStore()
    expect(store.viewState).toStrictEqual({ kind: 'clock-in' })
  })

  it('returns running when clocked in', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    expect(store.viewState).toStrictEqual({ kind: 'running' })
  })

  it('returns break when on break', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += SIX_HOURS_MS + 1000
    await store.persistAndRecompute()
    expect(store.isOnBreak).toBe(true)
    expect(store.viewState).toStrictEqual({ kind: 'break' })
  })

  it('returns clocked-out when clocked out', async () => {
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    store.now += 3600_000
    await store.clockOut()
    expect(store.viewState).toStrictEqual({ kind: 'clocked-out' })
  })
})

describe('persistence', () => {
  it('requestPersistence is called on first clockIn', async () => {
    const { requestPersistence } = await import('@/storage/persist')
    const persistSpy = vi.mocked(requestPersistence)
    const store = useClockStore()
    store.now = new Date('2026-07-21T08:00:00').getTime()
    await store.clockIn(store.now)
    expect(persistSpy).toHaveBeenCalledTimes(1)
    await store.clockOut()
    expect(persistSpy).toHaveBeenCalledTimes(1) // still 1
  })
})

describe('tick', () => {
  it('startTick advances now', async () => {
    vi.useFakeTimers()
    const store = useClockStore()
    store.now = 1000
    startTick(store)
    vi.advanceTimersByTime(2000)
    expect(store.now).toBeGreaterThanOrEqual(3000)
    vi.useRealTimers()
  })
})
