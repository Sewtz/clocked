import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearWorktime } from '@/storage/worktime'
import { setClock } from '@/domain/clock'
import RunningView from './RunningView.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  setClock(() => 0)
})

describe('RunningView', () => {
  it('renders formatHHMM(displayMs)', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    store.settings = { daily_target: 28800, daily_limit: 36000, break1_enabled: false, break2_enabled: false, break1_trigger: 21600, break1_duration: 1800, break2_trigger: 32400, break2_duration: 900 }
    await store.clockIn()
    setClock(() => t + 3600_000)
    store.now = t + 3600_000
    const wrapper = mount(RunningView)
    expect(wrapper.text()).toContain('01:00')
  })

  it('clicking Clock Out calls store.clockOut', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    store.settings = { daily_target: 28800, daily_limit: 36000, break1_enabled: false, break2_enabled: false, break1_trigger: 21600, break1_duration: 1800, break2_trigger: 32400, break2_duration: 900 }
    await store.clockIn()
    store.clockOut = vi.fn()
    const wrapper = mount(RunningView)
    const buttons = wrapper.findAll('button')
    const btn = buttons.find(b => b.text() === 'Clock Out')
    await btn!.trigger('click')
    expect(store.clockOut).toHaveBeenCalled()
  })

  it('clicking +5min calls store.adjustStart(60 * 5)', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    store.settings = { daily_target: 28800, daily_limit: 36000, break1_enabled: false, break2_enabled: false, break1_trigger: 21600, break1_duration: 1800, break2_trigger: 32400, break2_duration: 900 }
    await store.clockIn()
    store.adjustStart = vi.fn()
    const wrapper = mount(RunningView)
    const buttons = wrapper.findAll('button')
    const btn = buttons.find(b => b.text() === '+5min')
    await btn!.trigger('click')
    expect(store.adjustStart).toHaveBeenCalledWith(300)
  })

  it('clicking Reset day calls store.reset', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    setClock(() => t)
    store.settings = { daily_target: 28800, daily_limit: 36000, break1_enabled: false, break2_enabled: false, break1_trigger: 21600, break1_duration: 1800, break2_trigger: 32400, break2_duration: 900 }
    await store.clockIn()
    store.reset = vi.fn()
    const wrapper = mount(RunningView)
    const buttons = wrapper.findAll('button')
    const btn = buttons.find(b => b.text() === 'Reset day')
    await btn!.trigger('click')
    expect(store.reset).toHaveBeenCalled()
  })
})
