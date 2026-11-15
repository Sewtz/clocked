import { test, expect } from '@playwright/test'
import { at, sec, stat, waitUntilReady } from './helpers'

/**
 * An install from before the event-list model (DB v3, { punches }) opens the new
 * build: the v4 upgrade must convert today and the whole history.
 */
test('existing v3 data is migrated to events on first launch', async ({ page }) => {
  await page.clock.install({ time: at('11:00') })

  // Same origin as the app, but without loading it, so we can create the old DB first.
  await page.route('**/__seed', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }))
  await page.goto('/__seed')
  await page.evaluate(async ({ open, closedDay }) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('clocked', 3)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('settings')
        db.createObjectStore('worktime')
        db.createObjectStore('history')
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['worktime', 'history'], 'readwrite')
        tx.objectStore('worktime').put({ date: '2026-11-16', punches: open }, 'worktime')
        tx.objectStore('history').put({ date: '2026-11-13', punches: closedDay }, '2026-11-13')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, {
    open: [{ in: sec('08:00'), out: sec('09:00') }, { in: sec('09:30') }],
    closedDay: [{ in: sec('08:00'), out: sec('16:00') }],
  })

  await page.goto('/')
  await waitUntilReady(page)

  // Today: running since 09:30, 1h + 1h30 worked
  await expect(page.getByRole('button', { name: 'Clock Out' })).toBeVisible()
  await expect(stat(page, 'worked')).toHaveText('02:30')
  expect(await page.evaluate(() => window.__clocked.worktime)).toEqual({
    date: '2026-11-16',
    events: [
      { type: 'in', t: sec('08:00') }, { type: 'out', t: sec('09:00') }, { type: 'in', t: sec('09:30') },
    ],
  })
  expect(await page.evaluate(() => window.__clocked.getHistory())).toEqual([{
    date: '2026-11-13',
    events: [{ type: 'in', t: sec('08:00') }, { type: 'out', t: sec('16:00') }],
  }])
  expect(await page.evaluate(() => new Promise(r => {
    const req = indexedDB.open('clocked')
    req.onsuccess = () => { r(req.result.version); req.result.close() }
  }))).toBe(4)

  await page.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: '2026-11-13', exact: true }).click()
  // 8h with break1 injected after 6h of work
  await expect(page.getByText('08:00 – 14:00')).toBeVisible()
  await expect(page.getByText('Total worked').locator('..')).toContainText('07:30')
})
