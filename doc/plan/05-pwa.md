# WP5 — PWA wiring

Goal: make the app genuinely installable on Android and iOS, with real icons, a complete manifest, and a verified service worker.

WP0-T10 already wired `vite-plugin-pwa` with placeholder icons. This WP replaces placeholders with real assets, finalizes manifest fields, and verifies the SW end-to-end.

**Strict order:** T1 → T2 → ... → T5.

---

## WP5-T1 — Finalize vite-plugin-pwa config

- **Goal:** Lock down the manifest and Workbox config.
- **Files:** `vite.config.ts`.
- **Approach:** Update the `VitePWA({...})` block:
  ```ts
  VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'icons/apple-touch-icon-180.png'],
    manifest: {
      name: 'Clocked',
      short_name: 'Clocked',
      description: 'Personal work-time tracker. Fully local, no backend.',
      theme_color: '#dc2626',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      lang: 'en',
      icons: [
        { src: '/icons/icon-192.png',  sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png',  sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
    },
    devOptions: { enabled: false },
  })
  ```
- **Dependencies:** WP0-T10.
- **Acceptance criteria:**
  - `pnpm build` emits `dist/manifest.webmanifest` with all the fields above.
  - `dist/sw.js` references the precache list with all app-shell assets.
- **V&V:** `pnpm build && pnpm preview`. In DevTools → Application → Manifest, all fields should be present and icons should render.
- **Pitfalls:**
  - `orientation: 'portrait'` matches the app's single-column design.
  - `includeAssets` makes Workbox precache the apple-touch-icon and favicon too — important for iOS home-screen.

---

## WP5-T2 — iOS PWA meta tags verification

- **Goal:** Confirm `index.html` (from WP0-T9) has all the iOS-specific tags.
- **Files:** `index.html` (re-read and verify).
- **Approach:** The head should contain (from WP0-T9):
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
  - `<meta name="apple-mobile-web-app-title" content="Clocked" />`
  - `<meta name="theme-color" content="#dc2626" />`
  - `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />`
  - `<link rel="manifest" href="/manifest.webmanifest" />`
  - `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />`
  
  If any are missing, add them. If `vite-plugin-pwa` injects its own manifest link at build time, that's fine — both links can coexist (or you can rely solely on the plugin's).
- **Dependencies:** WP0-T9.
- **Acceptance criteria:**
  - All tags present in `dist/index.html` after `pnpm build`.
- **V&V:** `pnpm build` then read `dist/index.html`; or `pnpm preview` and inspect in DevTools.
- **Pitfalls:**
  - `apple-mobile-web-app-status-bar-style: 'default'` uses the system status bar appearance. `'black-translucent'` makes the app extend under the status bar — requires safe-area inset handling (we set `viewport-fit=cover` for this; the layout must use `env(safe-area-inset-*)` — addressed in WP6).

---

## WP5-T3 — Generate real icons

- **Goal:** Replace the placeholder PNGs in `public/icons/` with real Clocked icons.
- **Files:** `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/apple-touch-icon-180.png`, `public/icons/favicon.ico`.
- **Approach:** Create a single source SVG and rasterize to the required sizes. The icon design:
  - A solid red (`#dc2626`) rounded square background.
  - A white clock face or "C" letter centered.
  - For the maskable variant: add padding (safe zone ~80%) so the design survives Android's mask shapes (circle, squircle, etc.).
  - For the apple-touch-icon: 180×180, no transparency (iOS adds its own rounded corners).
  
  Use `sharp` (Node lib) or `pwa-asset-generator` to generate:
  ```bash
  pnpm add -D pwa-asset-generator
  # put a source SVG at public/icons/source.svg
  pnpm exec pwa-asset-generator public/icons/source.svg public/icons --type png --opaque false
  ```
  Or use any image editor and commit the final PNGs directly. The `pwa-asset-generator` approach can also emit the apple-touch-icon and favicon.
  
  Sample `public/icons/source.svg`:
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="96" fill="#dc2626"/>
    <circle cx="256" cy="256" r="140" fill="none" stroke="#fff" stroke-width="20"/>
    <line x1="256" y1="256" x2="256" y2="140" stroke="#fff" stroke-width="20" stroke-linecap="round"/>
    <line x1="256" y1="256" x2="340" y2="256" stroke="#fff" stroke-width="20" stroke-linecap="round"/>
  </svg>
  ```
- **Dependencies:** WP0-T10.
- **Acceptance criteria:**
  - All five PNG/ICO files exist with the correct pixel dimensions.
  - The maskable icon has the design within the inner 80% (safe zone).
  - The favicon is a valid ICO (or a PNG referenced by `<link rel="icon" type="image/png">`).
  - `pnpm build` includes all icons in the precache list.
- **V&V:** `pnpm build && pnpm preview`. In DevTools → Application → Manifest, all icons should render with correct sizes. On Android Chrome's "Add to Home screen" preview, the icon should appear.
- **Pitfalls:**
  - Maskable icons **without** the safe-zone padding get clipped by Android's circle/squircle masks — the clock hands may disappear. Test by adding to an Android home screen.
  - iOS ignores `purpose: 'maskable'` and uses `apple-touch-icon` instead — that's why both must exist.
  - PNGs must not have alpha for the apple-touch-icon (iOS will render black where transparent).

---

## WP5-T4 — Service worker registration verification

- **Goal:** Confirm the SW registers, activates, and caches the app shell on `pnpm preview`.
- **Files:** none (verification only).
- **Approach:**
  1. `pnpm build`
  2. `pnpm preview` (serves on `http://localhost:4173`)
  3. Open in Chrome / Edge desktop.
  4. DevTools → Application → Service Workers:
     - Status should show "activated and is running".
     - "Update on reload" should be off (we use `autoUpdate`).
  5. DevTools → Application → Cache Storage:
     - `workbox-precache-v2-...` should contain `index.html`, all JS, all CSS, all icons.
  6. DevTools → Network → Offline, then reload the page.
     - The app should still load and render.
  7. Click the install icon in the address bar (or `⋮` → Install).
     - The install prompt should show "Clocked" with the red icon.
     - After install, the app opens in a standalone window.
- **Dependencies:** WP5-T1, WP5-T2, WP5-T3.
- **Acceptance criteria:**
  - All manual checks above pass.
- **V&V:** the procedure itself is the V&V.
- **Pitfalls:**
  - If the SW doesn't activate, check that `pnpm preview` is serving on `localhost` (not `0.0.0.0` or an IP). SWs require a secure context; `localhost` qualifies.
  - The first reload after `pnpm build` may serve the old SW until the new one activates. `autoUpdate` triggers a reload prompt; for testing, "Update on reload" in DevTools forces the new SW immediately.
  - If offline mode shows a blank page, the precache list is missing `index.html` — check `globPatterns` includes `**/*.html`.

---

## WP5-T5 — Real-device PWA smoke test

- **Goal:** Verify installability on an actual Android and iOS device (or emulator), not just desktop Chrome.
- **Files:** none.
- **Approach:**
  - Run `pnpm preview --host` so the dev server is reachable on the LAN.
  - On Android: open Chrome on the phone, navigate to `http://<your-lan-ip>:4173/`, wait for the install prompt or use `⋮ → Add to Home screen`. Open the resulting icon — should launch standalone.
  - On iOS: open Safari, navigate to the same URL, `Share → Add to Home Screen`. Open the icon — should launch standalone (no Safari chrome).
  - On both: install, then disable network (airplane mode), open the installed app — should still load and let you clock in.
- **Dependencies:** WP5-T4.
- **Acceptance criteria:**
  - App installs on both platforms.
  - Standalone mode works (no browser chrome).
  - Airplane-mode launch works (loads from SW cache).
- **V&V:** the procedure itself.
- **Pitfalls:**
  - For iOS testing over HTTP (not HTTPS), Safari may refuse to install. Workarounds:
    - Use Chrome's port-forwarding over USB (`chrome://inspect`).
    - Or use a tunnel like `ngrok` (HTTPS) just for the test.
  - iOS limits SW cache size; our app is tiny, so this shouldn't matter, but if the install fails, check the Storage section in Safari's web inspector.

---

## End of WP5

Once WP5-T5 passes, the app is genuinely installable and offline-capable on Android and iOS. Proceed to `06-styling.md` for visual polish.
