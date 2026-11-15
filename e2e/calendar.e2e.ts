import { test, expect, type Page } from '@playwright/test'
import { openAppAt, advanceTo, at, sec, stat, addEvent, viewState } from './helpers'

const openCalendar = (page: Page) => page.getByRole('button', { name: 'Calendar' }).click()
const cell = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true })

/** The phone is unlocked again: the app re-checks the day on visibilitychange. */
async function comeBack(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

test.describe('history and the calendar', () => {
  test('midnight archives the day; it shows up in the calendar', async ({ page }) => {
    await openAppAt(page, at('08:00', '2026-11-16'))
    await page.getByRole('button', { name: 'Clock In' }).click()
    await advanceTo(page, at('16:30', '2026-11-16'))
    await page.getByRole('button', { name: 'Clock Out' }).click()

    await advanceTo(page, at('07:00', '2026-11-17'))
    await comeBack(page)
    await expect(page.getByText('Press clock in to start tracking')).toBeVisible()

    await openCalendar(page)
    await cell(page, '2026-11-16').click()
    // 8h30 with break1 injected after 6h of work
    await expect(page.getByText('08:00 – 14:00')).toBeVisible()
    await expect(page.getByText('14:30 – 16:30')).toBeVisible()
    await expect(page.getByText('Total worked').locator('..')).toContainText('08:00')
  })

  test('forgetting to clock out: the day is closed at 23:59', async ({ page }) => {
    await openAppAt(page, at('08:00', '2026-11-16'))
    await page.getByRole('button', { name: 'Clock In' }).click()

    await advanceTo(page, at('07:00', '2026-11-17'))
    await comeBack(page)

    const history = await page.evaluate(() => window.__clocked.getHistory())
    expect(history).toEqual([{
      date: '2026-11-16',
      events: [{ type: 'in', t: sec('08:00') }, { type: 'out', t: 86399 }],
    }])
  })

  test('a faulty day is archived as-is and can be fixed from the calendar', async ({ page }) => {
    await openAppAt(page, at('18:00', '2026-11-16'))
    await page.evaluate(events => window.__clocked.setEvents(events), [
      { type: 'in' as const, t: sec('08:00') },
      { type: 'in' as const, t: sec('13:00') },
      { type: 'out' as const, t: sec('17:00') },
    ])
    expect(await viewState(page)).toBe('faulty')

    await advanceTo(page, at('07:00', '2026-11-17'))
    await comeBack(page)
    await expect(page.getByText('Press clock in to start tracking')).toBeVisible()

    await openCalendar(page)
    const faultyCell = cell(page, '2026-11-16, faulty')
    await expect(faultyCell).toBeVisible()
    await faultyCell.click()
    await expect(page.getByTestId('faulty-day-list')).toContainText('Two clock-ins in a row')
    await expect(page.getByText('totals unavailable')).toBeVisible()

    await page.getByRole('button', { name: 'Edit day' }).click()
    await expect(page.getByText('Edit times · 2026-11-16')).toBeVisible()
    await addEvent(page, 'out', '12:00')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(cell(page, '2026-11-16')).toBeVisible()
    await expect(page.getByText('Total worked')).toBeVisible()
    const day = await page.evaluate(() => window.__clocked.getHistory())
    expect(day[0].events.map(e => e.type)).toEqual(['in', 'out', 'in', 'out'])
  })

  test('record a forgotten past day; future days are not editable', async ({ page }) => {
    await openAppAt(page, at('09:00', '2026-11-18'))
    await openCalendar(page)

    await cell(page, '2026-11-19').click()
    await expect(page.getByRole('button', { name: 'Edit day' })).toBeDisabled()

    await cell(page, '2026-11-16').click()
    await expect(page.getByText('No events for this day.')).toBeVisible()
    await page.getByRole('button', { name: 'Edit day' }).click()
    await addEvent(page, 'in', '08:00')
    await addEvent(page, 'out', '15:00')
    await page.getByRole('button', { name: 'Save' }).click()

    // 7h with no gap: break1 is injected after 6h of work and splits the block.
    await expect(page.getByText('08:00 – 14:00')).toBeVisible()
    await expect(page.getByText('14:30 – 15:00')).toBeVisible()
    await expect(page.getByText('Total worked').locator('..')).toContainText('06:30')
    // Today is untouched
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Press clock in to start tracking')).toBeVisible()
  })

  test('deleting all events of a past day removes it', async ({ page }) => {
    await openAppAt(page, at('09:00', '2026-11-18'))
    await page.evaluate(() => window.__clocked.setHistoryDay('2026-11-16', [
      { type: 'in', t: 28800 }, { type: 'out', t: 32400 },
    ]))
    await openCalendar(page)
    await cell(page, '2026-11-16').click()
    await page.getByRole('button', { name: 'Edit day' }).click()
    await page.getByRole('button', { name: 'Delete event' }).first().click()
    await page.getByRole('button', { name: 'Delete event' }).first().click()
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('No events for this day.')).toBeVisible()
    expect(await page.evaluate(() => window.__clocked.getHistory())).toEqual([])
  })

  test('today shows up live in the calendar', async ({ page }) => {
    await openAppAt(page, at('08:00'))
    await page.getByRole('button', { name: 'Clock In' }).click()
    await advanceTo(page, at('10:00'))
    await openCalendar(page)
    await expect(page.getByText('08:00 – 10:00')).toBeVisible()
    await expect(stat(page, 'worked')).toHaveText('02:00')
  })
})
