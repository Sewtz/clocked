import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import EditTimesDialog from './EditTimesDialog.vue'
import { punchesToEvents } from '@/domain/events'

beforeEach(() => {
  setActivePinia(createPinia())
})

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text().trim() === text)
}

describe('EditTimesDialog', () => {
  it('renders rows for each punch event', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 28800, out: 32400 }, { in: 36000 }]) }
    const wrapper = mount(EditTimesDialog)
    const inputs = wrapper.findAll('input[type="time"]')
    expect(inputs.length).toBe(3)
    expect((inputs[0].element as HTMLInputElement).value).toBe('08:00')
    expect((inputs[1].element as HTMLInputElement).value).toBe('09:00')
    expect((inputs[2].element as HTMLInputElement).value).toBe('10:00')
  })

  it('seeds values from store.worktime.events', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 25200 }, { in: 32400, out: 36000 }]) }
    const wrapper = mount(EditTimesDialog)
    const inputs = wrapper.findAll('input[type="time"]')
    expect(inputs.length).toBe(3)
    expect((inputs[0].element as HTMLInputElement).value).toBe('07:00')
    expect((inputs[1].element as HTMLInputElement).value).toBe('09:00')
    expect((inputs[2].element as HTMLInputElement).value).toBe('10:00')
  })

  it('calls store.replaceDayEvents on Save with converted seconds', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 28800, out: 32400 }]) }
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)
    await wrapper.find('input[type="time"]').setValue('07:30')
    const saveBtn = findButton(wrapper, 'Save')
    await saveBtn!.trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('close')).toBeTruthy())
    expect(spy).toHaveBeenCalledWith('2026-07-21', punchesToEvents([{ in: 27000, out: 32400 }]))
  })

  it('rejects an out moved before its in and disables Save', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 28800, out: 32400 }]) }
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)
    const inputs = wrapper.findAll('input[type="time"]')
    await inputs[1].setValue('06:00')
    expect(wrapper.text()).toContain('earlier')
    const saveBtn = findButton(wrapper, 'Save')
    expect(saveBtn!.attributes('disabled')).toBeDefined()
    await saveBtn!.trigger('click')
    expect(spy).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('rejects events that are out of time order', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 28800, out: 36000 }, { in: 32400 }]) }
    const spy = vi.spyOn(store, 'replaceDayEvents')
    const wrapper = mount(EditTimesDialog)
    expect(wrapper.text()).toContain('earlier')
    const saveBtn = findButton(wrapper, 'Save')
    expect(saveBtn!.attributes('disabled')).toBeDefined()
    await saveBtn!.trigger('click')
    expect(spy).not.toHaveBeenCalled()
  })

  it('emits close on Cancel', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 28800 }]) }
    const wrapper = mount(EditTimesDialog)
    const cancelBtn = findButton(wrapper, 'Cancel')
    await cancelBtn!.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close on backdrop click', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    store.worktime = { date: '2026-07-21', events: punchesToEvents([{ in: 28800 }]) }
    const wrapper = mount(EditTimesDialog)
    await wrapper.find('.fixed').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('mounts with empty body when worktime is null', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(EditTimesDialog)
    expect(wrapper.findAll('input[type="time"]').length).toBe(0)
    expect(wrapper.text()).toContain('Edit times')
  })
})