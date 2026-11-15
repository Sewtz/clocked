import { defineStore } from 'pinia'
import { now } from '@/domain/clock'
import { secondsSinceMidnight, isExpired, todayString } from '@/domain/date'
import { recompute } from '@/domain/recompute'
import { applySettingsPatch } from '@/domain/settings'
import { getSettings, putSettings } from '@/storage/settings'
import { getWorktime, putWorktime, clearWorktime } from '@/storage/worktime'
import { putHistoryDay, deleteHistoryDay, getHistoryRange, clearHistory } from '@/storage/history'
import { requestPersistence } from '@/storage/persist'
import { adjustStart, setFirstPunchIn } from '@/domain/adjust'
import { ymd } from '@/domain/date'
import { analyse, insertEvent } from '@/domain/events'
import type { Analysis, Settings, Worktime, ViewState, BreakState, Recomputed, DerivedSegment, PunchEvent } from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/domain/types'

type LoadStatus = 'idle' | 'loading' | 'ready'

const LAST_SEC = 86399

const ZERO_RESULT: Recomputed = {
  workedSeconds: 0, breakSeconds: 0, displaySeconds: 0, breakState: 'running',
  targetReached: false, limitReached: false, breakEndsAtMs: undefined, segments: [],
}

function clampSec(t: number): number {
  return Math.max(0, Math.min(LAST_SEC, Math.round(t)))
}

/** Clamp to the day and sort by time; Array.prototype.sort is stable, so ties keep their order. */
function normaliseEvents(events: readonly PunchEvent[]): PunchEvent[] {
  return events.map(e => ({ type: e.type, t: clampSec(e.t) })).sort((a, b) => a.t - b.t)
}

/** Deep copy without Pinia proxies so IndexedDB can structured-clone it. */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

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
    historyCache: null as Record<string, Worktime> | null,
  }),

  getters: {
    /** Validity of today's event sequence; null when there is no day yet. */
    analysis(): Analysis | null {
      if (!this.worktime) return null
      return analyse(this.worktime.events, { allowOpen: true })
    },

    isFaulty(): boolean { return this.analysis?.status === 'faulty' },

    computed(): Recomputed {
      const a = this.analysis
      if (!this.settings || !a || a.status === 'faulty') return ZERO_RESULT
      const nowSec = secondsSinceMidnight(this.now)
      return recompute(a.punches, this.settings, nowSec)
    },

    workedMs(): number { return this.computed.workedSeconds * 1000 },
    displayMs(): number { return this.computed.displaySeconds * 1000 },
    breakState(): BreakState { return this.computed.breakState },
    breakEndsAt(): number | undefined { return this.computed.breakEndsAtMs },

    isClockedIn(): boolean {
      const a = this.analysis
      return a?.status === 'valid' && a.open
    },
    isClockedOut(): boolean {
      return this.analysis?.status === 'valid' && this.worktime!.events.length > 0 && !this.isClockedIn
    },
    isOnBreak(): boolean { return this.breakState === 'break1' || this.breakState === 'break2' },

    viewState(): ViewState {
      if (!this.worktime || this.worktime.events.length === 0) return { kind: 'clock-in' }
      if (this.isFaulty) return { kind: 'faulty' }
      if (!this.isClockedIn) return { kind: 'clocked-out' }
      if (this.isOnBreak) return { kind: 'break' }
      return { kind: 'running' }
    },

    segments(): DerivedSegment[] {
      return this.computed.segments ?? []
    },
    breakMs(): number {
      return this.computed.breakSeconds * 1000
    },
    remainingMs(): number {
      if (!this.settings) return 0
      return Math.max(0, this.settings.daily_target * 1000 - this.workedMs)
    },
    overtimeMs(): number {
      if (!this.settings) return 0
      return Math.max(0, this.workedMs - this.settings.daily_target * 1000)
    },
    workPercent(): number {
      if (!this.settings || this.settings.daily_target === 0) return 0
      return Math.min(100, (this.workedMs / (this.settings.daily_target * 1000)) * 100)
    },
    daySpanMs(): number {
      const a = this.analysis
      if (!a || a.status === 'faulty' || a.punches.length === 0) return 0
      const firstIn = a.punches[0].in
      const nowSec = secondsSinceMidnight(this.now)
      return Math.max(0, (nowSec - firstIn) * 1000)
    },
    nextMilestone(): { label: string; remainingMs: number } | null {
      if (!this.settings) return null
      const s = this.settings
      const candidates: Array<{ enabled: boolean; triggerSec: number; label: string }> = [
        { enabled: s.break1_enabled, triggerSec: s.break1_trigger, label: `${s.break1_trigger / 3600}h auto-break` },
        { enabled: s.break2_enabled, triggerSec: s.break2_trigger, label: `${s.break2_trigger / 3600}h auto-break` },
      ]
      for (const c of candidates) {
        if (!c.enabled) continue
        const triggerMs = c.triggerSec * 1000
        if (this.workedMs < triggerMs) return { label: c.label, remainingMs: triggerMs - this.workedMs }
      }
      return null
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
      if (w) this.worktime = w

      this.loadStatus = 'ready'
      startTick(this)
      await this.checkRollover()
    },

    async clockIn(backdateSec?: number) {
      if (!persistenceRequested) {
        persistenceRequested = true
        void requestPersistence()
      }
      if (this.isFaulty || this.isClockedIn || this.isOnBreak) return

      const ev: PunchEvent = { type: 'in', t: clampSec(backdateSec ?? secondsSinceMidnight(now())) }
      if (!this.worktime) {
        this.worktime = { date: todayString(new Date(now())), events: [ev] }
      } else {
        this.worktime.events = insertEvent(this.worktime.events, ev)
      }
      await this.persistAndRecompute()
    },

    async clockOut() {
      if (!this.worktime || !this.isClockedIn) return
      const last = this.worktime.events[this.worktime.events.length - 1]
      // Never place the out before its in, even if the device clock went backwards.
      const t = Math.max(last.t, clampSec(secondsSinceMidnight(now())))
      this.worktime.events = [...this.worktime.events, { type: 'out', t }]
      await this.persistAndRecompute()
    },

    async adjustStart(deltaSeconds: number) {
      if (!this.worktime || !this.isClockedIn) return
      this.worktime = adjustStart(this.worktime, deltaSeconds)
      await this.persistAndRecompute()
    },

    async editClockIn(newIn: number) {
      if (!this.worktime || !this.worktime.events.some(e => e.type === 'in')) return
      this.worktime = setFirstPunchIn(this.worktime, clampSec(newIn))
      await this.persistAndRecompute()
    },

    /**
     * Replace all events of one day. Today writes the live worktime; a past date
     * writes the history store and the calendar cache. An empty list removes the day.
     * Future dates are ignored. Faulty sequences are stored as-is (flagged via analyse).
     */
    async replaceDayEvents(date: string, events: readonly PunchEvent[]) {
      // Archive a live record left over from before midnight first, so "today"
      // and the live worktime agree before we decide where to write.
      this.now = now()
      await this.checkRollover()
      const today = todayString(new Date(this.now))
      if (date > today) return
      const normalised = normaliseEvents(events)

      if (date === today) {
        if (normalised.length === 0) {
          await clearWorktime()
          this.worktime = null
          return
        }
        this.worktime = { date, events: normalised }
        await this.persistAndRecompute()
        return
      }

      if (normalised.length === 0) {
        await deleteHistoryDay(date)
        if (this.historyCache) {
          const rest = { ...this.historyCache }
          delete rest[date]
          this.historyCache = rest
        }
        return
      }
      const day: Worktime = { date, events: normalised }
      await putHistoryDay(plain(day))
      if (this.historyCache) this.historyCache = { ...this.historyCache, [date]: day }
    },

    async setSettings(patch: Partial<Settings>) {
      if (!this.settings) return
      this.settings = applySettingsPatch(this.settings, patch)
      await putSettings(this.settings)
    },

    async persistAndRecompute() {
      if (!this.worktime) return
      this.now = now()
      await putWorktime(plain(this.worktime))
    },

    async checkRollover() {
      if (!this.worktime) return
      if (isExpired(this.worktime.date, new Date(this.now))) {
        await this.reset()
      }
    },

    async reset() {
      if (this.worktime && this.worktime.events.length > 0) {
        const archived = plain(this.worktime)
        // A valid open day is closed at 23:59:59; a faulty day is archived as-is
        // so the user can still see and fix exactly what was recorded.
        const a = analyse(archived.events, { allowOpen: true })
        if (a.status === 'valid' && a.open) {
          archived.events.push({ type: 'out', t: LAST_SEC })
        }
        await putHistoryDay(archived)
      }
      await clearWorktime()
      this.worktime = null
    },

    async loadHistoryRange(start: Date, end: Date): Promise<void> {
      const range = await getHistoryRange(ymd(start), ymd(end))
      if (this.worktime && this.worktime.events.length > 0) {
        range[this.worktime.date] = this.worktime
      }
      this.historyCache = range
    },

    async clearHistory(): Promise<void> {
      await clearHistory()
      this.historyCache = {}
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
