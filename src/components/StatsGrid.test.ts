import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import StatsGrid from './StatsGrid.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('StatsGrid', () => {
  it('renders worked, breaks, and remaining with labels', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(StatsGrid)
    expect(wrapper.text()).toContain('Worked')
    expect(wrapper.text()).toContain('Breaks')
    expect(wrapper.text()).toContain('Remaining')
  })

  it('shows Overtime label when overtimeMs > 0', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0, out: 36000 }] }
    store.now = 36000 * 1000
    const wrapper = mount(StatsGrid)
    expect(wrapper.text()).toContain('Overtime')
    expect(wrapper.text()).toContain('+')
  })
})
