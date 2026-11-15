import { analyse } from './events'
import { recompute } from './recompute'
import { addDays, startOfWeekMonday, ymd } from './date'
import { formatHHMM, secToTimeInput } from './format'
import type { PunchEvent, Settings, Worktime } from './types'

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type RangePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month'

export interface DateRange {
  from: string // YYYY-MM-DD, inclusive
  to: string // YYYY-MM-DD, inclusive
}

/** Weeks start on Monday. "This …" ranges end today (no future days). */
export function presetRange(preset: RangePreset, today: Date): DateRange {
  switch (preset) {
    case 'this-week':
      return { from: ymd(startOfWeekMonday(today)), to: ymd(today) }
    case 'last-week': {
      const monday = addDays(startOfWeekMonday(today), -7)
      return { from: ymd(monday), to: ymd(addDays(monday, 6)) }
    }
    case 'this-month':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) }
    case 'last-month':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      }
  }
}

/** Every calendar day from `from` to `to` (inclusive); empty if the range is reversed. */
export function datesInRange({ from, to }: DateRange): string[] {
  const out: string[] = []
  const [y, m, d] = from.split('-').map(Number)
  for (let day = new Date(y, m - 1, d); ymd(day) <= to; day = addDays(day, 1)) out.push(ymd(day))
  return out
}

// ---------------------------------------------------------------------------
// Day rows and totals
// ---------------------------------------------------------------------------

/** ok = valid closed day, open = today and still clocked in, faulty = inconsistent, empty = no events. */
export type ExportStatus = 'ok' | 'open' | 'faulty' | 'empty'

export interface ExportDay {
  date: string
  weekday: string // Mon … Sun
  status: ExportStatus
  events: PunchEvent[]
  firstIn?: number // seconds since midnight
  lastOut?: number
  workedSec?: number // only for ok/open days
  breakSec?: number
  balanceSec?: number // worked − daily target
}

export interface ExportTotals {
  workedSec: number
  breakSec: number
  balanceSec: number
  /** Days that count towards the totals (ok + open). */
  dayCount: number
  faultyDates: string[]
}

export interface ExportData {
  range: DateRange
  days: ExportDay[]
  totals: ExportTotals
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

export interface ExportContext {
  settings: Settings
  /** Today's date (YYYY-MM-DD): may end with an open clock-in. */
  today: string
  /** Seconds since midnight now, used for today's open punch. */
  nowSec: number
}

export function summariseDay(date: string, worktime: Worktime | undefined, ctx: ExportContext): ExportDay {
  const events = (worktime?.events ?? []).map(e => ({ ...e }))
  const base = { date, weekday: weekdayOf(date), events }
  if (events.length === 0) return { ...base, status: 'empty' }

  const firstIn = events.find(e => e.type === 'in')?.t
  const lastOutEvent = [...events].reverse().find(e => e.type === 'out')
  const isToday = date === ctx.today
  const a = analyse(events, { allowOpen: isToday })
  if (a.status === 'faulty') return { ...base, status: 'faulty', firstIn, lastOut: lastOutEvent?.t }

  const r = recompute(a.punches, ctx.settings, isToday ? ctx.nowSec : 86399)
  return {
    ...base,
    status: a.open ? 'open' : 'ok',
    firstIn,
    lastOut: a.open ? undefined : lastOutEvent?.t,
    workedSec: r.workedSeconds,
    breakSec: r.breakSeconds,
    balanceSec: r.workedSeconds - ctx.settings.daily_target,
  }
}

/** Build the export for a range from the stored days (missing dates are empty days). */
export function buildExport(range: DateRange, days: Record<string, Worktime>, ctx: ExportContext): ExportData {
  const rows = datesInRange(range).map(date => summariseDay(date, days[date], ctx))
  const totals: ExportTotals = { workedSec: 0, breakSec: 0, balanceSec: 0, dayCount: 0, faultyDates: [] }
  for (const d of rows) {
    if (d.status === 'faulty') totals.faultyDates.push(d.date)
    if (d.status !== 'ok' && d.status !== 'open') continue
    totals.workedSec += d.workedSec ?? 0
    totals.breakSec += d.breakSec ?? 0
    totals.balanceSec += d.balanceSec ?? 0
    totals.dayCount++
  }
  return { range, days: rows, totals }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Duration as HH:MM (hours may exceed 24). */
export const dur = (sec: number) => formatHHMM(Math.max(0, sec) * 1000)

/**
 * Balance as words, not "+01:30": spreadsheet apps treat a leading + or - as a formula.
 */
export function balanceText(sec: number): string {
  if (Math.abs(sec) < 60) return 'on target'
  return `${dur(Math.abs(sec))} ${sec > 0 ? 'over' : 'under'}`
}

const minutes = (sec: number | undefined) => (sec === undefined ? '' : String(Math.round(sec / 60)))
const clock = (sec: number | undefined) => (sec === undefined ? '' : secToTimeInput(sec))
const eventsText = (events: PunchEvent[]) => events.map(e => `${e.type} ${secToTimeInput(e.t)}`).join(', ')

const CSV_SEPARATOR = ';'

function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export const CSV_HEADER = [
  'date', 'weekday', 'status', 'first_in', 'last_out', 'worked', 'breaks', 'balance',
  'worked_min', 'breaks_min', 'balance_min', 'events',
] as const

/**
 * Semicolon-separated CSV with a UTF-8 BOM and CRLF line endings, so Excel (also in
 * German locales), Numbers, LibreOffice and Google Sheets open it as columns. One row per
 * calendar day in the range, then a TOTAL row. `events` holds the raw clock events.
 */
export function toCsv(data: ExportData): string {
  const lines: string[][] = [[...CSV_HEADER]]
  for (const d of data.days) {
    const counted = d.status === 'ok' || d.status === 'open'
    lines.push([
      d.date, d.weekday, d.status === 'empty' ? '' : d.status,
      clock(d.firstIn), clock(d.lastOut),
      counted ? dur(d.workedSec!) : '', counted ? dur(d.breakSec!) : '', counted ? balanceText(d.balanceSec!) : '',
      minutes(d.workedSec), minutes(d.breakSec), minutes(d.balanceSec),
      eventsText(d.events),
    ])
  }
  const t = data.totals
  lines.push([
    'TOTAL', '', `${t.dayCount} days${t.faultyDates.length ? `, ${t.faultyDates.length} faulty` : ''}`, '', '',
    dur(t.workedSec), dur(t.breakSec), balanceText(t.balanceSec),
    minutes(t.workedSec), minutes(t.breakSec), minutes(t.balanceSec), '',
  ])
  return '\uFEFF' + lines.map(cells => cells.map(csvCell).join(CSV_SEPARATOR)).join('\r\n') + '\r\n'
}

export function exportFileName(range: DateRange): string {
  return `clocked_${range.from}_${range.to}.csv`
}

export function mailSubject(range: DateRange): string {
  return range.from === range.to ? `Working times ${range.from}` : `Working times ${range.from} – ${range.to}`
}

/** Plain-text summary for the mail body (days with events only, plus totals). */
export function toMailText(data: ExportData, opts: { attachmentHint: 'attached' | 'downloaded' } = { attachmentHint: 'attached' }): string {
  const out: string[] = [mailSubject(data.range), '']
  const withEvents = data.days.filter(d => d.status !== 'empty')
  if (withEvents.length === 0) out.push('No working times recorded in this period.')
  for (const d of withEvents) {
    const day = `${d.weekday} ${d.date}`
    if (d.status === 'faulty') {
      out.push(`${day}   FAULTY – clock times inconsistent (${eventsText(d.events)})`)
      continue
    }
    const span = `${clock(d.firstIn)}–${d.status === 'open' ? 'now' : clock(d.lastOut)}`
    out.push(`${day}   ${span}   worked ${dur(d.workedSec!)}   breaks ${dur(d.breakSec!)}   ${balanceText(d.balanceSec!)}`)
  }
  const t = data.totals
  out.push('')
  out.push(`Total (${t.dayCount} ${t.dayCount === 1 ? 'day' : 'days'}): worked ${dur(t.workedSec)} · breaks ${dur(t.breakSec)} · ${balanceText(t.balanceSec)}`)
  if (t.faultyDates.length > 0) {
    out.push(`Note: ${t.faultyDates.length} ${t.faultyDates.length === 1 ? 'day has' : 'days have'} inconsistent clock times and ${t.faultyDates.length === 1 ? 'is' : 'are'} not included in the totals (${t.faultyDates.join(', ')}).`)
  }
  out.push('')
  out.push(opts.attachmentHint === 'attached'
    ? `Details: see the attached file ${exportFileName(data.range)}.`
    : `Details: please attach the downloaded file ${exportFileName(data.range)}.`)
  return out.join('\n')
}
