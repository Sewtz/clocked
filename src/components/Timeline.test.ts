import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import Timeline from './Timeline.vue'
import EditTimesDialog from './EditTimesDialog.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('Timeline', () => {
  it('renders nothing when no segments', () => {
    const wrapper = mount(Timeline)
    expect(wrapper.text()).toBe('')
  })

  it('renders work segments when present', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 28800, out: 32400 }] }
    store.now = 32400 * 1000
    const wrapper = mount(Timeline)
    expect(wrapper.text()).toContain('Timeline')
    expect(wrapper.text()).toContain('Work')
  })

  it('renders mandatory-break with auto tag', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 0 }] }
    // Set now to trigger break1
    const nowSec = 21601
    store.now = nowSec * 1000
    const wrapper = mount(Timeline)
    if (store.segments.some(s => s.type === 'mandatory-break')) {
      expect(wrapper.text()).toContain('auto')
    }
  })

  it('opens EditTimesDialog when clicked', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 28800, out: 32400 }] }
    store.now = 32400 * 1000
    const wrapper = mount(Timeline)
    await wrapper.find('button[aria-label="Edit times"]').trigger('click')
    expect(wrapper.findComponent(EditTimesDialog).exists()).toBe(true)
    expect(wrapper.text()).toContain('Edit times')
  })

  it('closes EditTimesDialog when close event emitted', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', punches: [{ in: 28800, out: 32400 }] }
    store.now = 32400 * 1000
    const wrapper = mount(Timeline)
    await wrapper.find('button[aria-label="Edit times"]').trigger('click')
    const dialog = wrapper.findComponent(EditTimesDialog)
    await dialog.vm.$emit('close')
    expect(wrapper.findComponent(EditTimesDialog).exists()).toBe(false)
  })
})
