import { defineStore } from 'pinia'
import { now } from '@/domain/clock'
import { secondsSinceMidnight, isExpired, todayString } from '@/domain/date'
import { recompute } from '@/domain/recompute'
import { applySettingsPatch } from '@/domain/settings'
import { getSettings, putSettings } from '@/storage/settings'
import { getWorktime, putWorktime, clearWorktime } from '@/storage/worktime'
import { requestPersistence } from '@/storage/persist'
import { adjustStart, setFirstPunchIn } from '@/domain/adjust'
import type { Settings, Worktime, ViewState, BreakState, Recomputed } from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/domain/types'

type LoadStatus = 'idle' | 'loading' | 'ready'

let persistenceRequested = false
let tickTimer: ReturnType<typeof setInterval> | null = null

export function startTick(store: ReturnType<typeof useClockStore>) {
  if (tickTimer !== null) return
  tickTimer = setInterval(() => {
    store.now = now()
  }, 1000)
}

export function stopTick() {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

export const useClockStore = defineStore('clock', {
  state: () => ({
    loadStatus: 'idle' as LoadStatus,
    settings: null as Settings | null,
    worktime: null as Worktime | null,
    now: 0,
    _isClockedIn: false,
  }),

  getters: {
    computed(): Recomputed {
      if (!this.settings || !this.worktime) {
        return { workedSeconds: 0, breakSeconds: 0, displaySeconds: 0, breakState: 'running', targetReached: false, limitReached: false, breakEndsAtMs: undefined }
      }
      const nowSec = secondsSinceMidnight(this.now)
      return recompute(this.worktime.punches, this.settings, nowSec)
    },

    workedMs(): number { return this.computed.workedSeconds * 1000 },
    displayMs(): number { return this.computed.displaySeconds * 1000 },
    breakState(): BreakState { return this.computed.breakState },
    breakEndsAt(): number | undefined { return this.computed.breakEndsAtMs },

    isClockedIn(): boolean { return this._isClockedIn },
    isClockedOut(): boolean { return !!this.worktime && !this._isClockedIn && !this.isOnBreak },
    isOnBreak(): boolean { return this.breakState === 'break1' || this.breakState === 'break2' },

    viewState(): ViewState {
      if (!this.worktime) return { kind: 'clock-in' }
      if (this.isOnBreak) return { kind: 'break' }
      if (this._isClockedIn) return { kind: 'running' }
      return { kind: 'clocked-out' }
    },
  },

  actions: {
    async init() {
      this.now = now()
      this.loadStatus = 'loading'

      let s = await getSettings()
      if (!s) { s = DEFAULT_SETTINGS; await putSettings(s) }
      this.settings = s

      const w = await getWorktime()
      if (w) {
        this.worktime = w
        const last = w.punches[w.punches.length - 1]
        this._isClockedIn = !!(last && last.out === undefined)
      }

      this.loadStatus = 'ready'
      startTick(this)
      await this.checkRollover()
    },

    async clockIn(backdateSec?: number) {
      if (!persistenceRequested) {
        persistenceRequested = true
        void requestPersistence()
      }
      if (this._isClockedIn) return
      if (this.isOnBreak) return

      const inSec = backdateSec ?? secondsSinceMidnight(now())
      if (!this.worktime) {
        this.worktime = { date: todayString(new Date(now())), punches: [{ in: inSec }] }
      } else {
        this.worktime.punches.push({ in: inSec })
      }
      this._isClockedIn = true
      await this.persistAndRecompute()
    },

    async clockOut() {
      if (!this.worktime || !this._isClockedIn) return
      const last = this.worktime.punches[this.worktime.punches.length - 1]
      if (last && last.out === undefined) {
        last.out = secondsSinceMidnight(now())
      }
      this._isClockedIn = false
      await this.persistAndRecompute()
    },

    async adjustStart(deltaSeconds: number) {
      if (!this.worktime || !this._isClockedIn) return
      const last = this.worktime.punches[this.worktime.punches.length - 1]
      if (!last || last.out !== undefined) return
      this.worktime = adjustStart(this.worktime, deltaSeconds)
      await this.persistAndRecompute()
    },

    async editClockIn(newIn: number) {
      if (!this.worktime) return
      this.worktime = setFirstPunchIn(this.worktime, newIn)
      await this.persistAndRecompute()
    },

    async setSettings(patch: Partial<Settings>) {
      if (!this.settings) return
      this.settings = applySettingsPatch(this.settings, patch)
      await putSettings(this.settings)
    },

    async persistAndRecompute() {
      if (!this.worktime) return
      this.now = now()
      await putWorktime(JSON.parse(JSON.stringify(this.worktime)))
    },

    async checkRollover() {
      if (!this.worktime) return
      if (isExpired(this.worktime.date, new Date(this.now))) {
        await this.reset()
      }
    },

    async reset() {
      await clearWorktime()
      this.worktime = null
      this._isClockedIn = false
    },

    async onVisible() {
      this.now = now()
      if (this.worktime) {
        await this.persistAndRecompute()
      }
      await this.checkRollover()
    },
  },
})
