import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearWorktime, getWorktime } from '@/storage/worktime'
import { clearHistory, getAllHistory } from '@/storage/history'
import { getSettings } from '@/storage/settings'
import { installDebugApi } from './api'
import { setClock } from '@/domain/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'

vi.mock('@/storage/persist', () => ({
  requestPersistence: vi.fn().mockResolvedValue(true),
  isPersisted: vi.fn().mockResolvedValue(false),
}))

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  await clearHistory()
  setClock(() => 0)
  const store = useClockStore()
  store.settings = { ...DEFAULT_SETTINGS }
  installDebugApi(store)
})

describe('debug API', () => {
  it('state returns an object with all fields', () => {
    expect(window.__clocked.state).toHaveProperty('settings')
    expect(window.__clocked.state).toHaveProperty('worktime')
    expect(window.__clocked.state).toHaveProperty('now')
  })

  it('setSettings cascade-disables break2', async () => {
    await window.__clocked.setSettings({ break1_enabled: false })
    const s = window.__clocked.settings
    expect(s!.break1_enabled).toBe(false)
    expect(s!.break2_enabled).toBe(false)
    const persisted = await getSettings()
    expect(persisted!.break1_enabled).toBe(false)
    expect(persisted!.break2_enabled).toBe(false)
  })

  it('setPunches writes through to IDB', async () => {
    await window.__clocked.setPunches([{ in: 0 }])
    expect(window.__clocked.worktime!.punches).toHaveLength(1)
    const persisted = await getWorktime()
    expect(persisted!.punches[0].in).toBe(0)
  })

  it('tickTo updates now', () => {
    window.__clocked.tickTo(36000)
    const d = new Date(window.__clocked.state.now)
    expect(d.getHours()).toBe(10)
  })

  it('clear removes worktime', async () => {
    await window.__clocked.setPunches([{ in: 0 }])
    expect(window.__clocked.worktime).not.toBeNull()
    await window.__clocked.clear()
    expect(window.__clocked.worktime).toBeNull()
  })

  it('getHistory returns empty array on empty DB', async () => {
    expect(await window.__clocked.getHistory()).toEqual([])
  })

  it('simulateMidnight archives the previous day', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    await window.__clocked.setPunches([{ in: 28800, out: 32400 }])
    await window.__clocked.simulateMidnight()
    const history = await window.__clocked.getHistory()
    expect(history).toHaveLength(1)
    expect(history[0].date).toBe('2026-07-21')
    expect(history[0].punches).toEqual([{ in: 28800, out: 32400 }])
  })

  it('archives an open punch closed at 86399 on clear', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    await window.__clocked.setPunches([{ in: 28800 }])
    await window.__clocked.clear()
    const history = await getAllHistory()
    expect(history).toHaveLength(1)
    expect(history[0].punches).toEqual([{ in: 28800, out: 86399 }])
  })

  it('clearHistory wipes the store', async () => {
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    await window.__clocked.setPunches([{ in: 28800, out: 32400 }])
    await window.__clocked.simulateMidnight()
    expect(await window.__clocked.getHistory()).toHaveLength(1)
    await window.__clocked.clearHistory()
    expect(await window.__clocked.getHistory()).toEqual([])
  })

  it('help does not throw', () => {
    expect(() => window.__clocked.help()).not.toThrow()
  })
})
