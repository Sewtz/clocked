import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { clearWorktime, putWorktime } from '@/storage/worktime'
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

  it('calendar button opens calendar dialog', async () => {
    const wrapper = await mountApp()
    const calendar = wrapper.find('button[aria-label="Calendar"]')
    expect(calendar.exists()).toBe(true)
    await calendar.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(wrapper.text()).toContain('Calendar')
  })

  it('shows the faulty view and a red status dot for a faulty day', async () => {
    const t = new Date('2026-07-21T12:00:00').getTime()
    setClock(() => t)
    await putWorktime({
      date: '2026-07-21',
      events: [{ type: 'in', t: 28800 }, { type: 'in', t: 36000 }],
    })
    const wrapper = await mountApp()
    expect(wrapper.find('[data-testid="faulty-day"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Clock In')
    const dot = wrapper.find('header span.rounded-full')
    expect(dot.attributes('style')).toContain('var(--color-overtime)')
  })
})
