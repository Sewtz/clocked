import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarGrid from './CalendarGrid.vue'
import type { Worktime } from '@/domain/types'

const DAY_A: Worktime = { date: '2026-08-17', punches: [{ in: 28800 }] }
const DAY_B: Worktime = { date: '2026-08-18', punches: [{ in: 0, out: 1 }] }

describe('CalendarGrid', () => {
  it('renders header and 28 cells', () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: {},
        selectedDate: null,
      },
    })
    expect(wrapper.findAll('button')).toHaveLength(28)
    const text = wrapper.text()
    expect(text).toContain('Mon')
    expect(text).toContain('Sun')
  })

  it('shows a green dot for days with data', () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: { '2026-08-17': DAY_A, '2026-08-18': DAY_B },
        selectedDate: null,
      },
    })
    expect(wrapper.findAll('.rounded-full')).toHaveLength(2)
  })

  it('renders no dots with empty history', () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: {},
        selectedDate: null,
      },
    })
    expect(wrapper.findAll('.rounded-full')).toHaveLength(0)
  })

  it('highlights today with a distinct border', () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: {},
        selectedDate: null,
      },
    })
    const todayCell = wrapper.find('button[aria-label="2026-08-19"]')
    expect(todayCell.classes()).toContain('border-text-dim')
  })

  it('marks the selected cell and emits select on click', async () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: {},
        selectedDate: '2026-08-18',
      },
    })
    const selected = wrapper.find('button[aria-label="2026-08-18"]')
    expect(selected.attributes('aria-pressed')).toBe('true')
    expect(selected.classes()).toContain('bg-surface-2')
    await selected.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['2026-08-18']])
  })

  it('renders 28 cells spanning 4 Mon-Sun weeks', () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: {},
        selectedDate: null,
      },
    })
    const labels = wrapper.findAll('button').map(b => b.attributes('aria-label'))
    expect(labels[0]).toBe('2026-07-27')
    expect(labels[27]).toBe('2026-08-23')
  })
})