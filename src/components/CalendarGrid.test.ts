import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarGrid from './CalendarGrid.vue'
import type { Worktime } from '@/domain/types'
import { punchesToEvents } from '@/domain/events'

const DAY_A: Worktime = { date: '2026-08-17', events: punchesToEvents([{ in: 28800 }]) }
const DAY_B: Worktime = { date: '2026-08-18', events: punchesToEvents([{ in: 0, out: 1 }]) }

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
    expect(selected.classes()).toEqual(expect.arrayContaining(['border-2', 'border-work', 'bg-work/15']))
    expect(selected.find('span').classes()).toEqual(expect.arrayContaining(['text-work', 'font-bold']))
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

  it('marks a faulty day with a red dot and a faulty label', () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: {
          '2026-08-17': { date: '2026-08-17', events: [{ type: 'in', t: 1 }, { type: 'in', t: 2 }] },
          '2026-08-18': DAY_B,
        },
        selectedDate: null,
      },
    })
    const faulty = wrapper.find('button[aria-label="2026-08-17, faulty"]')
    expect(faulty.exists()).toBe(true)
    expect(faulty.find('[data-status]').attributes('data-status')).toBe('faulty')
    expect(faulty.find('[data-status]').attributes('style')).toContain('var(--color-overtime)')
    const valid = wrapper.find('button[aria-label="2026-08-18"]')
    expect(valid.find('[data-status]').attributes('data-status')).toBe('valid')
  })

  it('treats an open day as valid today but faulty in the past', () => {
    const open = (date: string): Worktime => ({ date, events: [{ type: 'in', t: 28800 }] })
    const wrapper = mount(CalendarGrid, {
      props: {
        today: new Date(2026, 7, 19, 12, 0),
        history: { '2026-08-18': open('2026-08-18'), '2026-08-19': open('2026-08-19') },
        selectedDate: null,
      },
    })
    expect(wrapper.find('button[aria-label="2026-08-18, faulty"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="2026-08-19"] [data-status]').attributes('data-status')).toBe('valid')
  })

  it('marks only the selected cell with the accent border, also when it is today', () => {
    const wrapper = mount(CalendarGrid, {
      props: { today: new Date(2026, 7, 19, 12, 0), history: {}, selectedDate: '2026-08-19' },
    })
    const accented = wrapper.findAll('button').filter(b => b.classes().includes('border-work'))
    expect(accented.map(b => b.attributes('aria-label'))).toEqual(['2026-08-19'])
    // An unselected day keeps the plain border
    expect(wrapper.find('button[aria-label="2026-08-18"]').classes()).toContain('border-border')
  })
})
