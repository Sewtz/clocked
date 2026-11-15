import { describe, it, expect } from 'vitest'
import {
  presetRange, datesInRange, summariseDay, buildExport, toCsv, toMailText,
  exportFileName, mailSubject, balanceText, signedDur, CSV_HEADER, type ExportContext,
} from './export'
import { DEFAULT_SETTINGS } from './types'
import type { PunchEvent, Worktime } from './types'

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 3600 + m * 60
}
const IN = (hhmm: string): PunchEvent => ({ type: 'in', t: t(hhmm) })
const OUT = (hhmm: string): PunchEvent => ({ type: 'out', t: t(hhmm) })
const day = (date: string, events: PunchEvent[]): Worktime => ({ date, events })

// Sunday 15 Nov 2026, 10:00
const ctx: ExportContext = { settings: DEFAULT_SETTINGS, today: '2026-11-15', nowSec: t('10:00') }

const WEEK: Record<string, Worktime> = {
  '2026-11-09': day('2026-11-09', [IN('08:00'), OUT('12:00'), IN('12:30'), OUT('16:30')]), // 8h, 0:30
  '2026-11-10': day('2026-11-10', [IN('07:45'), OUT('13:45'), IN('14:15'), OUT('18:00')]), // 9h30, 0:45
  '2026-11-11': day('2026-11-11', [IN('08:15'), IN('12:45'), OUT('17:00')]), // faulty
  '2026-11-13': day('2026-11-13', [IN('08:00'), OUT('12:00')]), // 4h
}
const LAST_WEEK = { from: '2026-11-09', to: '2026-11-15' }

describe('presetRange', () => {
  const sunday = new Date(2026, 10, 15, 10)
  const wednesday = new Date(2026, 10, 18, 10)

  it('this week runs from Monday to today', () => {
    expect(presetRange('this-week', sunday)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(presetRange('this-week', wednesday)).toEqual({ from: '2026-11-16', to: '2026-11-18' })
  })

  it('last week is the full previous Monday–Sunday', () => {
    expect(presetRange('last-week', wednesday)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(presetRange('last-week', sunday)).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })

  it('this month runs from the 1st to today; last month is the full previous month', () => {
    expect(presetRange('this-month', sunday)).toEqual({ from: '2026-11-01', to: '2026-11-15' })
    expect(presetRange('last-month', sunday)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('last-month', new Date(2026, 0, 5))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('datesInRange', () => {
  it('lists every day inclusive, across month ends', () => {
    expect(datesInRange({ from: '2026-10-30', to: '2026-11-02' }))
      .toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('is empty for a reversed range', () => {
    expect(datesInRange({ from: '2026-11-05', to: '2026-11-01' })).toEqual([])
  })
})

describe('summariseDay', () => {
  it('summarises a valid day with totals and balance', () => {
    expect(summariseDay('2026-11-10', WEEK['2026-11-10'], ctx)).toMatchObject({
      weekday: 'Tue', status: 'ok', firstIn: t('07:45'), lastOut: t('18:00'),
      workedSec: t('09:30'), breakSec: t('00:45'), balanceSec: t('01:30'),
    })
  })

  it('flags a faulty day and keeps its raw events but no totals', () => {
    const d = summariseDay('2026-11-11', WEEK['2026-11-11'], ctx)
    expect(d).toMatchObject({ status: 'faulty', firstIn: t('08:15'), lastOut: t('17:00') })
    expect(d.workedSec).toBeUndefined()
    expect(d.events).toEqual(WEEK['2026-11-11'].events)
  })

  it('treats today with an open clock-in as open, counted up to now', () => {
    const d = summariseDay('2026-11-15', day('2026-11-15', [IN('08:00')]), ctx)
    expect(d).toMatchObject({ status: 'open', workedSec: t('02:00'), lastOut: undefined })
  })

  it('treats a past day ending clocked in as faulty', () => {
    expect(summariseDay('2026-11-12', day('2026-11-12', [IN('08:00')]), ctx).status).toBe('faulty')
  })

  it('marks a day without events as empty', () => {
    expect(summariseDay('2026-11-12', undefined, ctx)).toMatchObject({ status: 'empty', weekday: 'Thu', events: [] })
  })
})

describe('buildExport', () => {
  const data = buildExport(LAST_WEEK, WEEK, ctx)

  it('has a row for every day of the range', () => {
    expect(data.days.map(d => `${d.weekday} ${d.status}`)).toEqual([
      'Mon ok', 'Tue ok', 'Wed faulty', 'Thu empty', 'Fri ok', 'Sat empty', 'Sun empty',
    ])
  })

  it('totals only valid days and lists faulty ones', () => {
    expect(data.totals).toEqual({
      workedSec: t('08:00') + t('09:30') + t('04:00'),
      breakSec: t('00:30') + t('00:45'),
      balanceSec: 0 + t('01:30') - t('04:00'),
      dayCount: 3,
      faultyDates: ['2026-11-11'],
    })
  })
})

describe('toCsv', () => {
  const csv = toCsv(buildExport(LAST_WEEK, WEEK, ctx))
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')

  it('starts with a BOM, uses CRLF and semicolons', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(lines[0]).toBe(CSV_HEADER.join(';'))
  })

  it('writes one row per day plus a total row', () => {
    expect(lines).toHaveLength(1 + 7 + 1)
    expect(lines[1]).toBe('2026-11-09;Mon;ok;08:00;16:30;08:00;00:30;on target;480;30;0;in 08:00, out 12:00, in 12:30, out 16:30')
    expect(lines[2]).toBe('2026-11-10;Tue;ok;07:45;18:00;09:30;00:45;01:30 over;570;45;90;in 07:45, out 13:45, in 14:15, out 18:00')
    expect(lines[3]).toBe('2026-11-11;Wed;faulty;08:15;17:00;;;;;;;in 08:15, in 12:45, out 17:00')
    expect(lines[4]).toBe('2026-11-12;Thu;;;;;;;;;;')
    expect(lines[5]).toBe('2026-11-13;Fri;ok;08:00;12:00;04:00;00:00;04:00 under;240;0;-240;in 08:00, out 12:00')
    expect(lines[8]).toBe('TOTAL;;3 days, 1 faulty;;;21:30;01:15;02:30 under;1290;75;-150;')
  })

  it('never starts a cell with + or - except the minute columns (no spreadsheet formulas)', () => {
    for (const line of lines.slice(1)) {
      const cells = line.split(';')
      cells.forEach((c, i) => {
        if (CSV_HEADER[i]?.endsWith('_min')) return
        expect(c).not.toMatch(/^[=+\-@]/)
      })
    }
  })

  it('quotes cells containing the separator or quotes', () => {
    const data = buildExport({ from: '2026-11-09', to: '2026-11-09' }, WEEK, ctx)
    data.days[0].weekday = 'Mo;n "x"'
    expect(toCsv(data)).toContain('"Mo;n ""x"""')
  })
})

describe('mail text', () => {
  const data = buildExport(LAST_WEEK, WEEK, ctx)

  it('has a subject and file name for the range', () => {
    expect(mailSubject(LAST_WEEK)).toBe('Working times 2026-11-09 – 2026-11-15')
    expect(mailSubject({ from: '2026-11-09', to: '2026-11-09' })).toBe('Working times 2026-11-09')
    expect(exportFileName(LAST_WEEK)).toBe('clocked_2026-11-09_2026-11-15.csv')
  })

  it('formats the days with events as a table with a total row, then the faulty days', () => {
    const rule = ['-'.repeat(14), '-'.repeat(5), '-'.repeat(5), '-'.repeat(6), '-'.repeat(6), '-'.repeat(7)].join('-+-')
    expect(toMailText(data).split('\n')).toEqual([
      'Working times 2026-11-09 – 2026-11-15',
      '',
      'Day            | In    | Out   | Worked | Breaks | Balance',
      rule,
      'Mon 2026-11-09 | 08:00 | 16:30 |  08:00 |  00:30 |  ±00:00',
      'Tue 2026-11-10 | 07:45 | 18:00 |  09:30 |  00:45 |  +01:30',
      'Wed 2026-11-11 | 08:15 | 17:00 |      – |      – |  FAULTY',
      'Fri 2026-11-13 | 08:00 | 12:00 |  04:00 |  00:00 |  -04:00',
      rule,
      'Total (3 days) |       |       |  21:30 |  01:15 |  -02:30',
      '',
      '1 day has inconsistent clock times and is not included in the totals:',
      '  Wed 2026-11-11: in 08:15, in 12:45, out 17:00',
      '',
      'Details: see the attached file clocked_2026-11-09_2026-11-15.csv.',
    ])
  })

  it('all table rows have the same width', () => {
    const table = toMailText(data).split('\n').slice(2, 10)
    // trailing spaces are trimmed, so compare the column separators' positions instead
    const pipes = (l: string) => [...l].flatMap((c, i) => (c === '|' ? [i] : []))
    for (const line of table.filter(l => l.includes('|'))) expect(pipes(line)).toEqual(pipes(table[0]))
  })

  it('the mail draft (no attachment) has the same table but no attachment line', () => {
    const draft = toMailText(data, { attached: false })
    expect(draft).toContain('Mon 2026-11-09 | 08:00 | 16:30 |  08:00 |  00:30 |  ±00:00')
    expect(draft).toContain('Total (3 days) |       |       |  21:30 |  01:15 |  -02:30')
    expect(draft).not.toContain('attached')
    expect(draft.trimEnd().endsWith('Wed 2026-11-11: in 08:15, in 12:45, out 17:00')).toBe(true)
  })

  it('maxDayRows hides later rows but keeps the full total', () => {
    const text = toMailText(data, { attached: false, maxDayRows: 2 })
    expect(text).toContain('Tue 2026-11-10 |')
    expect(text).not.toContain('Fri 2026-11-13 |')
    expect(text).toContain('… 2 days more')
    expect(text).toContain('(2 days not shown — the mail draft is limited in length.)')
    expect(text).toContain('Total (3 days) |')
    expect(text).toContain('21:30')
  })

  it('shows an open day as running until now', () => {
    const today = buildExport({ from: '2026-11-15', to: '2026-11-15' }, { '2026-11-15': day('2026-11-15', [IN('08:00')]) }, ctx)
    expect(toMailText(today)).toContain('Sun 2026-11-15 | 08:00 | now |  02:00 |')
  })

  it('says so when nothing was recorded', () => {
    expect(toMailText(buildExport({ from: '2026-11-14', to: '2026-11-15' }, {}, ctx)))
      .toContain('No working times recorded in this period.')
  })
})

describe('signedDur', () => {
  it('signs the mail balance', () => {
    expect(signedDur(5400)).toBe('+01:30')
    expect(signedDur(-6900)).toBe('-01:55')
    expect(signedDur(20)).toBe('±00:00')
  })
})

describe('balanceText', () => {
  it('uses words instead of a sign', () => {
    expect(balanceText(5400)).toBe('01:30 over')
    expect(balanceText(-6900)).toBe('01:55 under')
    expect(balanceText(0)).toBe('on target')
    expect(balanceText(30)).toBe('on target')
  })
})
