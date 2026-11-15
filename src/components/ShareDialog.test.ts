import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useClockStore } from '@/stores/clock'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { setClock } from '@/domain/clock'
import { clearHistory } from '@/storage/history'
import { clearWorktime } from '@/storage/worktime'
import { punchesToEvents } from '@/domain/events'
import ShareDialog from './ShareDialog.vue'

const shareExport = vi.fn()
vi.mock('@/share/share', () => ({ shareExport: (...args: unknown[]) => shareExport(...args) }))

// Wednesday 18 Nov 2026, 12:00 -> "last week" = Mon 9 .. Sun 15 Nov
const NOW = new Date(2026, 10, 18, 12, 0)

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearHistory()
  await clearWorktime()
  setClock(() => NOW.getTime())
  shareExport.mockReset()
  const store = useClockStore()
  store.settings = { ...DEFAULT_SETTINGS }
  await store.replaceDayEvents('2026-11-09', punchesToEvents([{ in: 28800, out: 43200 }, { in: 45000, out: 59400 }])) // 8h
  await store.replaceDayEvents('2026-11-10', punchesToEvents([{ in: 28800, out: 57600 }])) // 8h gross -> 7h30
  await store.replaceDayEvents('2026-11-11', [{ type: 'in', t: 28800 }, { type: 'in', t: 36000 }]) // faulty
  await store.replaceDayEvents('2026-11-17', punchesToEvents([{ in: 28800, out: 32400 }])) // this week, 1h
})

async function mountDialog(props: Record<string, string> = {}) {
  const w = mount(ShareDialog, { props })
  await flushPromises()
  await vi.waitFor(() => expect(w.find('[data-testid="share-preview"]').exists()).toBe(true))
  return w
}
async function mountLastWeek(props: Record<string, string> = {}) {
  const w = await mountDialog(props)
  await w.findAll('button').find(b => b.text() === 'Last week')!.trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(w.find('input[aria-label="From"]').element).toHaveProperty('value', '2026-11-09'))
  await vi.waitFor(() => expect(w.find('[data-testid="share-worked"]').text()).toBe('15:30'))
  return w
}
const text = (w: Awaited<ReturnType<typeof mountDialog>>, id: string) => w.find(`[data-testid="${id}"]`).text()

describe('ShareDialog', () => {
  it('defaults to this week', async () => {
    const w = await mountDialog()
    expect(w.find('button[aria-pressed="true"]').text()).toBe('This week')
    expect((w.find('input[aria-label="From"]').element as HTMLInputElement).value).toBe('2026-11-16')
    expect((w.find('input[aria-label="To"]').element as HTMLInputElement).value).toBe('2026-11-18')
    expect(text(w, 'share-worked')).toBe('01:00')
  })

  it('previews the totals of last week', async () => {
    const w = await mountLastWeek()
    expect((w.find('input[aria-label="From"]').element as HTMLInputElement).value).toBe('2026-11-09')
    expect((w.find('input[aria-label="To"]').element as HTMLInputElement).value).toBe('2026-11-15')
    expect(text(w, 'share-worked')).toBe('15:30')
    expect(text(w, 'share-breaks')).toBe('01:00')
    expect(text(w, 'share-balance')).toBe('00:30 under')
    expect(text(w, 'share-day-count')).toContain('2 days with working times · 7 calendar days')
  })

  it('warns about faulty days in the range', async () => {
    const w = await mountLastWeek({ selectableFrom: '2026-10-26', selectableTo: '2026-11-22' })
    expect(text(w, 'share-faulty')).toContain('1 day has inconsistent clock times')
    await w.find('button[aria-label="Fix 2026-11-11"]').trigger('click')
    expect(w.emitted('jump')).toEqual([['2026-11-11']])
  })

  it('lists faulty days outside the calendar grid without a jump button', async () => {
    const w = await mountLastWeek({ selectableFrom: '2026-11-16', selectableTo: '2026-12-13' })
    expect(w.find('button[aria-label="Fix 2026-11-11"]').exists()).toBe(false)
    expect(text(w, 'share-faulty')).toContain('2026-11-11')
  })

  it('presets switch the range', async () => {
    const w = await mountDialog()
    expect(w.find('[data-testid="share-faulty"]').exists()).toBe(false)
    await w.findAll('button').find(b => b.text() === 'Last month')!.trigger('click')
    await flushPromises()
    expect((w.find('input[aria-label="From"]').element as HTMLInputElement).value).toBe('2026-10-01')
    expect((w.find('input[aria-label="To"]').element as HTMLInputElement).value).toBe('2026-10-31')
    await vi.waitFor(() => expect(text(w, 'share-worked')).toBe('00:00'))
  })

  it('a custom From–To clears the preset; a reversed range disables Share', async () => {
    const w = await mountLastWeek()
    await w.find('input[aria-label="From"]').setValue('2026-11-10')
    await flushPromises()
    expect(w.find('[aria-label="Period"] button[aria-pressed="true"]').exists()).toBe(false)
    await vi.waitFor(() => expect(text(w, 'share-worked')).toBe('07:30'))

    await w.find('input[aria-label="To"]').setValue('2026-11-01')
    await flushPromises()
    expect(w.text()).toContain('The start date is after the end date.')
    expect(w.findAll('button').find(b => b.text() === 'Share')!.attributes('disabled')).toBeDefined()
  })

  it('shares the CSV and mail text for the range; closes when shared', async () => {
    shareExport.mockResolvedValue('shared')
    const w = await mountLastWeek()
    await w.findAll('button').find(b => b.text() === 'Share')!.trigger('click')
    await flushPromises()
    const payload = shareExport.mock.calls[0][0]
    expect(payload.fileName).toBe('clocked_2026-11-09_2026-11-15.csv')
    expect(payload.subject).toBe('Working times 2026-11-09 – 2026-11-15')
    expect(payload.csv).toContain('2026-11-11;Wed;faulty')
    expect(payload.text).toContain('Day            | In    | Out   | Worked | Breaks | Balance')
    expect(payload.text).toContain('see the attached file')
    const draft = payload.draftText()
    expect(draft).toContain('Day            | In    | Out   | Worked | Breaks | Balance')
    expect(draft).not.toContain('attached')
    expect(payload.draftText(0)).toContain('… 3 days more')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('stays open with a hint after opening a mail draft; nothing on cancel', async () => {
    shareExport.mockResolvedValueOnce('draft').mockResolvedValueOnce('cancelled')
    const w = await mountLastWeek()
    const btn = w.findAll('button').find(b => b.text() === 'Share')!
    await btn.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Opened a mail draft with the table.')
    await btn.trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
  })
})
