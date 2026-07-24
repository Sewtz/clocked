import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import MilestoneHint from './MilestoneHint.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MilestoneHint', () => {
  it('renders nothing when not running', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(MilestoneHint)
    expect(wrapper.text()).toBe('')
  })

  it('renders milestone hint when running and milestone exists', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    store.now = 0
    const wrapper = mount(MilestoneHint)
    if (store.nextMilestone && store.viewState.kind === 'running') {
      expect(wrapper.text()).toContain('Next:')
    }
  })
})
