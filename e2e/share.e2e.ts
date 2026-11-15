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

test('fallback: opens a mail draft with the table and creates no file', async ({ page }) => {
  await page.addInitScript(() => {
    // Desktop-like: no Web Share. Capture the mailto: link instead of launching a mail app.
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    document.addEventListener('click', e => {
      const a = (e.target as Element | null)?.closest?.('a[href^="mailto:"]') as HTMLAnchorElement | null
      if (!a) return
      e.preventDefault()
      ;(window as unknown as { __mailto: string }).__mailto = a.href
    }, true)
  })
  await openAppAt(page, NOW)
  await seedWeek(page)
  await openShare(page)
  await page.getByRole('button', { name: 'Last week' }).click()
  await expect(page.getByTestId('share-worked')).toHaveText('08:00')

  let downloaded = false
  page.on('download', () => { downloaded = true })
  await page.getByRole('button', { name: 'Share', exact: true }).last().click()
  await expect(page.getByRole('status')).toContainText('Opened a mail draft with the table')

  const url = await page.evaluate(() => (window as unknown as { __mailto: string }).__mailto)
  const params = new URLSearchParams(url.replace(/^mailto:\?/, '').replace(/\+/g, '%2B'))
  expect(params.get('subject')).toBe('Working times 2026-11-09 – 2026-11-15')
  const body = params.get('body')!
  expect(body).toContain('Day            | In    | Out   | Worked | Breaks | Balance')
  expect(body).toContain('Mon 2026-11-09 | 08:00 | 16:30 |  08:00 |  00:30 |  ±00:00')
  expect(body).toContain('Wed 2026-11-11 | 08:15 | 17:00 |      – |      – |  FAULTY')
  expect(body).not.toContain('attached')
  expect(downloaded).toBe(false)
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

test('"Download CSV" saves the CSV for the chosen range', async ({ page }) => {
  await openAppAt(page, NOW)
  await seedWeek(page)
  await openShare(page)
  await page.getByRole('button', { name: 'Last week' }).click()
  await expect(page.getByTestId('share-worked')).toHaveText('08:00')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('clocked_2026-11-09_2026-11-15.csv')
  const bytes = (await import('node:fs')).readFileSync((await download.path())!)
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const lines = bytes.toString('utf-8').replace(/^\uFEFF/, '').trimEnd().split('\r\n')
  expect(lines).toHaveLength(1 + 7 + 1) // header, 7 days, TOTAL
  expect(lines[1]).toBe('2026-11-09;Mon;ok;08:00;16:30;08:00;00:30;on target;480;30;0;in 08:00, out 12:00, in 12:30, out 16:30')
  await expect(page.getByRole('status')).toContainText('Saved clocked_2026-11-09_2026-11-15.csv.')
  await expect(page.getByRole('dialog', { name: 'Share working times' })).toBeVisible()
})

