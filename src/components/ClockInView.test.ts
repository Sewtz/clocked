import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearAllEntries } from '@/storage/entries'
import ClockInView from './ClockInView.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearAllEntries()
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

  it('clicking +5min calls store.clockIn with Date.now() - 5min', async () => {
    const store = useClockStore()
    store.clockIn = vi.fn()
    vi.spyOn(Date, 'now').mockReturnValue(10000)
    const wrapper = mount(ClockInView)
    const buttons = wrapper.findAll('button')
    const plus5 = buttons.find(b => b.text() === '+5min')
    await plus5!.trigger('click')
    expect(store.clockIn).toHaveBeenCalledWith(10000 - 5 * 60_000)
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
    const callArg = (store.clockIn as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const d = new Date(callArg)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(30)
  })

  it('empty custom time does not call clockIn', async () => {
    const store = useClockStore()
    store.clockIn = vi.fn()
    const wrapper = mount(ClockInView)
    const input = wrapper.find('input[type="time"]')
    await input.trigger('change')
    expect(store.clockIn).not.toHaveBeenCalled()
  })
})
