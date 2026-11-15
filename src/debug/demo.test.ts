import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { demoDates, demoWeek, seedDemoWeek, DEMO_DAYS } from './demo'
import { analyse, eventsToPunches } from '@/domain/events'
import { recompute } from '@/domain/recompute'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { useClockStore } from '@/stores/clock'
import { setClock } from '@/domain/clock'
import { clearHistory, getAllHistory } from '@/storage/history'
import { clearWorktime } from '@/storage/worktime'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearHistory()
  await clearWorktime()
})

const totals = (i: number) => {
  const r = recompute(eventsToPunches(DEMO_DAYS[i].events), DEFAULT_SETTINGS, 86399)
  return { worked: r.workedSeconds / 60, breaks: r.breakSeconds / 60 }
}

describe('demo week', () => {
  it('uses the five weekdays before today, skipping the weekend', () => {
    // Sunday 2026-11-15 -> Mon 9 .. Fri 13
    expect(demoDates(new Date(2026, 10, 15, 12))).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
    ])
    // Wednesday 2026-11-18 -> Wed 11, Thu 12, Fri 13, Mon 16, Tue 17
    expect(demoDates(new Date(2026, 10, 18, 12))).toEqual([
      '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17',
    ])
  })

  it('has exactly one faulty day, in the middle', () => {
    const status = demoWeek(new Date(2026, 10, 15)).map(d => analyse(d.events, { allowOpen: false }).status)
    expect(status).toEqual(['valid', 'valid', 'faulty', 'valid', 'valid'])
  })

  it('valid days produce the totals described in their notes', () => {
    expect(totals(0)).toEqual({ worked: 480, breaks: 30 }) // 8h, break1 in lunch
    expect(totals(1)).toEqual({ worked: 570, breaks: 45 }) // 9h45 gross, break2 injected
    expect(totals(3)).toEqual({ worked: 480, breaks: 30 }) // 8h30 gross, break1 injected
    expect(totals(4)).toEqual({ worked: 365, breaks: 30 }) // 6h05, break1 in lunch
  })

  it('seeds the history through the store', async () => {
    const today = new Date(2026, 10, 15, 12)
    setClock(() => today.getTime())
    const week = await seedDemoWeek(useClockStore(), today)
    const stored = (await getAllHistory()).sort((a, b) => a.date.localeCompare(b.date))
    expect(stored).toEqual(week)
  })
})
