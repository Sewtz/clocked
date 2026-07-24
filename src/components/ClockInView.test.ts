import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import ClockInView from './ClockInView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ClockInView', () => {
  it('renders Clock In button and hint when no worktime', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(ClockInView)
    expect(wrapper.text()).toContain('Clock In')
    expect(wrapper.text()).toContain('Press clock in to start tracking')
  })

  it('does not render Worked today when no worktime', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(ClockInView)
    expect(wrapper.text()).not.toContain('Worked today')
  })

  it('renders worked today and stats when clocked out', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0, out: 3600 }] }
    store.now = 3600 * 1000
    const wrapper = mount(ClockInView)
    expect(wrapper.text()).toContain('Worked today')
    expect(wrapper.text()).toContain('Worked')
    expect(wrapper.text()).toContain('Breaks')
    expect(wrapper.text()).toContain('Daily target')
  })

  it('calls store.clockIn on button click', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const spy = vi.spyOn(store, 'clockIn')
    const wrapper = mount(ClockInView)
    await wrapper.find('button.bg-work').trigger('click')
    expect(spy).toHaveBeenCalled()
  })

  it('has rectangular green button', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(ClockInView)
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('bg-work')
  })

  it('does not render old WP4 affordances', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0, out: 3600 }] }
    store.now = 3600 * 1000
    const wrapper = mount(ClockInView)
    expect(wrapper.find('input[type="time"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('+1min')
    expect(wrapper.text()).not.toContain('+5min')
    expect(wrapper.text()).not.toContain('Reset day')
  })
})
