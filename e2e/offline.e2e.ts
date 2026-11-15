import { test, expect } from '@playwright/test'
import { waitUntilReady } from './helpers'

test('works offline after the first visit (service worker app shell)', async ({ page, context }) => {
  await page.goto('/')
  await waitUntilReady(page)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  // autoUpdate: make sure the SW controls the page before going offline
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await page.getByRole('button', { name: 'Clock In' }).click()

  await context.setOffline(true)
  await page.reload()
  await waitUntilReady(page)
  await expect(page.getByRole('button', { name: 'Clock Out' })).toBeVisible()
  await context.setOffline(false)
})

test('serves an installable web app manifest', async ({ page }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifest = await (await page.request.get(new URL(href!, page.url()).toString())).json()
  expect(manifest.name).toBe('Clocked')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
})
