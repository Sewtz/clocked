import { defineStore } from 'pinia'
import { getEntry, putEntry, deleteEntry } from '@/storage/entries'
import { requestPersistence } from '@/storage/persist'
import { todayString, isExpired } from '@/domain/date'
import { recomputeBreaks } from '@/domain/recomputeBreaks'
import { adjustOpenWorkSegmentStart, setFirstWorkSegmentStart } from '@/domain/adjust'
import type { Entry, Segment, BreakState, ViewState } from '@/domain/types'
import type { AdjustmentMinutes } from '@/domain/adjust'

type LoadStatus = 'idle' | 'loading' | 'ready'

let persistenceRequested = false
let tickTimer: ReturnType<typeof setInterval> | null = null

export function startTick(store: ReturnType<typeof useClockStore>) {
  if (tickTimer !== null) return
  tickTimer = setInterval(() => {
    store.now = Date.now()
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
    entry: null as Entry | null,
    now: Date.now(),
    _isClockedIn: false,
  }),

  getters: {
    recomputeResult(state): ReturnType<typeof recomputeBreaks> {
      if (!state.entry) {
        return { segments: [], state: 'running' as const, workedMs: 0, displayMs: 0, breakEndsAt: undefined }
      }
      return recomputeBreaks(state.entry.segments, state.now)
    },

    workedMs(): number {
      return this.recomputeResult.workedMs
    },

    displayMs(): number {
      return this.recomputeResult.displayMs
    },

    breakState(): BreakState {
      return this.recomputeResult.state
    },

    breakEndsAt(): number | undefined {
      return this.recomputeResult.breakEndsAt
    },

    currentSegment(state): Segment | null {
      if (!state.entry) return null
      const segs = state.entry.segments
      return segs[segs.length - 1] ?? null
    },

    isClockedIn(): boolean {
      return !!this.entry && this._isClockedIn
    },

    isClockedOut(): boolean {
      return !!this.entry && !this._isClockedIn && !this.isOnBreak
    },

    isOnBreak(): boolean {
      return this.breakState === 'break30' || this.breakState === 'break15'
    },

    viewState(): ViewState {
      if (!this.entry) return { kind: 'clock-in' }
      if (this.isOnBreak) return { kind: 'break' }
      if (this._isClockedIn) return { kind: 'running' }
      return { kind: 'clocked-out' }
    },
  },

  actions: {
    async load() {
      this.loadStatus = 'loading'
      const date = todayString(new Date(this.now))
      const entry = await getEntry(date)
      if (entry) {
        this.entry = entry
        this._isClockedIn = entry.segments.length > 0
          && entry.segments[entry.segments.length - 1].type === 'work'
          && entry.segments[entry.segments.length - 1].end === undefined
      }
      this.loadStatus = 'ready'
    },

    async init() {
      await this.load()
      this.loadStatus = 'ready'
      startTick(this)
      await this.checkRollover()
    },

    async clockIn(startMs?: number) {
      if (!persistenceRequested) {
        persistenceRequested = true
        void requestPersistence()
      }
      const start = startMs ?? Date.now()
      const date = todayString(new Date(start))
      if (this.entry && this.entry.date !== date) {
        await this.reset()
      }
      if (this.entry) {
        if (this._isClockedIn) return
        if (this.isOnBreak) return
        this.entry.segments.push({ type: 'work', start })
      } else {
        this.entry = { date, segments: [{ type: 'work', start }] }
      }
      this._isClockedIn = true
      if (this.now > start) {
        await this.persistAndRecompute()
      } else {
        await putEntry(JSON.parse(JSON.stringify(this.entry)))
      }
    },

    async clockOut() {
      if (!this.entry || !this._isClockedIn) return
      const last = this.entry.segments[this.entry.segments.length - 1]
      if (!last || last.type !== 'work') return
      last.end = this.now
      this._isClockedIn = false
      await this.persistAndRecompute()
    },

    async persistAndRecompute() {
      if (!this.entry) return
      const result = recomputeBreaks(this.entry.segments, this.now)
      let segments = result.segments.length > 0
        ? result.segments
        : this.entry.segments
      if (this._isClockedIn && segments.length > 0) {
        const last = segments[segments.length - 1]
        if (last.type === 'work') {
          segments = [...segments.slice(0, -1), { type: 'work', start: last.start }]
        }
      }
      this.entry.segments = segments
      await putEntry(JSON.parse(JSON.stringify(this.entry)))
    },

    async reset() {
      if (this.entry) {
        await deleteEntry(this.entry.date)
      }
      this.entry = null
      this._isClockedIn = false
    },

    async adjustStart(minutes: AdjustmentMinutes) {
      if (!this.entry || !this._isClockedIn) return
      const last = this.entry.segments[this.entry.segments.length - 1]
      if (!last || last.type !== 'work' || last.end !== undefined) return
      this.entry.segments = adjustOpenWorkSegmentStart(this.entry.segments, minutes)
      await this.persistAndRecompute()
    },

    async editClockIn(newStart: number) {
      if (!this.entry) return
      const first = this.entry.segments[0]
      if (!first || first.type !== 'work') return
      this.entry.segments = setFirstWorkSegmentStart(this.entry.segments, newStart)
      await this.persistAndRecompute()
    },

    async onVisible() {
      this.now = Date.now()
      if (this.entry) {
        await this.persistAndRecompute()
      }
      await this.checkRollover()
    },

    async checkRollover() {
      if (!this.entry) return
      if (isExpired(this.entry.date, new Date(this.now))) {
        await this.reset()
      }
    },
  },
})
