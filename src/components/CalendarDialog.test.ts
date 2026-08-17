import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia, type Pinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import CalendarDialog from './CalendarDialog.vue'

let pinia: Pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  document.body.style.removeProperty('overflow')
})

function mountDialog(now: Date) {
  const store = useClockStore()
  store.settings = { ...DEFAULT_SETTINGS }
  store.now = now.getTime()
  store.historyCache = {}
  return mount(CalendarDialog, { global: { plugins: [pinia] } })
}

describe('CalendarDialog', () => {
  it('loads history on mount', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = new Date(2026, 7, 19, 12, 0).getTime()
    const loadSpy = vi.spyOn(store, 'loadHistoryRange')
    mount(CalendarDialog, { global: { plugins: [pinia] } })
    expect(loadSpy).toHaveBeenCalled()
  })

  it('renders the calendar grid', () => {
    const wrapper = mountDialog(new Date(2026, 7, 19, 12, 0))
    expect(wrapper.text()).toContain('Calendar')
    expect(wrapper.findAll('button')).toHaveLength(29)
  })

  it('shows the selected day event list from history', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = new Date(2026, 7, 19, 12, 0).getTime()
    store.historyCache = {
      '2026-08-17': { date: '2026-08-17', punches: [{ in: 28800, out: 32400 }] },
    }
    const wrapper = mount(CalendarDialog, { global: { plugins: [pinia] } })
    const dayCell = wrapper.find('button[aria-label="2026-08-17"]')
    await dayCell.trigger('click')
    const text = wrapper.text()
    expect(text).toContain('Work')
    expect(text).toContain('08:00 – 09:00')
  })

  it('shows no-events message for a day without data', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = new Date(2026, 7, 19, 12, 0).getTime()
    const wrapper = mount(CalendarDialog, { global: { plugins: [pinia] } })
    const dayCell = wrapper.find('button[aria-label="2026-08-16"]')
    await dayCell.trigger('click')
    expect(wrapper.text()).toContain('No events for this day.')
  })

  it('merges today live into the cache and shows open-punch work', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = new Date(2026, 7, 19, 10, 0, 0).getTime()
    store.worktime = { date: '2026-08-19', punches: [{ in: 28800 }] }
    const wrapper = mount(CalendarDialog, { global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('08:00 – 10:00')
  })

  it('closes on backdrop click', async () => {
    const wrapper = mountDialog(new Date(2026, 7, 19, 12, 0))
    const backdrop = wrapper.find('.fixed')
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('closes on close button click', async () => {
    const wrapper = mountDialog(new Date(2026, 7, 19, 12, 0))
    const closeBtn = wrapper.find('button[aria-label="Close"]')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('locks body scroll while mounted and restores on unmount', async () => {
    const wrapper = mountDialog(new Date(2026, 7, 19, 12, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.body.style.overflow).toBe('hidden')
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })
})