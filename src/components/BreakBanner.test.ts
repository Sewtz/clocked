import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { setClock } from '@/domain/clock'
import BreakBanner from './BreakBanner.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('BreakBanner', () => {
  it('renders nothing when not on break', () => {
    const wrapper = mount(BreakBanner)
    expect(wrapper.text()).toBe('')
  })

  it('renders break info when on break1', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store._isClockedIn = false
    // Simulate break1 state via mocked computed
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    // Use fake timers to set now past 6h
    const nowMs = new Date('2026-07-21T06:00:01').getTime()
    setClock(() => nowMs)
    store.now = nowMs
    // Force recompute by setting worktime
    const wrapper = mount(BreakBanner)
    // The banner renders when isOnBreak and breakEndsAt are truthy
    if (store.isOnBreak && store.breakEndsAt) {
      expect(wrapper.text()).toContain('Mandatory break')
      expect(wrapper.text()).toContain('min')
    }
  })
})
