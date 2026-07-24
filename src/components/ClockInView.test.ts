import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearWorktime } from '@/storage/worktime'
import { setClock } from '@/domain/clock'
import ClockInView from './ClockInView.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  setClock(() => 0)
})

describe('ClockInView', () => {
  it('renders the Clock In button', () => {
    const wrapper = mount(ClockInView)
    expect(wrapper.text()).toContain('Clock In')
  })

  it('clicking the big button calls store.clockIn()', async () => {
    const store = useClockStore()
    store.clockIn = vi.fn()
    const wrapper = mount(ClockInView)
    await wrapper.find('button.rounded-full').trigger('click')
    expect(store.clockIn).toHaveBeenCalledWith()
  })

  it('clicking +5min calls store.clockIn with backdated seconds', async () => {
    const store = useClockStore()
    store.clockIn = vi.fn()
    vi.spyOn(Date, 'now').mockReturnValue(10000)
    const wrapper = mount(ClockInView)
    const buttons = wrapper.findAll('button')
    const plus5 = buttons.find(b => b.text() === '+5min')
    await plus5!.trigger('click')
    expect(store.clockIn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('entering custom time and triggering change calls store.clockIn', async () => {
    const store = useClockStore()
    store.clockIn = vi.fn()
    const wrapper = mount(ClockInView)
    const input = wrapper.find('input[type="time"]')
    await input.setValue('09:30')
    await input.trigger('change')
    expect(store.clockIn).toHaveBeenCalled()
  })

  it('empty custom time does not call clockIn', async () => {
    const store = useClockStore()
    store.clockIn = vi.fn()
    const wrapper = mount(ClockInView)
    const input = wrapper.find('input[type="time"]')
    await input.trigger('change')
    expect(store.clockIn).not.toHaveBeenCalled()
  })

  it('shows worked time account when clocked out', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    store.settings = { daily_target: 28800, daily_limit: 36000, break1_enabled: false, break2_enabled: false, break1_trigger: 21600, break1_duration: 1800, break2_trigger: 32400, break2_duration: 900 }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    const wrapper = mount(ClockInView)
    expect(wrapper.text()).toContain('01:00')
    expect(wrapper.text()).toContain('Worked today')
  })

  it('does not show worked time account in fresh clock-in state', () => {
    const wrapper = mount(ClockInView)
    expect(wrapper.text()).not.toContain('Worked today')
  })

  it('renders Reset day button when clocked out and calls store.reset', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    store.settings = { daily_target: 28800, daily_limit: 36000, break1_enabled: false, break2_enabled: false, break1_trigger: 21600, break1_duration: 1800, break2_trigger: 32400, break2_duration: 900 }
    await store.clockIn()
    setClock(() => t + 3600_000)
    await store.clockOut()
    store.reset = vi.fn()
    const wrapper = mount(ClockInView)
    const buttons = wrapper.findAll('button')
    const reset = buttons.find(b => b.text() === 'Reset day')
    expect(reset).toBeDefined()
    await reset!.trigger('click')
    expect(store.reset).toHaveBeenCalled()
  })

  it('does not render Reset day button in fresh clock-in state', () => {
    const wrapper = mount(ClockInView)
    const buttons = wrapper.findAll('button')
    const reset = buttons.find(b => b.text() === 'Reset day')
    expect(reset).toBeUndefined()
  })
})
