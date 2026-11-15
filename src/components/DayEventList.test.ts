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
    expect(text).toContain('Total worked')
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
    expect(text).toContain('Total worked')
    expect(text).toContain('06:30')
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
    expect(text).not.toContain('Total worked')
  })
})
