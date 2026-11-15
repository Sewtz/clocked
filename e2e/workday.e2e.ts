import { test, expect } from '@playwright/test'
import { openAppAt, advanceTo, at, stat, viewState, waitUntilReady } from './helpers'

test.describe('a normal workday', () => {
  test('clock in, lunch, clock out: totals and timeline', async ({ page }) => {
    await openAppAt(page, at('08:00'))
    await expect(page.getByText('Press clock in to start tracking')).toBeVisible()

    await page.getByRole('button', { name: 'Clock In' }).click()
    await expect(page.getByRole('button', { name: 'Clock Out' })).toBeVisible()

    await advanceTo(page, at('12:00'))
    await expect(stat(page, 'worked')).toHaveText('04:00')
    await page.getByRole('button', { name: 'Clock Out' }).click()
    await expect(page.getByText('Worked today')).toBeVisible()

    await advanceTo(page, at('12:45'))
    await page.getByRole('button', { name: 'Clock In' }).click()
    await advanceTo(page, at('17:00'))
    await page.getByRole('button', { name: 'Clock Out' }).click()

    // 4h + 4h15m worked. The day passes 6h but not 9h, so only break1 (30 min)
    // applies and is fitted into the 45 min lunch (ADR-042); it does not reduce
    // worked time (ADR-035).
    await expect(stat(page, 'worked')).toHaveText('08:15')
    await expect(stat(page, 'breaks')).toHaveText('00:30')
    const timeline = page.getByRole('button', { name: 'Edit times' })
    await expect(timeline).toContainText('08:00 → 12:00')
    await expect(timeline).toContainText('12:45 → 17:00')
    expect(await viewState(page)).toBe('clocked-out')
  })

  test('a running timer survives a reload (no ticking while away)', async ({ page }) => {
    await openAppAt(page, at('08:00'))
    await page.getByRole('button', { name: 'Clock In' }).click()

    await advanceTo(page, at('09:30'))
    await page.reload()
    await waitUntilReady(page)

    await expect(page.getByRole('button', { name: 'Clock Out' })).toBeVisible()
    await expect(stat(page, 'worked')).toHaveText('01:30')
  })

  test('mandatory break after 6h of work, then work resumes', async ({ page }) => {
    await openAppAt(page, at('08:00'))
    await page.getByRole('button', { name: 'Clock In' }).click()

    await advanceTo(page, at('14:10'))
    await expect(page.getByText('Mandatory break (30 min)')).toBeVisible()
    expect(await viewState(page)).toBe('break')
    await expect(stat(page, 'worked')).toHaveText('06:00') // frozen during the break

    await advanceTo(page, at('14:45'))
    await expect(page.getByText('Mandatory break (30 min)')).toBeHidden()
    expect(await viewState(page)).toBe('running')
    await expect(stat(page, 'worked')).toHaveText('06:15')
    await expect(stat(page, 'breaks')).toHaveText('00:30')
  })
})
