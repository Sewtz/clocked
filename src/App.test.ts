import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { clearAllEntries } from '@/storage/entries'
import App from './App.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearAllEntries()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('App integration', () => {
  it('shows ClockInView on empty storage', async () => {
    vi.setSystemTime(new Date('2026-07-21T08:00:00'))
    const wrapper = mount(App)
    await vi.runOnlyPendingTimersAsync()
    expect(wrapper.text()).toContain('Clock In')
  })

  it('switches to RunningView after clock-in', async () => {
    vi.setSystemTime(new Date('2026-07-21T08:00:00'))
    const wrapper = mount(App)
    await vi.runOnlyPendingTimersAsync()
    expect(wrapper.text()).toContain('Clock In')

    const btn = wrapper.find('button.rounded-full')
    await btn.trigger('click')
    await vi.runOnlyPendingTimersAsync()
    expect(wrapper.text()).toContain('00:00')
    expect(wrapper.text()).toContain('worked')
  })
})
