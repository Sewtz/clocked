import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DayEventList from './DayEventList.vue'
import { DEFAULT_SETTINGS } from '@/domain/types'
import type { Worktime } from '@/domain/types'
import { punchesToEvents } from '@/domain/events'

const CLOSED_DAY: Worktime = { date: '2026-08-17', events: punchesToEvents([{ in: 28800, out: 32400 }]) }

describe('DayEventList', () => {
  it('shows a message when worktime is null', () => {
    const wrapper = mount(DayEventList, {
      props: { worktime: null, settings: DEFAULT_SETTINGS, nowSec: 0 },
    })
    expect(wrapper.text()).toContain('No events for this day.')
  })

  it('shows a message when the day has no punches', () => {
    const wrapper = mount(DayEventList, {
      props: { worktime: { date: '2026-08-17', events: punchesToEvents([]) }, settings: DEFAULT_SETTINGS, nowSec: 0 },
    })
    expect(wrapper.text()).toContain('No events for this day.')
  })

  it('renders a closed punch as a work segment with times and duration', () => {
    const wrapper = mount(DayEventList, {
      props: { worktime: CLOSED_DAY, settings: DEFAULT_SETTINGS, nowSec: 0 },
    })
    const text = wrapper.text()
    expect(text).toContain('Work')
    expect(text).toContain('08:00 – 09:00')
    expect(text).toContain('01:00')
    expect(wrapper.find('[data-testid="day-worked"]').text()).toBe('01:00')
  })

  it('renders an open punch with a live end time', () => {
    const wrapper = mount(DayEventList, {
      props: {
        worktime: { date: '2026-08-17', events: punchesToEvents([{ in: 28800 }]) },
        settings: DEFAULT_SETTINGS,
        nowSec: 36000,
        isToday: true,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('08:00 – 10:00')
    expect(text).toContain('02:00')
  })

  it('renders a mandatory break segment when the trigger fires', () => {
    const wrapper = mount(DayEventList, {
      props: {
        worktime: { date: '2026-08-17', events: punchesToEvents([{ in: 0 }]) },
        settings: DEFAULT_SETTINGS,
        nowSec: 25200,
        isToday: true,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Break')
    expect(wrapper.find('[data-testid="day-worked"]').text()).toBe('06:30')
    expect(wrapper.find('[data-testid="day-breaks"]').text()).toBe('00:30')
  })

  it('renders gap and work segments for a multi-punch day', () => {
    const wrapper = mount(DayEventList, {
      props: {
        worktime: { date: '2026-08-17', events: punchesToEvents([{ in: 28800, out: 32400 }, { in: 39600, out: 43200 }]) },
        settings: DEFAULT_SETTINGS,
        nowSec: 43200,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Gap')
    expect(text).toContain('Work')
  })

  it('flags a trailing clock-in on a past day as faulty', () => {
    const wrapper = mount(DayEventList, {
      props: {
        worktime: { date: '2026-08-17', events: punchesToEvents([{ in: 28800 }]) },
        settings: DEFAULT_SETTINGS,
        nowSec: 86399,
      },
    })
    expect(wrapper.find('[data-testid="faulty-day-list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Past day ends clocked in')
  })

  it('shows raw events with issue hints and no totals for a faulty day', () => {
    const wrapper = mount(DayEventList, {
      props: {
        worktime: {
          date: '2026-08-17',
          events: [{ type: 'in', t: 28800 }, { type: 'in', t: 36000 }, { type: 'out', t: 39600 }],
        },
        settings: DEFAULT_SETTINGS,
        nowSec: 86399,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('08:00')
    expect(text).toContain('10:00')
    expect(text).toContain('Two clock-ins in a row')
    expect(text).toContain('totals unavailable')
    const summary = wrapper.find('[data-testid="day-summary"]')
    expect(summary.find('[data-testid="day-worked"]').text()).toBe('—')
    expect(summary.find('[data-testid="day-balance"]').text()).toBe('—')
  })

  describe('day summary above the events', () => {
    const day = (punches: Array<{ in: number; out?: number }>) =>
      ({ date: '2026-08-17', events: punchesToEvents(punches) })
    const mountDay = (punches: Array<{ in: number; out?: number }>, extra: Record<string, unknown> = {}) =>
      mount(DayEventList, { props: { worktime: day(punches), settings: DEFAULT_SETTINGS, nowSec: 86399, ...extra } })
    const get = (w: ReturnType<typeof mountDay>, id: string) => w.find(`[data-testid="${id}"]`).text()

    it('is rendered before the segment list', () => {
      const w = mountDay([{ in: 28800, out: 43200 }, { in: 45000, out: 59400 }])
      const html = w.html()
      expect(html.indexOf('data-testid="day-summary"')).toBeLessThan(html.indexOf('08:00 – 12:00'))
    })

    it('shows overtime past the daily target', () => {
      // 08:00-12:00, 12:30-17:00 -> 8h30 worked, 30 min break in the lunch gap
      const w = mountDay([{ in: 28800, out: 43200 }, { in: 45000, out: 61200 }])
      expect(get(w, 'day-worked')).toBe('08:30')
      expect(get(w, 'day-breaks')).toBe('00:30')
      expect(get(w, 'day-balance')).toBe('+00:30')
      expect(get(w, 'day-balance-label')).toBe('Overtime')
    })

    it('shows undertime below the daily target on a past day', () => {
      const w = mountDay([{ in: 28800, out: 43200 }]) // 4h
      expect(get(w, 'day-balance')).toBe('−04:00')
      expect(get(w, 'day-balance-label')).toBe('Undertime')
    })

    it('shows "On target" when worked equals the target', () => {
      const w = mountDay([{ in: 28800, out: 43200 }, { in: 45000, out: 59400 }]) // 4h + 4h
      expect(get(w, 'day-balance')).toBe('00:00')
      expect(get(w, 'day-balance-label')).toBe('On target')
    })

    it('shows the remaining time for today while below target', () => {
      const w = mountDay([{ in: 28800 }], { nowSec: 36000, isToday: true }) // 2h so far
      expect(get(w, 'day-balance')).toBe('06:00')
      expect(get(w, 'day-balance-label')).toBe('Remaining')
    })

    it('is not shown for a day without events', () => {
      const w = mount(DayEventList, { props: { worktime: null, settings: DEFAULT_SETTINGS, nowSec: 0 } })
      expect(w.find('[data-testid="day-summary"]').exists()).toBe(false)
    })
  })
})
