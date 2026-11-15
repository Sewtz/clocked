import { expect, type Page } from '@playwright/test'

/** Local wall-clock time on the test day (timezone pinned in playwright.config.ts). */
export const DAY = '2026-11-16' // a Monday
export const at = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00`)

/** Seconds since midnight for 'HH:MM'. */
export const sec = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 3600 + m * 60
}

/** Freeze the browser clock at `time` and open the app. Use page.clock.* to move time. */
export async function openAppAt(page: Page, time: Date) {
  await page.clock.install({ time })
  await page.goto('/')
  await waitUntilReady(page)
}

export async function waitUntilReady(page: Page) {
  await expect(page.getByText('TIMECLOCK')).toBeVisible()
  await page.waitForFunction(() => window.__clocked?.state.settings !== null)
}

/**
 * Jump the frozen clock to `time`. Due timers (the 1 s tick) fire once, like a phone
 * waking up; we don't replay every tick in between (runFor would, and is far too slow
 * for hour-long jumps).
 */
export async function advanceTo(page: Page, time: Date) {
  await page.clock.fastForward(time.getTime() - (await page.evaluate(() => Date.now())))
}

export const stat = (page: Page, name: 'worked' | 'breaks') => page.getByTestId(`stat-${name}`)

export async function viewState(page: Page) {
  return page.evaluate(() => window.__clocked.state.viewState)
}

/** In the open day editor: add an event of `type` at `hhmm`. */
export async function addEvent(page: Page, type: 'in' | 'out', hhmm: string) {
  await page.getByRole('group', { name: 'New event type' }).getByRole('button', { name: type, exact: true }).click()
  await page.getByLabel('New event time').fill(hhmm)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

/** Rows of the open day editor as 'in 08:00' strings. */
export async function editorRows(page: Page) {
  const rows = page.getByTestId('event-row')
  const out: string[] = []
  for (const row of await rows.all()) {
    const label = (await row.locator('span').first().textContent())?.trim()
    const time = await row.locator('input[type="time"]').inputValue()
    out.push(`${label === 'Clocked in' ? 'in' : 'out'} ${time}`)
  }
  return out
}
