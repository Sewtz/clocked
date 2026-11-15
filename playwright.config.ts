import { defineConfig, devices } from '@playwright/test'

// End-to-end scenarios against the production build (real IndexedDB + service worker).
// Builds into dist-e2e/ and serves on its own port so it never touches dist/ or a
// running `pnpm preview` (IndexedDB is per origin, so this port has its own data).
const PORT = 4175

// One timezone for both sides: the browser (timezoneId) and the Node test runner,
// whose helpers build wall-clock times like `new Date('2026-11-16T08:00:00')`.
// Without this the runner uses the machine's zone (UTC on CI) and every time is off.
// Node picks up a TZ change at runtime; workers re-evaluate this config, so they match too.
const TIMEZONE = 'Europe/Berlin'
process.env.TZ = TIMEZONE

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Fixed zone so "midnight" and HH:MM assertions are deterministic.
    timezoneId: TIMEZONE,
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `vite build --outDir dist-e2e --emptyOutDir && vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
