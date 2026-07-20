import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { clearAllEntries } from '@/storage/entries'
import BreakOverlay from './BreakOverlay.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearAllEntries()
})

describe('BreakOverlay', () => {
  it('renders Break label', () => {
    const wrapper = mount(BreakOverlay)
    expect(wrapper.text()).toContain('Break')
  })

  it('shows remaining time when a 30-minute break is open', () => {
    const store = useClockStore()
    store.now = 0
    store.entry = {
      date: '2026-07-21',
      segments: [
        { type: 'work', start: 0 },
        { type: 'break', start: 0, duration: 30 },
      ],
    }
    const wrapper = mount(BreakOverlay)
    expect(wrapper.text()).toContain('30:00')
  })

  it('shows 01:00 when 1 min remains in a 30 min break', () => {
    const store = useClockStore()
    store.now = 30 * 60_000 - 60_000 // 1 min before break ends
    store.entry = {
      date: '2026-07-21',
      segments: [
        { type: 'work', start: 0 },
        { type: 'break', start: 0, duration: 30 },
      ],
    }
    const wrapper = mount(BreakOverlay)
    expect(wrapper.text()).toContain('01:00')
  })

  it('does not crash when breakEndsAt is undefined', () => {
    const wrapper = mount(BreakOverlay)
    expect(wrapper.find('.font-mono').text()).toBe('00:00')
  })
})
