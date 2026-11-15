import { test, expect } from '@playwright/test'
import { openAppAt, advanceTo, at, sec, stat, viewState, addEvent, editorRows } from './helpers'

/** Clock in 08:00, out 12:00, in 13:00, out 17:00 through the UI. */
async function recordDay(page: import('@playwright/test').Page) {
  await openAppAt(page, at('08:00'))
  await page.getByRole('button', { name: 'Clock In' }).click()
  await advanceTo(page, at('12:00'))
  await page.getByRole('button', { name: 'Clock Out' }).click()
  await advanceTo(page, at('13:00'))
  await page.getByRole('button', { name: 'Clock In' }).click()
  await advanceTo(page, at('17:00'))
  await page.getByRole('button', { name: 'Clock Out' }).click()
  await expect(stat(page, 'worked')).toHaveText('08:00')
}

test.describe('editing today', () => {
  test('deleting one event flags the day; fixing it restores totals', async ({ page }) => {
    await recordDay(page)

    await page.getByRole('button', { name: 'Edit times' }).click()
    expect(await editorRows(page)).toEqual(['in 08:00', 'out 12:00', 'in 13:00', 'out 17:00'])

    // Remove the 12:00 clock-out -> in, in, out
    await page.getByRole('button', { name: 'Delete event' }).nth(1).click()
    await expect(page.getByText('Two clock-ins in a row')).toBeVisible()
    await expect(page.getByText('Day will be saved as faulty')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()

    // Main screen: faulty view, no clocking, red status dot
    const faulty = page.getByTestId('faulty-day')
    await expect(faulty).toBeVisible()
    await expect(faulty).toContainText('Two clock-ins in a row')
    await expect(page.getByRole('button', { name: 'Clock In' })).toHaveCount(0)
    await expect(page.locator('header span.rounded-full')).toHaveAttribute('style', /--color-overtime/)
    expect(await viewState(page)).toBe('faulty')

    // Survives a reload
    await page.reload()
    await expect(page.getByTestId('faulty-day')).toBeVisible()

    // Fix: add the missing clock-out at 12:30
    await page.getByRole('button', { name: 'Fix times' }).click()
    await addEvent(page, 'out', '12:30')
    expect(await editorRows(page)).toEqual(['in 08:00', 'out 12:30', 'in 13:00', 'out 17:00'])
    await expect(page.getByText('Day will be saved as faulty')).toBeHidden()
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByTestId('faulty-day')).toBeHidden()
    await expect(stat(page, 'worked')).toHaveText('08:30')
    expect(await viewState(page)).toBe('clocked-out')
  })

  test('forgot to clock in: correct the start time while running', async ({ page }) => {
    await openAppAt(page, at('09:10'))
    await page.getByRole('button', { name: 'Clock In' }).click()
    await advanceTo(page, at('10:00'))

    await page.getByRole('button', { name: 'Edit times' }).click()
    await page.getByLabel('Clocked in time').fill('08:00')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(stat(page, 'worked')).toHaveText('02:00')
    expect(await viewState(page)).toBe('running')
  })

  test('deleting every event returns to the clock-in screen', async ({ page }) => {
    await openAppAt(page, at('08:00'))
    await page.getByRole('button', { name: 'Clock In' }).click()
    await advanceTo(page, at('08:30'))
    await page.getByRole('button', { name: 'Clock Out' }).click()

    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.getByRole('button', { name: 'Edit times' }).click()
    await page.getByRole('button', { name: 'Delete event' }).first().click()
    await page.getByRole('button', { name: 'Delete event' }).first().click()
    await expect(page.getByText('No events for this day.')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Press clock in to start tracking')).toBeVisible()
    expect(await page.evaluate(() => window.__clocked.worktime)).toBeNull()
    expect(errors).toEqual([])
  })

  test('a faulty day seeded via the debug API blocks clocking until fixed', async ({ page }) => {
    await openAppAt(page, at('12:00'))
    await page.evaluate(events => window.__clocked.setEvents(events), [
      { type: 'out' as const, t: sec('08:00') },
      { type: 'in' as const, t: sec('09:00') },
    ])
    await expect(page.getByTestId('faulty-day')).toContainText('Day starts with a clock-out')

    await page.getByRole('button', { name: 'Fix times' }).click()
    await page.getByRole('button', { name: 'Delete event' }).first().click()
    await page.getByRole('button', { name: 'Save' }).click()

    // 09:00 open clock-in today is valid -> running
    await expect(page.getByRole('button', { name: 'Clock Out' })).toBeVisible()
    await expect(stat(page, 'worked')).toHaveText('03:00')
  })
})
