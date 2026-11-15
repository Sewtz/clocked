import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia, type Pinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import CalendarDialog from './CalendarDialog.vue'
import EditTimesDialog from './EditTimesDialog.vue'
import { setClock } from '@/domain/clock'
import { getHistoryDay, clearHistory } from '@/storage/history'
import { punchesToEvents } from '@/domain/events'

let pinia: Pinia

beforeEach(async () => {
  await clearHistory()
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
    // 28 day cells + close + "Edit day"
    expect(wrapper.findAll('button')).toHaveLength(30)
  })

  it('shows the selected day event list from history', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.now = new Date(2026, 7, 19, 12, 0).getTime()
    store.historyCache = {
      '2026-08-17': { date: '2026-08-17', events: punchesToEvents([{ in: 28800, out: 32400 }]) },
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
    store.worktime = { date: '2026-08-19', events: punchesToEvents([{ in: 28800 }]) }
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

  function editButton(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('button').find(b => b.text() === 'Edit day')!
  }

  it('disables "Edit day" for a future date', async () => {
    const wrapper = mountDialog(new Date(2026, 7, 19, 12, 0))
    await wrapper.find('button[aria-label="2026-08-20"]').trigger('click')
    expect(editButton(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.find('button[aria-label="2026-08-18"]').trigger('click')
    expect(editButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('opens the editor for the selected past day', async () => {
    const now = new Date(2026, 7, 19, 12, 0)
    setClock(() => now.getTime())
    const wrapper = mountDialog(now)
    await wrapper.find('button[aria-label="2026-08-18"]').trigger('click')
    await editButton(wrapper).trigger('click')
    expect(wrapper.findComponent(EditTimesDialog).props('date')).toBe('2026-08-18')
  })

  it('fixing a faulty past day updates the grid after the editor closes', async () => {
    const now = new Date(2026, 7, 19, 12, 0)
    setClock(() => now.getTime())
    const store = useClockStore()
    await store.replaceDayEvents('2026-08-18', [{ type: 'in', t: 28800 }, { type: 'in', t: 36000 }])
    const wrapper = mountDialog(now)
    await vi.waitFor(() => expect(wrapper.find('button[aria-label="2026-08-18, faulty"]').exists()).toBe(true))

    await wrapper.find('button[aria-label="2026-08-18, faulty"]').trigger('click')
    expect(wrapper.text()).toContain('Two clock-ins in a row')
    await editButton(wrapper).trigger('click')
    const editor = wrapper.findComponent(EditTimesDialog)
    // Delete the second clock-in, add a clock-out at 17:00, save.
    await editor.findAll('button[aria-label="Delete event"]')[1].trigger('click')
    await editor.find('input[aria-label="New event time"]').setValue('17:00')
    await editor.findAll('button').find(b => b.text() === 'Add')!.trigger('click')
    await editor.findAll('button').find(b => b.text() === 'Save')!.trigger('click')

    await vi.waitFor(() => expect(wrapper.findComponent(EditTimesDialog).exists()).toBe(false))
    await vi.waitFor(() => expect(wrapper.find('button[aria-label="2026-08-18"] [data-status="valid"]').exists()).toBe(true))
    expect((await getHistoryDay('2026-08-18'))!.events).toEqual([{ type: 'in', t: 28800 }, { type: 'out', t: 61200 }])
    // 08:00-17:00 without a gap: break1 injected after 6h -> 8h30 worked
    expect(wrapper.find('[data-testid="day-worked"]').text()).toBe('08:30')
  })
})
