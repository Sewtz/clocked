import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { clearWorktime } from '@/storage/worktime'
import { setClock } from '@/domain/clock'
import App from './App.vue'

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearWorktime()
  setClock(() => Date.now())
})

async function mountApp() {
  const wrapper = mount(App)
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
  return wrapper
}

describe('App integration', () => {
  it('shows ClockInView on empty storage', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain('TIMECLOCK')
  })

  it('renders the wordmark header', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain('TIMECLOCK')
  })

  it('gear button opens settings dialog', async () => {
    const wrapper = await mountApp()
    const gear = wrapper.find('button[aria-label="Settings"]')
    expect(gear.exists()).toBe(true)
    await gear.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(wrapper.text()).toContain('Daily target')
  })
})
