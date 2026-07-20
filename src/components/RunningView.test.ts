import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearAllEntries } from '@/storage/entries'
import RunningView from './RunningView.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearAllEntries()
})

describe('RunningView', () => {
  it('renders formatHHMM(displayMs)', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    store.now = t
    await store.clockIn(t)
    store.now = t + 3600_000
    const wrapper = mount(RunningView)
    expect(wrapper.text()).toContain('01:00')
  })

  it('clicking Clock Out calls store.clockOut', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    store.now = t
    await store.clockIn(t)
    store.clockOut = vi.fn()
    const wrapper = mount(RunningView)
    const buttons = wrapper.findAll('button')
    const btn = buttons.find(b => b.text() === 'Clock Out')
    await btn!.trigger('click')
    expect(store.clockOut).toHaveBeenCalled()
  })

  it('clicking +5min calls store.adjustStart(5)', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    store.now = t
    await store.clockIn(t)
    store.adjustStart = vi.fn()
    const wrapper = mount(RunningView)
    const buttons = wrapper.findAll('button')
    const btn = buttons.find(b => b.text() === '+5min')
    await btn!.trigger('click')
    expect(store.adjustStart).toHaveBeenCalledWith(5)
  })

  it('clicking Reset day calls store.reset', async () => {
    const store = useClockStore()
    const t = new Date('2026-07-21T08:00:00').getTime()
    store.now = t
    await store.clockIn(t)
    store.reset = vi.fn()
    const wrapper = mount(RunningView)
    const buttons = wrapper.findAll('button')
    const btn = buttons.find(b => b.text() === 'Reset day')
    await btn!.trigger('click')
    expect(store.reset).toHaveBeenCalled()
  })
})
