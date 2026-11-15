import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import type { PunchEvent } from '@/domain/types'
import { setClock } from '@/domain/clock'
import { punchesToEvents } from '@/domain/events'
import EditTimesDialog from './EditTimesDialog.vue'

const NOW = new Date('2026-07-21T12:00:00').getTime()
const TODAY = '2026-07-21'
const IN = (t: number): PunchEvent => ({ type: 'in', t })
const OUT = (t: number): PunchEvent => ({ type: 'out', t })

beforeEach(() => {
  setActivePinia(createPinia())
  setClock(() => NOW)
})

function setupToday(events: PunchEvent[]) {
  const store = useClockStore()
  store.settings = { ...DEFAULT_SETTINGS }
  store.now = NOW
  store.worktime = { date: TODAY, events }
  return store
}

function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text().trim() === text)!
}

function rowTimes(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-testid="event-row"]').map(r => {
    const label = r.find('span').text()
    const time = (r.find('input[type="time"]').element as HTMLInputElement).value
    return `${label === 'Clocked in' ? 'in' : 'out'} ${time}`
  })
}

describe('EditTimesDialog', () => {
  it('renders one row per event of today', () => {
    setupToday(punchesToEvents([{ in: 28800, out: 32400 }, { in: 36000 }]))
    const wrapper = mount(EditTimesDialog)
    expect(rowTimes(wrapper)).toEqual(['in 08:00', 'out 09:00', 'in 10:00'])
    expect(wrapper.text()).not.toContain('saved as faulty')
  })

  it('saves edited times via replaceDayEvents for today', async () => {
    const store = setupToday(punchesToEvents([{ in: 28800, out: 32400 }]))
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)
    await wrapper.find('input[type="time"]').setValue('07:30')
    await button(wrapper, 'Save').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('close')).toBeTruthy())
    expect(spy).toHaveBeenCalledWith(TODAY, [IN(27000), OUT(32400)])
  })

  it('deleting an event flags the day as faulty but still allows saving', async () => {
    const store = setupToday(punchesToEvents([{ in: 28800, out: 32400 }, { in: 36000, out: 39600 }]))
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)

    await wrapper.findAll('button[aria-label="Delete event"]')[1].trigger('click')

    expect(rowTimes(wrapper)).toEqual(['in 08:00', 'in 10:00', 'out 11:00'])
    expect(wrapper.text()).toContain('Two clock-ins in a row')
    expect(wrapper.text()).toContain('saved as faulty')
    const saveBtn = button(wrapper, 'Save')
    expect(saveBtn.attributes('disabled')).toBeUndefined()

    await saveBtn.trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('close')).toBeTruthy())
    expect(spy).toHaveBeenCalledWith(TODAY, [IN(28800), IN(36000), OUT(39600)])
  })

  it('adding an event inserts it sorted by time and fixes the sequence', async () => {
    setupToday([IN(28800), IN(36000), OUT(39600)])
    const wrapper = mount(EditTimesDialog)
    expect(wrapper.text()).toContain('Two clock-ins in a row')

    const typeButtons = wrapper.findAll('[aria-label="New event type"] button')
    await typeButtons.find(b => b.text() === 'out')!.trigger('click')
    await wrapper.find('input[aria-label="New event time"]').setValue('09:00')
    await button(wrapper, 'Add').trigger('click')

    expect(rowTimes(wrapper)).toEqual(['in 08:00', 'out 09:00', 'in 10:00', 'out 11:00'])
    expect(wrapper.text()).not.toContain('saved as faulty')
  })

  it('re-sorts rows when a time change is committed', async () => {
    setupToday(punchesToEvents([{ in: 28800, out: 32400 }, { in: 36000, out: 39600 }]))
    const wrapper = mount(EditTimesDialog)
    const input = wrapper.findAll('input[aria-label="Clocked in time"]')[1]
    await input.setValue('07:00') // setValue fires input + change
    expect(rowTimes(wrapper)).toEqual(['in 07:00', 'in 08:00', 'out 09:00', 'out 11:00'])
    expect(wrapper.text()).toContain('saved as faulty')
  })

  it('defaults the new event type to the opposite of the last event', () => {
    setupToday([IN(28800)])
    const wrapper = mount(EditTimesDialog)
    const pressed = wrapper.find('[aria-label="New event type"] button[aria-pressed="true"]')
    expect(pressed.text()).toBe('out')
  })

  it('lets you add the first event to an empty day', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)
    expect(wrapper.text()).toContain('No events for this day')
    await wrapper.find('input[aria-label="New event time"]').setValue('08:15')
    await button(wrapper, 'Add').trigger('click')
    expect(rowTimes(wrapper)).toEqual(['in 08:15'])
    await button(wrapper, 'Save').trigger('click')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(TODAY, [IN(29700)]))
  })

  it('edits a past day from the history cache and flags a trailing clock-in', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.historyCache = { '2026-07-18': { date: '2026-07-18', events: [IN(28800), OUT(32400), IN(36000)] } }
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog, { props: { date: '2026-07-18' } })

    expect(wrapper.text()).toContain('2026-07-18')
    expect(rowTimes(wrapper)).toEqual(['in 08:00', 'out 09:00', 'in 10:00'])
    expect(wrapper.text()).toContain('Past day ends clocked in')

    await wrapper.find('input[aria-label="New event time"]').setValue('12:00')
    await button(wrapper, 'Add').trigger('click')
    expect(wrapper.text()).not.toContain('saved as faulty')
    await button(wrapper, 'Save').trigger('click')
    await vi.waitFor(() =>
      expect(spy).toHaveBeenCalledWith('2026-07-18', [IN(28800), OUT(32400), IN(36000), OUT(43200)]),
    )
  })

  it('allows a trailing clock-in today (still clocked in)', () => {
    setupToday([IN(28800)])
    const wrapper = mount(EditTimesDialog)
    expect(wrapper.text()).not.toContain('saved as faulty')
  })

  it('emits close on Cancel without saving', async () => {
    const store = setupToday([IN(28800)])
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
  })

  it('emits close on backdrop click', async () => {
    setupToday([IN(28800)])
    const wrapper = mount(EditTimesDialog)
    await wrapper.find('.fixed').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
