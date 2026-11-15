import { now, setClock } from '@/domain/clock'
import { todayString, secondsSinceMidnight } from '@/domain/date'
import { getAllHistory } from '@/storage/history'
import { seedDemoWeek } from './demo'
import { DEFAULT_SETTINGS } from '@/domain/types'
import type { PunchEvent, Settings } from '@/domain/types'
import type { useClockStore } from '@/stores/clock'

export function installDebugApi(store: ReturnType<typeof useClockStore>) {
  const api = {
    help: () => {
      console.table([
        { method: 'state', returns: 'current snapshot (settings, worktime, analysis, now, worked, display, breakState, breakEndsAt, viewState, targetReached, limitReached)' },
        { method: 'settings', returns: 'current settings object' },
        { method: 'setSettings(patch)', returns: 'merge-patch settings, persists' },
        { method: 'resetSettings()', returns: 'restore DEFAULT_SETTINGS' },
        { method: 'worktime', returns: 'current raw worktime object' },
        { method: 'punchIn(sec?)', returns: 'clock in (default now, or specific sec-since-midnight)' },
        { method: 'punchOut()', returns: 'clock out' },
        { method: 'setEvents(events)', returns: 'overwrite today\'s events, e.g. [{type:\'in\',t:28800}] (faulty sequences allowed)' },
        { method: 'setHistoryDay(date, events)', returns: 'overwrite a past day (YYYY-MM-DD) in history; [] deletes it' },
        { method: 'clear()', returns: 'clear today\'s worktime (archives to history)' },
        { method: 'getHistory()', returns: 'array of all archived Worktime records (date + events)' },
        { method: 'clearHistory()', returns: 'wipe the entire history store' },
        { method: 'seedDemoWeek()', returns: 'write 5 example workdays before today (one faulty) into history' },
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
        analysis: store.analysis,
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

    setEvents: async (events: PunchEvent[]) => {
      await store.replaceDayEvents(todayString(new Date(now())), events)
    },

    setHistoryDay: async (date: string, events: PunchEvent[]) => {
      await store.replaceDayEvents(date, events)
    },

    clear: async () => {
      await store.reset()
    },

    getHistory: async () => {
      return await getAllHistory()
    },

    clearHistory: async () => {
      await store.clearHistory()
    },

    seedDemoWeek: async () => {
      return await seedDemoWeek(store, new Date(now()))
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
