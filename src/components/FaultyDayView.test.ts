import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { setClock } from '@/domain/clock'
import FaultyDayView from './FaultyDayView.vue'
import EditTimesDialog from './EditTimesDialog.vue'

const NOW = new Date('2026-07-21T12:00:00').getTime()

beforeEach(() => {
  setActivePinia(createPinia())
  setClock(() => NOW)
  const store = useClockStore()
  store.settings = { ...DEFAULT_SETTINGS }
  store.now = NOW
  store.worktime = {
    date: '2026-07-21',
    events: [{ type: 'in', t: 28800 }, { type: 'in', t: 36000 }, { type: 'out', t: 39600 }],
  }
})

describe('FaultyDayView', () => {
  it('explains the problem and lists events with the issue on the faulty one', () => {
    const wrapper = mount(FaultyDayView)
    expect(wrapper.text()).toContain('Times need fixing')
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(3)
    expect(items[0].text()).not.toContain('Two clock-ins')
    expect(items[1].text()).toContain('10:00')
    expect(items[1].text()).toContain('Two clock-ins in a row')
  })

  it('has no clock-in or clock-out buttons', () => {
    const wrapper = mount(FaultyDayView)
    const labels = wrapper.findAll('button').map(b => b.text())
    expect(labels).not.toContain('Clock In')
    expect(labels).not.toContain('Clock Out')
  })

  it('"Fix times" opens the editor for today', async () => {
    const wrapper = mount(FaultyDayView)
    await wrapper.findAll('button').find(b => b.text() === 'Fix times')!.trigger('click')
    const dialog = wrapper.findComponent(EditTimesDialog)
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('date')).toBe('2026-07-21')
    expect(dialog.findAll('[data-testid="event-row"]')).toHaveLength(3)
  })
})
