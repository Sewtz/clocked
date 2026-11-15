import { addDays, mondayBasedWeekday, ymd } from '@/domain/date'
import type { PunchEvent, Worktime } from '@/domain/types'

const t = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 3600 + m * 60
}
const IN = (hhmm: string): PunchEvent => ({ type: 'in', t: t(hhmm) })
const OUT = (hhmm: string): PunchEvent => ({ type: 'out', t: t(hhmm) })

/**
 * Five example workdays, oldest first. Each shows a different part of the break
 * rules; the middle one is faulty (its 12:00 clock-out was deleted).
 */
export const DEMO_DAYS: ReadonlyArray<{ note: string; events: PunchEvent[] }> = [
  {
    note: '8h with a 30 min lunch: break1 fitted into the lunch gap',
    events: [IN('08:00'), OUT('12:00'), IN('12:30'), OUT('16:30')],
  },
  {
    note: '9h45 long day: break1 in the lunch gap, break2 injected after 9h of work',
    events: [IN('07:45'), OUT('13:45'), IN('14:15'), OUT('18:00')],
  },
  {
    note: 'Faulty: the 12:00 clock-out was deleted, so two clock-ins follow each other',
    events: [IN('08:15'), IN('12:45'), OUT('17:00')],
  },
  {
    note: '8h30 without clocking out: break1 injected after 6h of work',
    events: [IN('09:00'), OUT('17:30')],
  },
  {
    note: 'Short coffee gap (neutral) and a 45 min lunch holding break1',
    events: [IN('08:00'), OUT('10:00'), IN('10:10'), OUT('12:30'), IN('13:15'), OUT('15:00')],
  },
]

/** The five most recent weekdays (Mon–Fri) strictly before `today`, oldest first. */
export function demoDates(today: Date): string[] {
  const dates: string[] = []
  for (let d = addDays(today, -1); dates.length < DEMO_DAYS.length; d = addDays(d, -1)) {
    if (mondayBasedWeekday(d) < 5) dates.unshift(ymd(d))
  }
  return dates
}

/** The demo week as history records relative to `today`. */
export function demoWeek(today: Date): Worktime[] {
  return demoDates(today).map((date, i) => ({ date, events: DEMO_DAYS[i].events.map(e => ({ ...e })) }))
}

interface DayWriter {
  replaceDayEvents(date: string, events: readonly PunchEvent[]): Promise<void>
}

/** Write the demo week through the store (overwrites those five days only). */
export async function seedDemoWeek(store: DayWriter, today: Date): Promise<Worktime[]> {
  const week = demoWeek(today)
  for (const day of week) await store.replaceDayEvents(day.date, day.events)
  return week
}
