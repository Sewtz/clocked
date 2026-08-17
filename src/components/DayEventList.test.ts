import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DayEventList from './DayEventList.vue'
import { DEFAULT_SETTINGS } from '@/domain/types'
import type { Worktime } from '@/domain/types'

const CLOSED_DAY: Worktime = { date: '2026-08-17', punches: [{ in: 28800, out: 32400 }] }

describe('DayEventList', () => {
  it('shows a message when worktime is null', () => {
    const wrapper = mount(DayEventList, {
      props: { worktime: null, settings: DEFAULT_SETTINGS, nowSec: 0 },
    })
    expect(wrapper.text()).toContain('No events for this day.')
  })

  it('shows a message when the day has no punches', () => {
    const wrapper = mount(DayEventList, {
      props: { worktime: { date: '2026-08-17', punches: [] }, settings: DEFAULT_SETTINGS, nowSec: 0 },
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
        worktime: { date: '2026-08-17', punches: [{ in: 28800 }] },
        settings: DEFAULT_SETTINGS,
        nowSec: 36000,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('08:00 – 10:00')
    expect(text).toContain('02:00')
  })

  it('renders a mandatory break segment when the trigger fires', () => {
    const wrapper = mount(DayEventList, {
      props: {
        worktime: { date: '2026-08-17', punches: [{ in: 0 }] },
        settings: DEFAULT_SETTINGS,
        nowSec: 25200,
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
        worktime: { date: '2026-08-17', punches: [{ in: 28800, out: 32400 }, { in: 39600, out: 43200 }] },
        settings: DEFAULT_SETTINGS,
        nowSec: 43200,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Gap')
    expect(text).toContain('Work')
  })
})