import { test, expect, type Page } from '@playwright/test'
import { openAppAt, at, sec } from './helpers'

// Wednesday 18 Nov 2026 -> "Last week" = Mon 9 .. Sun 15 Nov
const NOW = at('12:00', '2026-11-18')

async function seedWeek(page: Page) {
  await page.evaluate(async ({ s }) => {
    const c = window.__clocked
    await c.setHistoryDay('2026-11-09', [{ type: 'in', t: s.h8 }, { type: 'out', t: s.h12 }, { type: 'in', t: s.h1230 }, { type: 'out', t: s.h1630 }])
    await c.setHistoryDay('2026-11-11', [{ type: 'in', t: s.h815 }, { type: 'in', t: s.h1245 }, { type: 'out', t: s.h17 }])
  }, { s: { h8: sec('08:00'), h12: sec('12:00'), h1230: sec('12:30'), h1630: sec('16:30'), h815: sec('08:15'), h1245: sec('12:45'), h17: sec('17:00') } })
}

async function openShare(page: Page) {
  await page.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('dialog', { name: 'Share working times' })).toBeVisible()
}

test('share sheet: the CSV is attached and the mail text summarises the week', async ({ page }) => {
  // Pretend this browser can share files (like Android/iOS) and capture what is shared.
  await page.addInitScript(() => {
    const nav = navigator as Navigator & { canShare: (d?: ShareData) => boolean; share: (d: ShareData) => Promise<void> }
    nav.canShare = () => true
    nav.share = async (d: ShareData) => {
      const f = d.files![0]
      ;(window as unknown as Record<string, unknown>).__shared = {
        title: d.title, text: d.text, name: f.name, type: f.type,
        bytes: Array.from(new Uint8Array(await f.arrayBuffer()).slice(0, 3)),
        content: await f.text(),
      }
    }
  })
  await openAppAt(page, NOW)
  await seedWeek(page)
  await openShare(page)

  await expect(page.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Last week' }).click()
  await expect(page.getByTestId('share-worked')).toHaveText('08:00')
  await expect(page.getByTestId('share-faulty')).toContainText('1 day has inconsistent clock times')

  await page.getByRole('button', { name: 'Share', exact: true }).last().click()
  await expect(page.getByRole('dialog', { name: 'Share working times' })).toBeHidden()

  type Shared = { title: string; text: string; name: string; type: string; bytes: number[]; content: string }
  const shared = await page.evaluate(() => (window as unknown as { __shared: Shared }).__shared)
  expect(shared.name).toBe('clocked_2026-11-09_2026-11-15.csv')
  expect(shared.type).toBe('text/csv')
  expect(shared.title).toBe('Working times 2026-11-09 – 2026-11-15')
  expect(shared.bytes).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM for Excel
  expect(shared.content).toContain('2026-11-09;Mon;ok;08:00;16:30;08:00;00:30;on target')
  expect(shared.content).toContain('2026-11-11;Wed;faulty;08:15;17:00')
  expect(shared.text).toContain('Day            | In    | Out   | Worked | Breaks | Balance')
  expect(shared.text).toContain('Mon 2026-11-09 | 08:00 | 16:30 |  08:00 |  00:30 |  ±00:00')
  expect(shared.text).toContain('Wed 2026-11-11 | 08:15 | 17:00 |      – |      – |  FAULTY')
  expect(shared.text).toContain('see the attached file clocked_2026-11-09_2026-11-15.csv')
})

test('fallback: downloads the CSV and opens a mail draft where files cannot be shared', async ({ page }) => {
  await page.addInitScript(() => {
    // Desktop-like: no file sharing (the mailto: draft itself is covered by unit tests).
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
  await openAppAt(page, NOW)
  await seedWeek(page)
  await openShare(page)
  await page.getByRole('button', { name: 'This month' }).click()
  await expect(page.getByLabel('From')).toHaveValue('2026-11-01')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Share', exact: true }).last().click(),
  ])
  expect(download.suggestedFilename()).toBe('clocked_2026-11-01_2026-11-18.csv')
  const path = await download.path()
  const content = (await import('node:fs')).readFileSync(path!, 'utf-8')
  expect(content.split('\r\n')).toHaveLength(1 + 18 + 1 + 1) // header, 18 days, TOTAL, trailing newline
  await expect(page.getByRole('status')).toContainText('attach it to the mail draft')
})

test('faulty day: "Fix" jumps to it in the calendar', async ({ page }) => {
  await openAppAt(page, NOW)
  await seedWeek(page)
  await openShare(page)
  await page.getByRole('button', { name: 'Last week' }).click()
  await page.getByRole('button', { name: 'Fix 2026-11-11' }).click()
  await expect(page.getByRole('dialog', { name: 'Share working times' })).toBeHidden()
  await expect(page.getByRole('button', { name: '2026-11-11, faulty' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('faulty-day-list')).toContainText('Two clock-ins in a row')
})
