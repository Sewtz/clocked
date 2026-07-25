import { now, setClock } from '@/domain/clock'
import { todayString, secondsSinceMidnight } from '@/domain/date'
import { DEFAULT_SETTINGS } from '@/domain/types'
import type { Settings } from '@/domain/types'
import type { useClockStore } from '@/stores/clock'

export function installDebugApi(store: ReturnType<typeof useClockStore>) {
  const api = {
    help: () => {
      console.table([
        { method: 'state', returns: 'current snapshot (settings, worktime, now, worked, display, breakState, breakEndsAt, viewState, targetReached, limitReached)' },
        { method: 'settings', returns: 'current settings object' },
        { method: 'setSettings(patch)', returns: 'merge-patch settings, persists' },
        { method: 'resetSettings()', returns: 'restore DEFAULT_SETTINGS' },
        { method: 'worktime', returns: 'current raw worktime object' },
        { method: 'punchIn(sec?)', returns: 'clock in (default now, or specific sec-since-midnight)' },
        { method: 'punchOut()', returns: 'clock out' },
        { method: 'setPunches(punches)', returns: 'overwrite today\'s punches' },
        { method: 'clear()', returns: 'clear today\'s worktime' },
        { method: 'tickTo(sec)', returns: 'set mock clock to sec-since-midnight' },
        { method: 'tickForward(sec)', returns: 'advance mock clock by sec' },
        { method: 'useRealClock()', returns: 'restore Date.now()' },
        { method: 'simulateMidnight()', returns: 'force midnight rollover' },
      ])
    },

    get state() {
      return {
        settings: store.settings,
        worktime: store.worktime,
        now: store.now,
        worked: store.workedMs,
        display: store.displayMs,
        breakState: store.breakState,
        breakEndsAt: store.breakEndsAt,
        viewState: store.viewState.kind,
        targetReached: store.computed.targetReached,
        limitReached: store.computed.limitReached,
      }
    },

    get settings() { return store.settings },

    setSettings: async (patch: Partial<Settings>) => {
      await store.setSettings(patch)
    },

    resetSettings: async () => {
      await store.setSettings({ ...DEFAULT_SETTINGS })
    },

    get worktime() { return store.worktime },

    punchIn: async (sec?: number) => {
      await store.clockIn(sec ?? secondsSinceMidnight(now()))
    },

    punchOut: async () => {
      await store.clockOut()
    },

    setPunches: async (punches: Array<{ in: number; out?: number }>) => {
      if (!store.worktime) {
        store.worktime = { date: todayString(new Date(now())), punches: [] }
      }
      await store.replacePunches(punches)
    },

    clear: async () => {
      await store.reset()
    },

    tickTo: (sec: number) => {
      const base = new Date()
      base.setHours(0, 0, 0, 0)
      setClock(() => base.getTime() + sec * 1000)
      store.now = now()
    },

    tickForward: (sec: number) => {
      api.tickTo(secondsSinceMidnight(now()) + sec)
    },

    useRealClock: () => {
      setClock(null)
    },

    simulateMidnight: async () => {
      const fakeNow = new Date()
      fakeNow.setHours(23, 59, 59, 0)
      setClock(() => fakeNow.getTime())
      store.now = now()
      await store.checkRollover()
      fakeNow.setTime(fakeNow.getTime() + 2000)
      store.now = now()
      await store.checkRollover()
    },
  }

  ;(window as unknown as Record<string, unknown>).__clocked = api
}
