import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import DailyTargetBar from './DailyTargetBar.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('DailyTargetBar', () => {
  it('renders percentage and target hours', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(DailyTargetBar)
    expect(wrapper.text()).toContain('Daily target')
    expect(wrapper.text()).toContain('0%')
    expect(wrapper.text()).toContain('8h')
  })

  it('shows progress bar color change on overtime', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0, out: 36000 }] }
    store.now = 36000 * 1000
    const wrapper = mount(DailyTargetBar)
    const bar = wrapper.find('.h-full')
    expect(bar.attributes('style')).toContain('var(--color-overtime)')
  })
})
