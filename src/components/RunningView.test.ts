import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { formatHHMM } from '@/domain/format'
import RunningView from './RunningView.vue'

function setLocalTime(store: ReturnType<typeof useClockStore>, localHour: number) {
  const d = new Date(2026, 6, 21, localHour, 0, 0, 0)
  store.now = d.getTime()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('RunningView', () => {
  it('renders worked time and stats when running', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    setLocalTime(store, 1)
    const wrapper = mount(RunningView)
    expect(wrapper.text()).toContain(formatHHMM(store.workedMs))
    expect(wrapper.text()).toContain('Current session')
    expect(wrapper.text()).toContain('Worked')
    expect(wrapper.text()).toContain('Breaks')
    expect(wrapper.text()).toContain('Daily target')
  })

  it('renders Clock Out button when running', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    setLocalTime(store, 1)
    const wrapper = mount(RunningView)
    expect(wrapper.text()).toContain('Clock Out')
  })

  it('hides Clock Out button when on break', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = false
    setLocalTime(store, 8)
    const wrapper = mount(RunningView)
    if (store.viewState.kind === 'break') {
      expect(wrapper.text()).not.toContain('Clock Out')
      expect(wrapper.text()).toContain('On mandatory break')
    }
  })

  it('calls store.clockOut on Clock Out button click', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    setLocalTime(store, 1)
    const spy = vi.spyOn(store, 'clockOut')
    const wrapper = mount(RunningView)
    await wrapper.find('button').trigger('click')
    expect(spy).toHaveBeenCalled()
  })

  it('does not render old WP4 affordances', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    store._isClockedIn = true
    setLocalTime(store, 1)
    const wrapper = mount(RunningView)
    expect(wrapper.find('input[type="time"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('+1min')
    expect(wrapper.text()).not.toContain('+5min')
    expect(wrapper.text()).not.toContain('Reset day')
  })
})
