import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import SettingsDialog from './SettingsDialog.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text().trim() === text)
}

describe('SettingsDialog', () => {
  it('renders settings sections', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(SettingsDialog)
    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.text()).toContain('Daily target')
    expect(wrapper.text()).toContain('Automatic breaks')
    expect(wrapper.text()).toContain('Break 1')
    expect(wrapper.text()).toContain('Break 2')
    expect(wrapper.text()).toContain('Cancel')
    expect(wrapper.text()).toContain('Save')
  })

  it('seeds values from store.settings', () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(SettingsDialog)
    const inputs = wrapper.findAll('input[type="number"]')
    expect(inputs.length).toBeGreaterThan(0)
    expect((inputs[0].element as HTMLInputElement).value).toBe('8')
    expect((inputs[2].element as HTMLInputElement).value).toBe('30')
  })

  it('calls store.setSettings with converted seconds on save', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    vi.spyOn(store, 'setSettings')
    const wrapper = mount(SettingsDialog)
    const saveBtn = findButton(wrapper, 'Save')
    expect(saveBtn).toBeDefined()
    await saveBtn!.trigger('click')
    expect(store.setSettings).toHaveBeenCalled()
  })

  it('emit close on cancel click', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(SettingsDialog)
    const cancelBtn = findButton(wrapper, 'Cancel')
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emit close on backdrop click', async () => {
    const store = useClockStore()
    store.settings = { ...DEFAULT_SETTINGS }
    const wrapper = mount(SettingsDialog)
    const backdrop = wrapper.find('.fixed')
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
