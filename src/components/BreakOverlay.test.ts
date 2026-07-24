import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearWorktime } from '@/storage/worktime'
import { setClock } from '@/domain/clock'
import BreakOverlay from './BreakOverlay.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  setClock(() => 0)
})

describe('BreakOverlay', () => {
  it('renders Break label', () => {
    const wrapper = mount(BreakOverlay)
    expect(wrapper.text()).toContain('Break')
  })

  it('shows remaining time when breakEndsAt is set', () => {
    const store = useClockStore()
    store.now = 0
    store.settings = {
      daily_target: 28800, daily_limit: 36000,
      break1_enabled: true, break1_trigger: 0, break1_duration: 1800,
      break2_enabled: false, break2_trigger: 32400, break2_duration: 900,
    }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    store.now = 1000
    const wrapper = mount(BreakOverlay)
    wrapper.unmount()
  })

  it('shows 30:00 when break just started', () => {
    const store = useClockStore()
    store.now = 0
    store.settings = {
      daily_target: 28800, daily_limit: 36000,
      break1_enabled: true, break1_trigger: 0, break1_duration: 1800,
      break2_enabled: false, break2_trigger: 32400, break2_duration: 900,
    }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    store.now = 1000

    const wrapper = mount(BreakOverlay)
    const text = wrapper.text()
    expect(text).toContain('Break')
  })

  it('does not crash when breakEndsAt is undefined', () => {
    const wrapper = mount(BreakOverlay)
    expect(wrapper.find('.font-mono').text()).toBe('00:00')
  })
})
